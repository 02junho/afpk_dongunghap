/**
 * 설계사 콘솔 API (Vercel edge). service_role 로 읽고 쓴다 — 설계사만 판정을 본다.
 * 11.04 새 방향(docs/21): 질문 틀 30칸(6테마 × 5문항) + 6주 사이클. 엑셀 · 카드 직접 추가 · 질문 고르기 · "바뀐 게 있어요"는 뺐다.
 *
 * 인증은 임시로 PLANNER_PASSCODE 하나다.
 *
 *   { passcode, action, coupleId? , ... }
 *   couples                                   담당 부부 목록 (진행 상태 · 대기 건수)
 *   new_couple { label, husband, wife }       부부 + 입장 코드 발급 (질문 틀은 비어 있음)
 *   archive_couple / restore_couple           지우기(보관) · 되돌리기. 기록은 지우지 않는다
 *   rename_couple { husband, wife, label? }   이름 고치기
 *   template                                  질문 틀 30칸의 지금 계획 값
 *   template_save { values: {key: 값}, source } 계획 값 저장 — 처음이면 v1, 바뀌면 새 버전(덮어쓰지 않음). 묻는 중인 칸은 건너뜀
 *   extract_plan { docText }                  재무설계 결과(Word · PDF) 글 → 30칸 계획 값 찾기 (AI · 저장 안 함 — 설계사가 확인 뒤 template_save)
 *   cycle                                     사이클 상태 (주차 · 진행 · 이번 사이클의 어긋난 것). 볼 때마다 tick
 *   cycle_start { periodMonths }              사이클 시작 (30칸이 다 차야) → 1주차 질문이 열린다
 *   cycle_skip_week                           다음 주로 넘기기 (시연 · 테스트용 — 시작일을 7일 앞당긴다)
 *   consult_request                           상담 요청 알림 → 사이클을 닫는다. 주기가 지나면 다음 사이클
 *   queue / summarize / resolve               처리 대기 · AI 요약 · 확인함(consult) / 같은 뜻(false_positive)
 *   history / rounds                          변경 이력 · 라운드 목록
 */
import { extractPlanValues, serviceClient, summarizeJudgment } from './judge'
import { EXACT, SLOTS, WEEKS, PER_THEME, themeOfWeek } from '../src/data/template'
import { planValue } from '../src/lib/plan-values'
import { notify } from './_notify'
import { setProfile } from './_profile'
import { CYCLE_PATCH, cycleEndsAt, latestCycle, nextCycleAt, noCycleTable, tickCouple, weekOf } from './_cycle'

export const config = { runtime: 'edge' }

const DEMO_COUPLE = '00000000-0000-0000-0000-000000000010'
// consult = "확인함" (11.04). replan · factcheck 는 예전 기록 표시용으로만 남는다
const RESOLUTIONS = ['replan', 'factcheck', 'consult', 'false_positive'] as const
const DAY = 86_400_000

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

/** 지금 열린 라운드가 묻고 있는 카드 버전들 */
async function openVersionIds(sb: SB, coupleId: string): Promise<Set<string>> {
  const { data } = await sb.from('rounds').select('card_version_ids').eq('couple_id', coupleId).eq('status', 'open')
  return new Set((data ?? []).flatMap(r => r.card_version_ids as string[]))
}

