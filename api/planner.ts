/**
 * 설계사 콘솔 API (Vercel edge). service_role 로 읽고 쓴다 — 설계사만 판정을 본다.
 *
 * 인증은 임시로 PLANNER_PASSCODE 하나다 (3주 범위). Supabase 이메일 로그인 + is_my_client() RLS 는
 * docs/00 P0-4 — 시간이 나면 그걸로 바꾸고 이 파일의 passcode 검사를 auth 검사로 교체한다.
 *
 *   { passcode, action, coupleId? , ... }
 *   couples                                   담당 커플 목록 (진행 상태·대기 건수)
 *   new_couple { label, husband, wife }       커플 + 입장 코드 발급 + 기본 카드 10장(데모 세트) + 0회차
 *   queue                                     처리 대기 (🔴 + 확인 필요)
 *   resolve { judgmentId, resolution, note }  큐 닫기. false_positive 는 disputes 에도 기록
 *   cards                                     카드 최신 버전 (동의 대기 포함)
 *   save_card { cardId, plannedValue, tolerance?, allowCondition?, reason }
 *                                             새 버전(v+1, 동의 대기) + 그 카드 1장짜리 factcheck 라운드
 *   history                                   변경 이력 (card_versions)
 *   rounds / new_round                        라운드 목록 / 0회차 다시 열기 (리허설)
 */
import { serviceClient } from './judge'

export const config = { runtime: 'edge' }

const DEMO_COUPLE = '00000000-0000-0000-0000-000000000010'
const RESOLUTIONS = ['factcheck', 'consult', 'false_positive'] as const
/** 0회차가 묻는 순서. 주거 → 소득 → 양가 (src/data/demo.ts BASELINE 과 같다) */
const BASELINE_KEYS = ['home_when', 'raise_plan', 'family_help']

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

type SB = NonNullable<ReturnType<typeof serviceClient>>

async function plannerId(sb: SB): Promise<string | null> {
  const { data } = await sb.from('planners').select('id').limit(1).maybeSingle()
  return data?.id ?? null
}

/** 6자리 입장 코드. unique 충돌이면 다시 뽑는다 */
async function newInviteCode(sb: SB): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(100000 + Math.floor(Math.random() * 900000))
    const { data } = await sb.from('couples').select('id').eq('invite_code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('코드 발급 실패')
}

