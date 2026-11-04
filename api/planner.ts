/**
 * 설계사 콘솔 API (Vercel edge). service_role 로 읽고 쓴다 — 설계사만 판정을 본다.
 *
 * 인증은 임시로 PLANNER_PASSCODE 하나다 (3주 범위). Supabase 이메일 로그인 + is_my_client() RLS 는
 * docs/00 P0-4 — 시간이 나면 그걸로 바꾸고 이 파일의 passcode 검사를 auth 검사로 교체한다.
 *
 *   { passcode, action, coupleId? , ... }
 *   couples                                   담당 커플 목록 (진행 상태·대기 건수)
 *   new_couple { label, husband, wife }       커플 + 입장 코드 발급 + 기본 카드 10장(데모 세트) + 0회차
 *   extract_cards { sheetText }               표가 아닌 엑셀 글 → 질문 카드 초안 (AI, 저장 안 함). 11.04 꺼짐 — ENABLE_SHEET_AI=1 일 때만
 *   archive_couple / restore_couple           부부 지우기(보관) · 되돌리기. 기록은 지우지 않는다
 *   rename_couple { husband, wife, label? }   이름 고치기 (label 은 설계사 화면용, 비우면 "남편 · 아내")
 *   queue                                     처리 대기 (🔴 + 확인 필요)
 *   resolve { judgmentId, resolution, note }  큐 닫기. false_positive 는 disputes 에도 기록
 *   cards                                     카드 최신 버전 (동의 대기 포함). awaiting = 열린 라운드에서 답을 기다리는 중
 *   save_card { cardId, plannedValue, tolerance?, allowCondition?, reason }
 *                                             새 버전(v+1, 동의 대기) + 그 카드 1장짜리 factcheck 라운드
 *   add_card { card, askNow?, sourceKey? }    새 카드 + v1(바로 전제). askNow 면 그 1장으로 정기 라운드. sourceKey = 엑셀 자리(xl:표|항목)
 *   apply_sheet_value { cardId, plannedValue, reason }
 *                                             엑셀 다시 읽기에서 바뀐 숫자 → 새 버전(v+1, 바로 전제). 설계사가 엑셀에서 다시 설계한 값이다
 *   notices / resolve_notice { noticeId, resolution, note }
 *                                             부부가 먼저 알린 변화 ("바뀐 게 있어요", 11.04). factcheck = 두 분께 같이 묻기(정기 1문항)
 *   history                                   변경 이력 (card_versions)
 *   rounds / new_round                        라운드 목록 / 0회차 다시 열기 (리허설)
 */
import { extractCardDrafts, serviceClient, summarizeJudgment } from './judge'
import { newCardKey, normalizeNewCard } from '../src/lib/card-form'

export const config = { runtime: 'edge' }

const DEMO_COUPLE = '00000000-0000-0000-0000-000000000010'
// replan = 재설계 필요 (10.23 팀 결정). DB enum 에 없으면 supabase/patch-2026-10-23-replan.sql 을 먼저 실행
const RESOLUTIONS = ['replan', 'factcheck', 'consult', 'false_positive'] as const
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

/**
 * 지금 열린 라운드가 묻고 있는 카드 버전들. "동의 대기"는 이 안에 있을 때만이다.
 * 먼저 묻기가 판정까지 끝났는데 🟢 가 아니면 그 버전은 활성화되지 않은 채 남는다 —
 * 그때는 대기가 아니라 "동의 안 됨"이고, 설계사가 다시 고칠 수 있어야 한다 (E2E 10.18 에서 발견).
 */
async function openVersionIds(sb: SB, coupleId: string): Promise<Set<string>> {
  const { data } = await sb.from('rounds').select('card_version_ids').eq('couple_id', coupleId).eq('status', 'open')
  return new Set((data ?? []).flatMap(r => r.card_version_ids as string[]))
}

const NOTICE_PATCH = 'DB 에 "바뀐 게 있어요" 표가 아직 없습니다 — supabase/patch-2026-11-04-change-notices.sql 을 SQL Editor 에서 한 번 실행해 주세요'
const noTable = (m: string) => /change_notices/.test(m) && /does not exist|schema cache|Could not find/.test(m)