/** 판정 행 → 설계사 화면 한 건 (처리 대기 · 사이클 정리가 같이 쓴다) */
async function judgmentItems(sb: SB, rows: any[]) {
  const ids = [...new Set(rows.map(r => r.card_version_id))]
  const { data: cvs } = ids.length
    ? await sb.from('card_versions').select('id, card_id, label, question, planned_value, stake, cards!inner(key, type, unit, category)').in('id', ids)
    : { data: [] as any[] }
  const cvById = new Map((cvs ?? []).map(cv => [cv.id, cv]))
  return rows.map(r => {
    const cv: any = cvById.get(r.card_version_id)
    return {
      id: r.id, roundId: r.round_id, cardId: cv?.card_id, key: cv?.cards?.key ?? r.key, category: cv?.cards?.category ?? r.category,
      label: cv?.label ?? r.key, question: cv?.question ?? '', planned: cv?.planned_value ?? '', stake: cv?.stake ?? '',
      type: cv?.cards?.type, unit: cv?.cards?.unit ?? null,
      verdict: r.verdict, redKind: r.red_kind, needsReview: r.needs_review, method: r.method, promptVersion: r.prompt_version,
      a: r.a_text, b: r.b_text, reason: r.reason, summary: r.planner_summary, createdAt: r.created_at,
      resolvedAt: r.resolved_at ?? null, resolution: r.resolution ?? null, note: r.resolution_note ?? null,
    }
  })
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
      // ── 부부 ──────────────────────────────────────────────────────────
      case 'couples': {
        const [{ data: couples }, { data: members }, { data: rounds }, { data: queue }, { data: cardRows }, cyc] = await Promise.all([
          sb.from('couples').select('*').order('created_at', { ascending: true }),
          sb.from('members').select('couple_id, role, display_name'),
          sb.from('rounds').select('couple_id, judged_at').not('judged_at', 'is', null).order('judged_at', { ascending: false }),
          sb.from('planner_queue').select('couple_id'),
          sb.from('active_cards').select('couple_id, key').in('key', SLOTS.map(s => s.key)),
          sb.from('cycles').select('couple_id, started_at, closed_at, period_months').order('started_at', { ascending: false }),
        ])
        const now = Date.now()
        const items = (couples ?? []).map(c => {
          const ms = (members ?? []).filter(m => m.couple_id === c.id)
          const filled = (cardRows ?? []).filter(x => x.couple_id === c.id).length
          const cy = (cyc.data ?? []).find(x => x.couple_id === c.id)
          const state = !cy
            ? filled < SLOTS.length ? `질문 틀 ${filled} / ${SLOTS.length}` : '사이클 시작 전'
            : cy.closed_at ? `상담 요청함 · 다음 사이클 ${new Date(nextCycleAt(cy.started_at, cy.period_months)).toLocaleDateString('ko-KR')}`
            : now >= new Date(cycleEndsAt(cy.started_at)).getTime() ? '6주 끝 · 상담 요청 전'
            : `${weekOf(cy.started_at, now)}주차 · ${themeOfWeek(weekOf(cy.started_at, now)).label}`
          return {
            id: c.id, label: c.label, code: c.invite_code, createdAt: c.created_at,
            husband: ms.find(m => m.role === 'husband')?.display_name ?? '남편',
            wife: ms.find(m => m.role === 'wife')?.display_name ?? '아내',
            state, lastAt: (rounds ?? []).find(r => r.couple_id === c.id)?.judged_at ?? null,
            pending: (queue ?? []).filter(q => q.couple_id === c.id).length,
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
        return Response.json({ coupleId: couple.id, code })
      }
      case 'archive_couple':
      case 'restore_couple': {
        // 지우기 = 보관. 답변 · 판정 · 카드 기록은 그대로 남는다 (이력 보존 원칙, CLAUDE.md).
        const archive = body.action === 'archive_couple'
        const { data: c, error: e1 } = await sb.from('couples')
          .update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', coupleId).select('id').maybeSingle()
        if (e1) return bad(e1.message, 500)
        if (!c) return bad('부부를 찾을 수 없습니다', 404)
        if (archive) {
          await sb.from('rounds').update({ status: 'closed' }).eq('couple_id', coupleId).eq('status', 'open')
          await sb.from('members').update({ auth_user_id: null }).eq('couple_id', coupleId)
          await sb.from('cycles').update({ closed_at: new Date().toISOString() }).eq('couple_id', coupleId).is('closed_at', null)
        }
        return Response.json({ ok: true, archived: archive })
      }
      case 'rename_couple': {
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

      // ── 질문 틀 (30칸) ────────────────────────────────────────────────
      case 'template': {
        const { data, error } = await sb.from('active_cards').select('id, card_id, key, version, planned_value').eq('couple_id', coupleId).in('key', SLOTS.map(s => s.key))
        if (error) return bad(error.message, 500)
        const open = await openVersionIds(sb, coupleId)
        const values: Record<string, { cardId: string; versionId: string; version: number; planned: string; inOpenRound: boolean }> = {}
        for (const c of data ?? []) values[c.key] = { cardId: c.card_id, versionId: c.id, version: c.version, planned: c.planned_value, inOpenRound: open.has(c.id) }
        return Response.json({ values })
      }
      case 'template_save': {
        // 카드 값은 덮어쓰지 않는다 — 처음이면 v1, 바뀌면 새 버전 (DB 트리거가 막는다, CLAUDE.md)
        const input = body.values && typeof body.values === 'object' ? body.values as Record<string, unknown> : {}
        const sourceLabel = body.source === 'word' ? 'Word 재무설계 결과' : body.source === 'example' ? '예시 값' : '설계사 입력'
        const { data: couple } = await sb.from('couples').select('id').eq('id', coupleId).maybeSingle()
        if (!couple) return bad('부부를 찾을 수 없습니다', 404)
        const [{ data: cards }, { data: act }, open] = await Promise.all([
          sb.from('cards').select('id, key').eq('couple_id', coupleId).is('archived_at', null).in('key', SLOTS.map(s => s.key)),
          sb.from('active_cards').select('id, card_id, key, version, planned_value').eq('couple_id', coupleId).in('key', SLOTS.map(s => s.key)),
          openVersionIds(sb, coupleId),
        ])
        const cardByKey = new Map((cards ?? []).map(c => [c.key, c.id]))
        const actByKey = new Map((act ?? []).map(a => [a.key, a]))
        const pid = await plannerId(sb)
        const saved: string[] = [], changed: string[] = [], skipped: string[] = [], errors: { key: string; error: string }[] = []
        for (const s of SLOTS) {
          if (!(s.key in input)) continue
          const v = planValue(s, input[s.key] as string)
          if (!v.ok) { if (v.error !== '비어 있음') errors.push({ key: s.key, error: v.error }); continue }
          const cur = actByKey.get(s.key)
          if (cur && cur.planned_value === v.value) continue
          if (cur && open.has(cur.id)) { skipped.push(s.label); continue }   // 두 분이 지금 답하는 중 — 끝난 뒤 다시
          let cardId = cardByKey.get(s.key)
          if (!cardId) {
            const { data: card, error: e1 } = await sb.from('cards').insert({ couple_id: coupleId, key: s.key, type: s.type, category: themeOfWeek(s.week).category, unit: s.unit ?? null }).select('id').single()
            if (e1) { errors.push({ key: s.key, error: e1.message }); continue }
            cardId = card.id
          }
          const version = (cur?.version ?? 0) + 1
          const { error: e2 } = await sb.from('card_versions').insert({
            card_id: cardId, version, label: s.label, question: s.question, planned_value: v.value,
            tolerance: EXACT, options: s.options ?? null, allow_condition: !!s.allowCondition, stake: s.stake,
            reason: `${cur ? '계획 값 바꿈' : '최초 설정'} (${sourceLabel})`, created_by: pid, activated_at: new Date().toISOString(),
          })
          if (e2) { errors.push({ key: s.key, error: e2.message }); continue }
          saved.push(s.key)
          if (cur) changed.push(s.label)
        }
        if (changed.length) await notify(req.url, { coupleId }, { title: '돈궁합', body: '설계사님이 [내 설계]를 새로 고쳤어요.', url: '/c/home', tag: 'plan' })
        return Response.json({ saved: saved.length, changed, skipped, errors })
      }
      case 'extract_plan': {
        // AI 활용 3번 (11.04). 찾은 값만 돌려준다 — 저장은 설계사가 원문과 대조해 확인한 뒤 template_save 로 (자동 반영 없음)
        const docText = String(body.docText ?? '')
        if (!docText.trim()) return bad('재무설계 결과 내용이 비어 있습니다')
        if (docText.length > 60_000) return bad('재무설계 결과 내용이 너무 깁니다 (6만 자까지)')
        // AI 응답이 30초~1분 걸린다. 연결이 끊기지 않게 공백을 흘려보내다가 끝에 JSON 하나
        const enc = new TextEncoder()
        const stream = new ReadableStream({
          async start(ctrl) {
            const tick = setInterval(() => ctrl.enqueue(enc.encode(' ')), 5000)
            try {
              const r = await extractPlanValues(docText)
              // 재무설계 결과 속 부부의 직업 · 소득 형태를 기억해 둔다 — AI 요약이 이미 있는 사실을 되묻지 않게 (11.14).
              // 화면에는 보이지 않고 요약에만 쓴다. 근거 문장이 문서에 실제로 있을 때만 (지어낸 정보는 남기지 않는다)
              if (typeof body.coupleId === 'string' && body.coupleId && r.profile?.found && r.profile.quoteInDoc)
                await setProfile(sb, body.coupleId, r.profile.found).catch(() => {})   // 기억 실패는 값 찾기를 막지 않는다
              ctrl.enqueue(enc.encode(JSON.stringify({ finds: r.finds, promptVersion: r.promptVersion })))
            }
            catch (e) { ctrl.enqueue(enc.encode(JSON.stringify({ error: `계획 값을 찾지 못했습니다: ${(e as Error).message}` }))) }
            finally { clearInterval(tick); ctrl.close() }
          },
        })
        return new Response(stream, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
      }

      // ── 6주 사이클 ────────────────────────────────────────────────────
      case 'cycle': {
        let cyc
        try { cyc = (await tickCouple(sb, coupleId, req.url)).cycle } catch (e) { return bad((e as Error).message, 500) }
        const { data: act } = await sb.from('active_cards').select('key').eq('couple_id', coupleId).in('key', SLOTS.map(s => s.key))
        const filled = (act ?? []).length
        if (!cyc) return Response.json({ cycle: null, weeks: [], review: [], filled, total: SLOTS.length })
        const [{ data: rounds }, { data: members }] = await Promise.all([
          sb.from('rounds').select('id, week, status, opened_at, judged_at, card_version_ids').eq('cycle_id', cyc.id),
          sb.from('members').select('id, role').eq('couple_id', coupleId),
        ])
        const rids = (rounds ?? []).map(r => r.id)
        const [{ data: answers }, { data: js }] = await Promise.all([
          rids.length ? sb.from('answers').select('round_id, member_id').in('round_id', rids) : Promise.resolve({ data: [] as any[] }),
          rids.length ? sb.from('judgments').select('*').in('round_id', rids).order('created_at', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
        ])
        const roleOf = new Map((members ?? []).map(m => [m.id, m.role]))
        const weekOfRound = new Map((rounds ?? []).map(r => [r.id, r.week]))
        const weeks = Array.from({ length: WEEKS }, (_, i) => {
          const w = i + 1, r = (rounds ?? []).find(x => x.week === w)
          const count = (role: string) => (answers ?? []).filter(a => a.round_id === r?.id && roleOf.get(a.member_id) === role).length
          return {
            week: w, theme: themeOfWeek(w).label, opensAt: new Date(new Date(cyc!.started_at).getTime() + (w - 1) * 7 * DAY).toISOString(),
            roundId: r?.id ?? null, status: r?.status ?? null, openedAt: r?.opened_at ?? null,
            total: r ? (r.card_version_ids as string[]).length : PER_THEME, husband: r ? count('husband') : 0, wife: r ? count('wife') : 0,
          }
        })
        const wanted = (js ?? []).filter(j => j.verdict === 'red' || j.needs_review)
        const review = (await judgmentItems(sb, wanted)).map(it => ({ ...it, week: weekOfRound.get(it.roundId) ?? null }))
        return Response.json({
          cycle: {
            id: cyc.id, startedAt: cyc.started_at, periodMonths: cyc.period_months, week: cyc.closed_at ? null : weekOf(cyc.started_at),
            endsAt: cycleEndsAt(cyc.started_at), nextAt: nextCycleAt(cyc.started_at, cyc.period_months),
            consultRequestedAt: cyc.consult_requested_at, closedAt: cyc.closed_at,
          },
          weeks, review, filled, total: SLOTS.length,
        })
      }
      case 'cycle_start': {
        const months = Number(body.periodMonths) === 6 ? 6 : 3
        const { data: act } = await sb.from('active_cards').select('key').eq('couple_id', coupleId).in('key', SLOTS.map(s => s.key))
        if ((act ?? []).length !== SLOTS.length) return bad(`질문 틀 ${SLOTS.length}칸을 모두 채운 뒤 시작할 수 있습니다 (지금 ${(act ?? []).length}칸)`)
        const last = await latestCycle(sb, coupleId)
        if (last && !last.closed_at) return bad('이미 진행 중인 사이클이 있습니다')
        const { error } = await sb.from('cycles').insert({ couple_id: coupleId, period_months: months })
        if (error) return bad(noCycleTable(error.message) ? CYCLE_PATCH : error.message, 500)
        const t = await tickCouple(sb, coupleId, req.url)
        return Response.json({ ok: true, week: t.week, opened: t.opened })
      }
      case 'cycle_skip_week': {
        // 시연 · 테스트용: 시작일과 열린 질문의 열린 날을 7일 앞당긴다 → 다음 주 질문이 열리고, 늦은 분 알림도 시험할 수 있다
        const cyc = await latestCycle(sb, coupleId)
        if (!cyc || cyc.closed_at) return bad('진행 중인 사이클이 없습니다')
        if (weekOf(cyc.started_at) >= WEEKS) return bad(`${WEEKS}주차까지 모두 열렸습니다`)
        const back = (iso: string) => new Date(new Date(iso).getTime() - 7 * DAY).toISOString()
        await sb.from('cycles').update({ started_at: back(cyc.started_at) }).eq('id', cyc.id)
        const { data: open } = await sb.from('rounds').select('id, opened_at').eq('cycle_id', cyc.id).eq('status', 'open')
        for (const r of open ?? []) await sb.from('rounds').update({ opened_at: back(r.opened_at) }).eq('id', r.id)
        const t = await tickCouple(sb, coupleId, req.url)
        return Response.json({ ok: true, week: t.week, opened: t.opened })
      }
      case 'consult_request': {
        const cyc = await latestCycle(sb, coupleId)
        if (!cyc || cyc.closed_at) return bad('진행 중인 사이클이 없습니다')
        const at = new Date().toISOString()
        await sb.from('cycles').update({ consult_requested_at: at, closed_at: at }).eq('id', cyc.id)
        await sb.from('rounds').update({ status: 'closed' }).eq('cycle_id', cyc.id).eq('status', 'open')
        await notify(req.url, { coupleId }, { title: '돈궁합', body: '설계사님이 상담을 요청했어요. 6주 동안의 답을 바탕으로 이야기 나눠요.', url: '/c/home', tag: 'consult' })
        return Response.json({ ok: true, nextAt: nextCycleAt(cyc.started_at, cyc.period_months) })
      }

      // ── 처리 대기 ─────────────────────────────────────────────────────
      case 'queue': {
        const { data: rows, error } = await sb.from('planner_queue').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false })
        if (error) return bad(error.message, 500)
        return Response.json({ items: await judgmentItems(sb, rows ?? []) })
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
          .update({ resolved_at: new Date().toISOString(), resolution, resolution_note: typeof note === 'string' && note.trim() ? note.trim() : null })
          .eq('id', judgmentId).is('resolved_at', null)
        if (error) return bad(error.message, 500)
        if (resolution === 'false_positive') {
          const { data: j } = await sb.from('judgments').select('method, verdict').eq('id', judgmentId).maybeSingle()
          const pid = await plannerId(sb)
          if (pid) await sb.from('disputes').insert({ judgment_id: judgmentId, planner_id: pid, note: note ?? null, judgment_method: j?.method ?? null, judgment_verdict: j?.verdict ?? null })
        }
        return Response.json({ ok: true })
      }

      // ── 이력 · 라운드 ─────────────────────────────────────────────────
      case 'history': {
        const { data: cards } = await sb.from('cards').select('id, key, type, unit').eq('couple_id', coupleId)
        const cardById = new Map((cards ?? []).map(c => [c.id, c]))
        const ids = (cards ?? []).map(c => c.id)
        if (!ids.length) return Response.json({ items: [] })
        const { data: vs, error } = await sb.from('card_versions').select('id, card_id, version, label, planned_value, reason, created_at, activated_at').in('card_id', ids).order('created_at', { ascending: false })
        if (error) return bad(error.message, 500)
        const prev = new Map<string, string>()
        const prevOf = new Map<string, string>()
        for (const v of [...(vs ?? [])].sort((a, b) => a.version - b.version)) { prevOf.set(v.id, prev.get(v.card_id) ?? '—'); prev.set(v.card_id, v.planned_value) }
        return Response.json({
          items: (vs ?? []).map(v => ({
            id: v.id, label: v.label, version: v.version, from: prevOf.get(v.id), to: v.planned_value,
            reason: v.reason, at: v.created_at, active: !!v.activated_at, awaiting: false,
            type: cardById.get(v.card_id)?.type, unit: cardById.get(v.card_id)?.unit ?? null,
          })),
        })
      }
      case 'rounds': {
        const { data, error } = await sb.from('rounds').select('id, kind, status, opened_at, judged_at, card_version_ids').eq('couple_id', coupleId).order('opened_at', { ascending: false })
        if (error) return bad(error.message, 500)
        return Response.json({ rounds: data })
      }
      default:
        return bad('action')
    }
  } catch (e) {
    return bad((e as Error).message, 500)
  }
}

