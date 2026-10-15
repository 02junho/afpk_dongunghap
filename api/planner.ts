/**
 * 설계사 콘솔 API (Vercel edge). service_role 로 읽고 쓴다 — 설계사만 판정을 본다.
 *
 * 인증은 임시로 PLANNER_PASSCODE 하나다 (3주 범위). Supabase 이메일 로그인 + is_my_client() RLS 는
 * docs/00 P0-4 — 시간이 나면 그걸로 바꾸고 이 파일의 passcode 검사를 auth 검사로 교체한다.
 *
 *   POST /api/planner { passcode, action:'queue' }                                  → 처리 대기 목록
 *   POST /api/planner { passcode, action:'resolve', judgmentId, resolution, note? }  → 큐 닫기
 *   POST /api/planner { passcode, action:'rounds' }                                  → 라운드 목록
 *   POST /api/planner { passcode, action:'new_round' }                               → 0회차 다시 열기 (리허설용)
 */
import { serviceClient } from './judge'

export const config = { runtime: 'edge' }

const DEMO_COUPLE = '00000000-0000-0000-0000-000000000010'
const RESOLUTIONS = ['factcheck', 'consult', 'false_positive'] as const

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return bad('POST only', 405)
  let body: any
  try { body = await req.json() } catch { return bad('JSON 파싱 실패') }

  const pass = process.env.PLANNER_PASSCODE
  if (!pass) return bad('PLANNER_PASSCODE 가 설정되지 않았습니다', 500)
  if (typeof body.passcode !== 'string' || body.passcode !== pass) return bad('설계사 코드가 틀립니다', 401)

  const sb = serviceClient()
  if (!sb) return bad('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다', 500)
  const coupleId: string = typeof body.coupleId === 'string' ? body.coupleId : DEMO_COUPLE

  switch (body.action) {
    case 'queue': {
      const { data: rows, error } = await sb.from('planner_queue').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false })
      if (error) return bad(error.message, 500)
      const ids = [...new Set((rows ?? []).map(r => r.card_version_id))]
      const { data: cvs } = ids.length
        ? await sb.from('card_versions').select('id, label, question, planned_value, stake, cards!inner(type, unit)').in('id', ids)
        : { data: [] as any[] }
      const cvById = new Map((cvs ?? []).map(cv => [cv.id, cv]))
      const items = (rows ?? []).map(r => {
        const cv = cvById.get(r.card_version_id)
        return {
          id: r.id,
          roundKind: r.round_kind,
          key: r.key,
          category: r.category,
          label: cv?.label ?? r.key,
          question: cv?.question ?? '',
          planned: cv?.planned_value ?? '',
          stake: cv?.stake ?? '',
          type: cv?.cards?.type,
          unit: cv?.cards?.unit ?? null,
          verdict: r.verdict,
          redKind: r.red_kind,
          needsReview: r.needs_review,
          method: r.method,
          promptVersion: r.prompt_version,
          a: r.a_text,
          b: r.b_text,
          reason: r.reason,
          summary: r.planner_summary,
          createdAt: r.created_at,
        }
      })
      return Response.json({ items })
    }
    case 'resolve': {
      const { judgmentId, resolution, note } = body
      if (typeof judgmentId !== 'string' || !RESOLUTIONS.includes(resolution)) return bad('judgmentId / resolution')
      const { error } = await sb.from('judgments')
        .update({ resolved_at: new Date().toISOString(), resolution, resolution_note: typeof note === 'string' ? note : null })
        .eq('id', judgmentId).is('resolved_at', null)
      if (error) return bad(error.message, 500)
      if (resolution === 'false_positive') {
        // 전문가 라벨 — golden 후보. 스냅샷을 같이 남긴다
        const { data: j } = await sb.from('judgments').select('method, verdict').eq('id', judgmentId).maybeSingle()
        const { data: planner } = await sb.from('planners').select('id').limit(1).maybeSingle()
        if (planner) await sb.from('disputes').insert({ judgment_id: judgmentId, planner_id: planner.id, note: note ?? null, judgment_method: j?.method ?? null, judgment_verdict: j?.verdict ?? null })
      }
      return Response.json({ ok: true })
    }
    case 'rounds': {
      const { data, error } = await sb.from('rounds').select('id, kind, status, opened_at, judged_at, card_version_ids').eq('couple_id', coupleId).order('opened_at', { ascending: false })
      if (error) return bad(error.message, 500)
      return Response.json({ rounds: data })
    }
    case 'new_round': {
      // 리허설용: 직전 0회차와 같은 카드로 새 라운드를 연다. 열린 라운드가 있으면 그걸 돌려준다.
      const { data: open } = await sb.from('rounds').select('id').eq('couple_id', coupleId).eq('status', 'open').limit(1)
      if (open?.length) return Response.json({ roundId: open[0].id, reused: true })
      const { data: last } = await sb.from('rounds').select('card_version_ids').eq('couple_id', coupleId).eq('kind', 'baseline').order('opened_at', { ascending: false }).limit(1)
      const ids = last?.[0]?.card_version_ids
      if (!ids?.length) return bad('기준이 될 0회차가 없습니다', 404)
      const { data: r, error } = await sb.from('rounds').insert({ couple_id: coupleId, kind: 'baseline', card_version_ids: ids }).select('id').single()
      if (error) return bad(error.message, 500)
      return Response.json({ roundId: r.id })
    }
    default:
      return bad('action')
  }
}