/** 0회차 라운드를 연다 (활성 버전 중 BASELINE 3장, 묻는 순서대로) */
async function openBaseline(sb: SB, coupleId: string) {
  const { data: active } = await sb.from('active_cards').select('id, key').eq('couple_id', coupleId).in('key', BASELINE_KEYS)
  const byKey = new Map((active ?? []).map(c => [c.key, c.id]))
  const ids = BASELINE_KEYS.map(k => byKey.get(k)).filter(Boolean)
  if (ids.length !== BASELINE_KEYS.length)
    throw new Error('첫 맞춰보기에 쓰는 카드(주택 취득 시점 · 승진·이직 계획 · 양가 지원)가 없어 맞춰보기를 열 수 없습니다. 카드를 골라 여는 기능은 준비 중입니다')
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
        const [{ data: couples }, { data: members }, { data: rounds }, { data: queue }, { data: cardRows }, { data: notices }] = await Promise.all([
          sb.from('couples').select('*').order('created_at', { ascending: true }),
          sb.from('members').select('couple_id, role, display_name'),
          sb.from('rounds').select('id, couple_id, kind, status, opened_at, judged_at').order('opened_at', { ascending: false }),
          sb.from('planner_queue').select('couple_id'),
          sb.from('cards').select('couple_id').is('archived_at', null),
          // 패치 전이면 표가 없다 → 오류는 무시하고 0건으로
          sb.from('change_notices').select('couple_id').is('resolved_at', null),
        ])
        // 열린 맞춰보기에 답이 하나라도 있으면 "진행 중", 없으면 "시작 전" (10.25: 아무도 안 답했는데 진행 중으로 보였다)
        const openIds = (rounds ?? []).filter(r => r.status === 'open').map(r => r.id)
        const { data: openAnswers } = openIds.length
          ? await sb.from('answers').select('round_id').in('round_id', openIds)
          : { data: [] as { round_id: string }[] }
        const answered = new Set((openAnswers ?? []).map(a => a.round_id))
        const items = (couples ?? []).map(c => {
          const ms = (members ?? []).filter(m => m.couple_id === c.id)
          const rs = (rounds ?? []).filter(r => r.couple_id === c.id)
          const open = rs.find(r => r.status === 'open')
          const judgedCount = rs.filter(r => r.status === 'judged').length
          const last = rs.find(r => r.judged_at)?.judged_at ?? null
          const kindLabel = open ? (open.kind === 'baseline' ? '첫 맞춰보기' : open.kind === 'factcheck' ? '먼저 묻기' : '정기 맞춰보기') : ''
          const hasCards = (cardRows ?? []).some(x => x.couple_id === c.id)
          const state = open
            ? `${kindLabel} ${answered.has(open.id) ? '진행 중' : '시작 전'}`
            : judgedCount > 0 ? `맞춰보기 ${judgedCount}회 완료`
            : hasCards ? '첫 맞춰보기 대기' : '질문 카드 준비 중'
          return {
            id: c.id, label: c.label, code: c.invite_code, createdAt: c.created_at,
            husband: ms.find(m => m.role === 'husband')?.display_name ?? '남편',
            wife: ms.find(m => m.role === 'wife')?.display_name ?? '아내',
            state, lastAt: last,
            pending: [...(queue ?? []), ...(notices ?? [])].filter(q => q.couple_id === c.id).length,
            archivedAt: (c as { archived_at?: string | null }).archived_at ?? null,
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
        // cloneDemoCards: 연습용 카드 10장으로 시작 / false 면 빈 카드로 시작 — 질문 카드에서 '카드 추가'·'재무제표 엑셀로 만들기'로 넣는다 (10.25)
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

      case 'extract_cards': {
        // AI 활용 3번 (10.23 Q3). 초안만 돌려준다 — 저장은 설계사가 골라서 add_card 로 (자동 반영 없음).
        // 11.04 결정 "가(표만)": 엑셀은 정한 표 양식으로만 받는다. AI 초안은 정확도를 잰 뒤 켤 다음 단계 (docs/17)
        if (process.env.ENABLE_SHEET_AI !== '1') return bad('표가 아닌 엑셀의 AI 초안은 꺼져 있습니다 (ENABLE_SHEET_AI=1)', 404)
        const sheetText = String(body.sheetText ?? '')
        if (!sheetText.trim()) return bad('엑셀 내용이 비어 있습니다')
        if (sheetText.length > 60_000) return bad('엑셀 내용이 너무 깁니다 (6만 자까지)')
        // AI 응답이 30초~1분 걸린다. 연결이 끊기지 않게 공백을 흘려보내다가 끝에 JSON 하나 (JSON 앞 공백은 허용된다)
        const enc = new TextEncoder()
        const stream = new ReadableStream({
          async start(ctrl) {
            const tick = setInterval(() => ctrl.enqueue(enc.encode(' ')), 5000)
            try {
              ctrl.enqueue(enc.encode(JSON.stringify(await extractCardDrafts(sheetText))))
            } catch (e) {
              ctrl.enqueue(enc.encode(JSON.stringify({ error: `카드 초안을 만들지 못했습니다: ${(e as Error).message}` })))
            } finally {
              clearInterval(tick); ctrl.close()
            }
          },
        })
        return new Response(stream, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
      }
      case 'archive_couple':
      case 'restore_couple': {
        // 지우기 = 보관. 답변·판정·카드 기록은 그대로 남는다 (이력 보존 원칙, CLAUDE.md).
        // 지우면: 열린 맞춰보기를 닫고, 두 분 폰의 연결을 풀어 더 이상 그 부부 화면을 못 보게 한다.
        const archive = body.action === 'archive_couple'
        const { data: c, error: e1 } = await sb.from('couples')
          .update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', coupleId).select('id').maybeSingle()
        if (e1) {
          if (/archived_at/.test(e1.message))
            return bad('DB 에 "지우기" 칸이 아직 없습니다 — supabase/patch-2026-10-27-archive-couple.sql 을 SQL Editor 에서 한 번 실행해 주세요', 500)
          return bad(e1.message, 500)
        }
        if (!c) return bad('부부를 찾을 수 없습니다', 404)
        if (archive) {
          await sb.from('rounds').update({ status: 'closed' }).eq('couple_id', coupleId).eq('status', 'open')
          await sb.from('members').update({ auth_user_id: null }).eq('couple_id', coupleId)
        }
        return Response.json({ ok: true, archived: archive })
      }
      case 'rename_couple': {
        // 이름 고치기. 남편·아내 이름은 부부 폰과 안내문에, 표시 이름은 설계사 화면에만 쓰인다.
        const husband = String(body.husband ?? '').trim()
        const wife = String(body.wife ?? '').trim()
        const label = String(body.label ?? '').trim() || `${husband} · ${wife}`
        if (!husband || !wife) return bad('남편·아내 이름이 필요합니다')
        if (husband.length > 20 || wife.length > 20 || label.length > 40) return bad('이름이 너무 깁니다 (각 20자, 표시 이름 40자)')
        const { data: c, error: e1 } = await sb.from('couples').update({ label }).eq('id', coupleId).select('id').maybeSingle()
        if (e1) return bad(e1.message, 500)
        if (!c) return bad('부부를 찾을 수 없습니다', 404)
        const [{ error: e2 }, { error: e3 }] = await Promise.all([
          sb.from('members').update({ display_name: husband }).eq('couple_id', coupleId).eq('role', 'husband'),
          sb.from('members').update({ display_name: wife }).eq('couple_id', coupleId).eq('role', 'wife'),
        ])
        if (e2 || e3) return bad((e2 ?? e3)!.message, 500)
        return Response.json({ ok: true, label, husband, wife })
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
      case 'summarize': {
        if (typeof body.judgmentId !== 'string') return bad('judgmentId')
        const r = await summarizeJudgment(body.judgmentId)
        return r.error ? bad(r.error, 502) : Response.json(r)
      }
      case 'resolve': {
        const { judgmentId, resolution, note } = body
        if (typeof judgmentId !== 'string' || !RESOLUTIONS.includes(resolution)) return bad('judgmentId / resolution')
        const { error } = await sb.from('judgments')
          .update({ resolved_at: new Date().toISOString(), resolution, resolution_note: typeof note === 'string' ? note : null })
          .eq('id', judgmentId).is('resolved_at', null)
        if (error) {
          if (/invalid input value for enum/.test(error.message))
            return bad('DB 에 "재설계 필요" 값이 아직 없습니다 — supabase/patch-2026-10-23-replan.sql 을 SQL Editor 에서 한 번 실행해 주세요', 500)
          return bad(error.message, 500)
        }
        if (resolution === 'false_positive') {
          const { data: j } = await sb.from('judgments').select('method, verdict').eq('id', judgmentId).maybeSingle()
          const pid = await plannerId(sb)
          if (pid) await sb.from('disputes').insert({ judgment_id: judgmentId, planner_id: pid, note: note ?? null, judgment_method: j?.method ?? null, judgment_verdict: j?.verdict ?? null })
        }
        return Response.json({ ok: true })
      }

      // ── 부부가 먼저 알린 변화 (11.04) ─────────────────────────────────
      case 'notices': {
        const { data: rows, error } = await sb.from('change_notices').select('*').eq('couple_id', coupleId).is('resolved_at', null).order('created_at', { ascending: false })
        if (error) return noTable(error.message) ? Response.json({ items: [], needsPatch: NOTICE_PATCH }) : bad(error.message, 500)
        const vids = [...new Set((rows ?? []).map(r => r.card_version_id))]
        const mids = [...new Set((rows ?? []).map(r => r.member_id))]
        const [{ data: cvs }, { data: ms }] = await Promise.all([
          vids.length ? sb.from('card_versions').select('id, card_id, label, planned_value, cards!inner(key, type, unit, category)').in('id', vids) : Promise.resolve({ data: [] as any[] }),
          mids.length ? sb.from('members').select('id, role').in('id', mids) : Promise.resolve({ data: [] as any[] }),
        ])
        const cvById = new Map((cvs ?? []).map(cv => [cv.id, cv]))
        const roleById = new Map((ms ?? []).map(m => [m.id, m.role]))
        return Response.json({
          items: (rows ?? []).map(r => {
            const cv = cvById.get(r.card_version_id)
            return {
              id: r.id, cardId: cv?.card_id, key: cv?.cards?.key, category: cv?.cards?.category, type: cv?.cards?.type, unit: cv?.cards?.unit ?? null,
              label: cv?.label ?? '', planned: cv?.planned_value ?? '', role: roleById.get(r.member_id) ?? 'husband',
              text: r.text, isCondition: r.is_condition, createdAt: r.created_at,
            }
          }),
        })
      }
      case 'resolve_notice': {
        const { noticeId, resolution, note } = body
        if (typeof noticeId !== 'string' || !['replan', 'consult', 'factcheck'].includes(resolution)) return bad('noticeId / resolution')
        const { data: n, error: e0 } = await sb.from('change_notices').select('id, couple_id, card_version_id').eq('id', noticeId).is('resolved_at', null).maybeSingle()
        if (e0) return bad(noTable(e0.message) ? NOTICE_PATCH : e0.message, 500)
        if (!n) return bad('이미 처리했거나 없는 알림입니다', 404)
        let roundId: string | null = null
        if (resolution === 'factcheck') {
          // 두 분께 같이 묻기 = 그 카드의 지금 계획 1장으로 정기 맞춰보기. 열린 맞춰보기가 있으면 겹치지 않게 열지 않는다
          const { data: open } = await sb.from('rounds').select('id').eq('couple_id', n.couple_id).eq('status', 'open').limit(1)
          if (open?.length) return bad('이미 진행 중인 맞춰보기가 있습니다. 끝난 뒤 다시 눌러 주세요')
          const { data: cv } = await sb.from('card_versions').select('card_id').eq('id', n.card_version_id).maybeSingle()
          const { data: act } = cv ? await sb.from('active_cards').select('id').eq('card_id', cv.card_id).maybeSingle() : { data: null }
          if (!act) return bad('이 카드의 지금 계획을 찾지 못했습니다')
          const { data: rd, error: e1 } = await sb.from('rounds').insert({ couple_id: n.couple_id, kind: 'regular', card_version_ids: [act.id] }).select('id').single()
          if (e1) return bad(e1.message, 500)
          roundId = rd.id
        }
        const { error: e2 } = await sb.from('change_notices')
          .update({ resolved_at: new Date().toISOString(), resolution, resolution_note: typeof note === 'string' && note.trim() ? note.trim() : null })
          .eq('id', noticeId).is('resolved_at', null)
        if (e2) return bad(e2.message, 500)
        return Response.json({ ok: true, roundId })
      }

      // ── 카드 ──────────────────────────────────────────────────────────
      case 'cards': {
        const { data, error } = await sb.from('latest_cards').select('*').eq('couple_id', coupleId)
        if (error) return bad(error.message, 500)
        const open = await openVersionIds(sb, coupleId)
        // awaiting = 부부 답을 기다리는 중 (열린 라운드에 있음). pending 인데 awaiting 이 아니면 "동의 안 됨"
        // inOpenRound = 지금 열린 맞춰보기가 이 버전을 묻는 중 (엑셀 다시 읽기는 끝난 뒤에 반영한다)
        return Response.json({ cards: (data ?? []).map(c => ({ ...c, awaiting: c.pending && open.has(c.id), inOpenRound: open.has(c.id) })) })
      }
      case 'apply_sheet_value': {
        // 설계사가 엑셀에서 다시 설계한 숫자를 반영한다 (11.04). 앱이 바꾸는 게 아니라 설계사가 바꾼 설계안을 옮기는 것 —
        // add_card 처럼 바로 전제가 된다. 값은 덮어쓰지 않고 새 버전 (DB 트리거가 막는다).
        const { cardId, reason } = body
        const plannedValue = String(body.plannedValue ?? '')
        if (typeof cardId !== 'string' || !/^\d+$/.test(plannedValue) || typeof reason !== 'string' || !reason.trim()) return bad('cardId / plannedValue(원 단위 숫자) / reason')
        const { data: latest, error: e1 } = await sb.from('latest_cards').select('*').eq('card_id', cardId).maybeSingle()
        if (e1) return bad(e1.message, 500)
        if (!latest) return bad('카드 없음', 404)
        if (latest.type !== 'number') return bad('금액 카드만 엑셀에서 반영합니다')
        if ((await openVersionIds(sb, latest.couple_id)).has(latest.id))
          return bad(`"${latest.label}"은(는) 지금 맞춰보기에서 묻는 중입니다. 두 분이 답한 뒤 다시 읽어 반영해 주세요`)
        if (latest.planned_value === plannedValue) return Response.json({ unchanged: true })
        const pid = await plannerId(sb)
        const { data: v, error: e2 } = await sb.from('card_versions').insert({
          card_id: latest.card_id, version: latest.version + 1, label: latest.label, question: latest.question,
          planned_value: plannedValue, tolerance: latest.tolerance, options: latest.options, allow_condition: latest.allow_condition, stake: latest.stake,
          reason: reason.trim().slice(0, 300), created_by: pid, activated_at: new Date().toISOString(),
        }).select('id, version').single()
        if (e2) return bad(e2.message, 500)
        return Response.json({ versionId: v.id, version: v.version })
      }
      case 'save_card': {
        const { cardId, reason } = body
        if (typeof cardId !== 'string' || typeof reason !== 'string' || !reason.trim()) return bad('cardId / reason(필수)')
        const { data: cur, error: e1 } = await sb.from('latest_cards').select('*').eq('id', cardId).maybeSingle()
        // latest_cards.id 는 card_versions.id 다 — card_id 로 다시 찾는다
        const { data: latest, error: e2 } = e1 || cur ? { data: cur, error: e1 } : await sb.from('latest_cards').select('*').eq('card_id', cardId).maybeSingle()
        if (e2) return bad(e2.message, 500)
        if (!latest) return bad('카드 없음', 404)
        if (latest.pending && (await openVersionIds(sb, latest.couple_id)).has(latest.id))
          return bad('이미 동의 대기 중인 버전이 있습니다. 두 분이 답한 뒤에 다시 고치세요')
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
      case 'add_card': {
        // 설계사가 카드 한 장을 직접 추가. v1 은 바로 전제가 된다 — 설계안에 이미 있는 값이니까 (docs/08 A안 Q4).
        // 부부 확인은 값을 "바꿀 때"(save_card → factcheck)만 거친다.
        const r = normalizeNewCard(body.card ?? {})
        if (!r.ok) return bad(r.error)
        const c = r.card
        const { data: couple } = await sb.from('couples').select('id').eq('id', coupleId).maybeSingle()
        if (!couple) return bad('부부를 찾을 수 없습니다', 404)
        const pid = await plannerId(sb)
        // 엑셀에서 만든 카드는 key 에 엑셀 자리를 담는다 → 다시 읽을 때 같은 카드를 찾는다 (src/extract/diff.ts).
        // 같은 key 가 이미 있으면(지운 카드 포함) 무작위 key 로 — 두 벌이 되는 건 화면에서 먼저 막는다
        let key = newCardKey()
        if (typeof body.sourceKey === 'string' && /^xl:/.test(body.sourceKey)) {
          const { data: dup } = await sb.from('cards').select('id').eq('couple_id', coupleId).eq('key', body.sourceKey).maybeSingle()
          if (!dup) key = body.sourceKey.slice(0, 120)
        }
        const { data: card, error: e1 } = await sb.from('cards')
          .insert({ couple_id: coupleId, key, type: c.type, category: c.category, unit: c.unit })
          .select('id').single()
        if (e1) return bad(e1.message, 500)
        const { data: v, error: e2 } = await sb.from('card_versions').insert({
          card_id: card.id, version: 1, label: c.label, question: c.question, planned_value: c.plannedValue,
          tolerance: c.tolerance, options: c.options, allow_condition: c.allowCondition, stake: c.stake,
          reason: '최초 설정 (설계사 추가)', created_by: pid, activated_at: new Date().toISOString(),
        }).select('id').single()
        if (e2) {
          // 버전이 안 들어갔으면 빈 카드가 남지 않게 보관 처리 (삭제 대신 archived_at — CLAUDE.md)
          await sb.from('cards').update({ archived_at: new Date().toISOString() }).eq('id', card.id)
          return bad(e2.message, 500)
        }
        // 선택: 이 카드 한 장으로 두 분께 바로 묻기 (정기 라운드). 열린 라운드가 있으면 겹치지 않게 열지 않는다.
        let roundId: string | null = null
        let askSkipped: string | null = null
        if (body.askNow) {
          const { data: open } = await sb.from('rounds').select('id').eq('couple_id', coupleId).eq('status', 'open').limit(1)
          if (open?.length) askSkipped = '이미 진행 중인 맞춰보기가 있어 묻기는 열지 않았습니다. 끝난 뒤 다시 여세요.'
          else {
            const { data: rd, error: e3 } = await sb.from('rounds').insert({ couple_id: coupleId, kind: 'regular', card_version_ids: [v.id] }).select('id').single()
            if (e3) return bad(e3.message, 500)
            roundId = rd.id
          }
        }
        return Response.json({ cardId: card.id, versionId: v.id, roundId, askSkipped })
      }
      case 'history': {
        const { data: cards } = await sb.from('cards').select('id, key, type, unit').eq('couple_id', coupleId)
        const cardById = new Map((cards ?? []).map(c => [c.id, c]))
        const open = await openVersionIds(sb, coupleId)
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
            // 미활성 버전: 열린 라운드가 묻는 중이면 "동의 대기", 판정까지 끝났으면 "동의 안 됨"
            awaiting: !v.activated_at && open.has(v.id),
            type: cardById.get(v.card_id)?.type, unit: cardById.get(v.card_id)?.unit ?? null,
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