/** 0회차 라운드를 연다 (활성 버전 중 BASELINE 3장, 묻는 순서대로) */
async function openBaseline(sb: SB, coupleId: string) {
  const { data: active } = await sb.from('active_cards').select('id, key').eq('couple_id', coupleId).in('key', BASELINE_KEYS)
  const byKey = new Map((active ?? []).map(c => [c.key, c.id]))
  const ids = BASELINE_KEYS.map(k => byKey.get(k)).filter(Boolean)
  if (ids.length !== BASELINE_KEYS.length) throw new Error('0회차 카드(활성 버전)가 모자랍니다')
  const { data, error } = await sb.from('rounds').insert({ couple_id: coupleId, kind: 'baseline', card_version_ids: ids }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
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
  const coupleId: string = typeof body.coupleId === 'string' && body.coupleId ? body.coupleId : DEMO_COUPLE

  try {
    switch (body.action) {
      // ── 커플 ──────────────────────────────────────────────────────────
      case 'couples': {
        const [{ data: couples }, { data: members }, { data: rounds }, { data: queue }] = await Promise.all([
          sb.from('couples').select('id, label, invite_code, created_at').order('created_at', { ascending: true }),
          sb.from('members').select('couple_id, role, display_name'),
          sb.from('rounds').select('couple_id, kind, status, opened_at, judged_at').order('opened_at', { ascending: false }),
          sb.from('planner_queue').select('couple_id'),
        ])
        const items = (couples ?? []).map(c => {
          const ms = (members ?? []).filter(m => m.couple_id === c.id)
          const rs = (rounds ?? []).filter(r => r.couple_id === c.id)
          const open = rs.find(r => r.status === 'open')
          const judgedCount = rs.filter(r => r.status === 'judged').length
          const last = rs.find(r => r.judged_at)?.judged_at ?? null
          const state = open
            ? (open.kind === 'baseline' ? '0회차 진행 중' : open.kind === 'factcheck' ? '먼저 묻기 진행 중' : '정기 진행 중')
            : judgedCount === 0 ? '설계 직후 · 0회차 대기' : `${judgedCount}회 완료`
          return {
            id: c.id, label: c.label, code: c.invite_code, createdAt: c.created_at,
            husband: ms.find(m => m.role === 'husband')?.display_name ?? '남편',
            wife: ms.find(m => m.role === 'wife')?.display_name ?? '아내',
            state, lastAt: last,
            pending: (queue ?? []).filter(q => q.couple_id === c.id).length,
          }
        })
        return Response.json({ items })
      }
      case 'new_couple': {
        const label = String(body.label ?? '').trim()
        const husband = String(body.husband ?? '').trim() || '남편'
        const wife = String(body.wife ?? '').trim() || '아내'
        if (!label) return bad('두 분 이름이 필요합니다')
        const pid = await plannerId(sb)
        const code = await newInviteCode(sb)
        const { data: couple, error } = await sb.from('couples').insert({ planner_id: pid, invite_code: code, label }).select('id').single()
        if (error) return bad(error.message, 500)
        await sb.from('members').insert([
          { couple_id: couple.id, role: 'husband', display_name: husband },
          { couple_id: couple.id, role: 'wife', display_name: wife },
        ])
        // 데모 세트: 김현우·박지우의 활성 카드 10장을 v1 로 복사 (설계안→카드 추출 UI 는 공모전 후)
        if (body.cloneDemoCards !== false) {
          const { data: src } = await sb.from('active_cards').select('*').eq('couple_id', DEMO_COUPLE)
          for (const s of src ?? []) {
            const { data: card } = await sb.from('cards').insert({ couple_id: couple.id, key: s.key, type: s.type, category: s.category, unit: s.unit }).select('id').single()
            if (!card) continue
            await sb.from('card_versions').insert({
              card_id: card.id, version: 1, label: s.label, question: s.question, planned_value: s.planned_value,
              tolerance: s.tolerance, options: s.options, allow_condition: s.allow_condition, stake: s.stake,
              reason: '최초 설정 (데모 세트)', created_by: pid, activated_at: new Date().toISOString(),
            })
          }
          await openBaseline(sb, couple.id)
        }
        return Response.json({ coupleId: couple.id, code })
      }

      // ── 큐 ────────────────────────────────────────────────────────────
      case 'queue': {
        const { data: rows, error } = await sb.from('planner_queue').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false })
        if (error) return bad(error.message, 500)
        const ids = [...new Set((rows ?? []).map(r => r.card_version_id))]
        const { data: cvs } = ids.length
          ? await sb.from('card_versions').select('id, card_id, label, question, planned_value, stake, cards!inner(type, unit)').in('id', ids)
          : { data: [] as any[] }
        const cvById = new Map((cvs ?? []).map(cv => [cv.id, cv]))
        const items = (rows ?? []).map(r => {
          const cv = cvById.get(r.card_version_id)
          return {
            id: r.id, cardId: cv?.card_id ?? r.card_id, roundKind: r.round_kind, key: r.key, category: r.category,
            label: cv?.label ?? r.key, question: cv?.question ?? '', planned: cv?.planned_value ?? '', stake: cv?.stake ?? '',
            type: cv?.cards?.type, unit: cv?.cards?.unit ?? null,
            verdict: r.verdict, redKind: r.red_kind, needsReview: r.needs_review, method: r.method, promptVersion: r.prompt_version,
            a: r.a_text, b: r.b_text, reason: r.reason, summary: r.planner_summary, createdAt: r.created_at,
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
          const { data: j } = await sb.from('judgments').select('method, verdict').eq('id', judgmentId).maybeSingle()
          const pid = await plannerId(sb)
          if (pid) await sb.from('disputes').insert({ judgment_id: judgmentId, planner_id: pid, note: note ?? null, judgment_method: j?.method ?? null, judgment_verdict: j?.verdict ?? null })
        }
        return Response.json({ ok: true })
      }

      // ── 카드 ──────────────────────────────────────────────────────────
      case 'cards': {
        const { data, error } = await sb.from('latest_cards').select('*').eq('couple_id', coupleId)
        if (error) return bad(error.message, 500)
        return Response.json({ cards: data })
      }
      case 'save_card': {
        const { cardId, reason } = body
        if (typeof cardId !== 'string' || typeof reason !== 'string' || !reason.trim()) return bad('cardId / reason(필수)')
        const { data: cur, error: e1 } = await sb.from('latest_cards').select('*').eq('id', cardId).maybeSingle()
        // latest_cards.id 는 card_versions.id 다 — card_id 로 다시 찾는다
        const { data: latest, error: e2 } = e1 || cur ? { data: cur, error: e1 } : await sb.from('latest_cards').select('*').eq('card_id', cardId).maybeSingle()
        if (e2) return bad(e2.message, 500)
        if (!latest) return bad('카드 없음', 404)
        if (latest.pending) return bad('이미 동의 대기 중인 버전이 있습니다. 두 분이 답한 뒤에 다시 고치세요')
        const plannedValue = body.plannedValue == null ? latest.planned_value : String(body.plannedValue)
        const tolerance = body.tolerance == null ? latest.tolerance : Number(body.tolerance)
        const allowCondition = body.allowCondition == null ? latest.allow_condition : !!body.allowCondition
        const pid = await plannerId(sb)
        const { data: v, error: e3 } = await sb.from('card_versions').insert({
          card_id: latest.card_id, version: latest.version + 1, label: latest.label, question: latest.question,
          planned_value: plannedValue, tolerance, options: latest.options, allow_condition: allowCondition, stake: latest.stake,
          reason: reason.trim(), created_by: pid, activated_at: null,
        }).select('id, version').single()
        if (e3) return bad(e3.message, 500)
        // ★ 그 카드 하나로 '먼저 묻기' 라운드. 둘 다 답하고 새 전제와 맞으면 /api/judge 가 activated_at 을 찍는다
        const { data: r, error: e4 } = await sb.from('rounds').insert({ couple_id: latest.couple_id, kind: 'factcheck', card_version_ids: [v.id] }).select('id').single()
        if (e4) return bad(e4.message, 500)
        return Response.json({ versionId: v.id, version: v.version, roundId: r.id })
      }
      case 'history': {
        const { data: cards } = await sb.from('cards').select('id, key, type').eq('couple_id', coupleId)
        const ids = (cards ?? []).map(c => c.id)
        if (!ids.length) return Response.json({ items: [] })
        const { data: vs, error } = await sb.from('card_versions').select('id, card_id, version, label, planned_value, reason, created_at, activated_at').in('card_id', ids).order('created_at', { ascending: false })
        if (error) return bad(error.message, 500)
        const prev = new Map<string, string>()
        const sorted = [...(vs ?? [])].sort((a, b) => a.version - b.version)
        const prevOf = new Map<string, string>()
        for (const v of sorted) { prevOf.set(v.id, prev.get(v.card_id) ?? '—'); prev.set(v.card_id, v.planned_value) }
        return Response.json({
          items: (vs ?? []).map(v => ({
            id: v.id, label: v.label, version: v.version, from: prevOf.get(v.id), to: v.planned_value,
            reason: v.reason, at: v.created_at, active: !!v.activated_at,
          })),
        })
      }

      // ── 라운드 ────────────────────────────────────────────────────────
      case 'rounds': {
        const { data, error } = await sb.from('rounds').select('id, kind, status, opened_at, judged_at, card_version_ids').eq('couple_id', coupleId).order('opened_at', { ascending: false })
        if (error) return bad(error.message, 500)
        return Response.json({ rounds: data })
      }
      case 'new_round': {
        const { data: open } = await sb.from('rounds').select('id').eq('couple_id', coupleId).eq('status', 'open').limit(1)
        if (open?.length) return Response.json({ roundId: open[0].id, reused: true })
        return Response.json({ roundId: await openBaseline(sb, coupleId) })
      }
      default:
        return bad('action')
    }
  } catch (e) {
    return bad((e as Error).message, 500)
  }
}
