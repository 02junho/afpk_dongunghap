/**
 * Vercel edge. LLM 키와 service_role 키는 여기(서버)에서만 쓴다.
 *
 *   POST /api/judge  { roundId }                              → 라운드 판정 (2주차, 본 경로)
 *   POST /api/judge  { card, a, b }                           → 카드 1장 판정 (1주차 데모. ALLOW_DEMO_JUDGE=1 일 때만)
 *   POST /api/judge  { mode:'summary', card, a, b, judgment } → 🔴 건 3줄 요약 (ENABLE_PLANNER_SUMMARY=1)
 *
 * 라운드 판정:
 *   service_role 로 answers 양쪽을 읽어 판정하고 judgments 에 쓴다. 부부는 answers 상대분도
 *   judgments 도 읽지 못하므로(rls.sql) 블라인드가 DB 로 보장된다. 응답은 {judged:n} 뿐 —
 *   판정 내용은 설계사 콘솔(/api/planner)만 받는다. 멱등: 이미 판정된 라운드는 다시 안 한다.
 *
 * 규칙
 *   · 판별에서 text 카드가 아니면 LLM 을 호출하지 않는다 (CLAUDE.md).
 *   · 키가 없으면 조용히 🟡이 되지 않고 500 으로 터진다.
 */
import { createClient } from '@supabase/supabase-js'
import { judge, type Card, type Judgment } from '../src/judge/index'
import { createLlmClient, mockLlm } from '../src/judge/text-llm'
import { PROMPT_VERSIONS } from '../src/judge/prompt'
import { rowToCard } from '../src/lib/cards'

export const config = { runtime: 'edge' }

const MAX_BODY = 8_000

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

function llmEnv() {
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL
  if (!apiKey || !model) return null
  return { apiKey, model, baseUrl: process.env.LLM_BASE_URL, workspaceId: process.env.LLM_WORKSPACE_ID }
}

/** text 카드용 LLM. dev 에서 키가 없으면 LLM_MOCK=1 로 mock (품질 없음, 경로 확인용) */
function llmOrFail(): { llm: ReturnType<typeof createLlmClient> } | { error: Response } {
  if (process.env.LLM_MOCK === '1') return { llm: mockLlm as ReturnType<typeof createLlmClient> }
  const env = llmEnv()
  if (!env) return { error: bad('LLM_API_KEY / LLM_MODEL 이 설정되지 않았습니다', 500) }
  return { llm: createLlmClient(env) }
}

export function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function judgeRound(roundId: string): Promise<Response> {
  const sb = serviceClient()
  if (!sb) return bad('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다', 500)

  const { data: round, error: e1 } = await sb.from('rounds').select('id, couple_id, kind, status, card_version_ids').eq('id', roundId).maybeSingle()
  if (e1) return bad(e1.message, 500)
  if (!round) return bad('라운드 없음', 404)
  if (round.status !== 'open') return Response.json({ ok: true, already: true })

  const [{ data: members }, { data: answers }] = await Promise.all([
    sb.from('members').select('id, role').eq('couple_id', round.couple_id),
    sb.from('answers').select('card_version_id, member_id, text, is_condition').eq('round_id', roundId),
  ])
  const roleOf = new Map((members ?? []).map(m => [m.id, m.role as 'husband' | 'wife']))
  const byCv = new Map<string, Partial<Record<'husband' | 'wife', string>>>()
  for (const a of answers ?? []) {
    const role = roleOf.get(a.member_id)
    if (!role) continue
    const slot = byCv.get(a.card_version_id) ?? {}
    slot[role] = a.text
    byCv.set(a.card_version_id, slot)
  }
  const ids: string[] = round.card_version_ids
  const complete = ids.every(id => byCv.get(id)?.husband && byCv.get(id)?.wife)
  if (!complete) return Response.json({ ok: true, pending: true })

  const { data: cvs, error: e2 } = await sb.from('card_versions').select('*, cards!inner(key, type, category, unit)').in('id', ids)
  if (e2) return bad(e2.message, 500)

  const needsLlm = (cvs ?? []).some(cv => cv.cards.type === 'text')
  let llm: ReturnType<typeof createLlmClient> | undefined
  if (needsLlm) {
    const r = llmOrFail()
    if ('error' in r) return r.error
    llm = r.llm
  }

  // 같은 카드의 직전 판정 (2연속 🟡 승격용)
  const { data: prevRows } = await sb
    .from('card_verdict_history').select('card_id, verdict, opened_at')
    .eq('couple_id', round.couple_id).neq('round_id', roundId)
    .order('opened_at', { ascending: false })
  const prevByCard = new Map<string, Judgment['verdict']>()
  for (const p of prevRows ?? []) if (!prevByCard.has(p.card_id)) prevByCard.set(p.card_id, p.verdict)

  let judged = 0
  for (const cv of cvs ?? []) {
    const card: Card = rowToCard(cv, cv.cards)
    const ans = byCv.get(cv.id)!
    const a = ans.husband!, b = ans.wife!
    const j = await judge(card, a, b, card.type === 'text' ? llm : undefined, { previousVerdict: prevByCard.get(cv.card_id) })
    const { error: e3 } = await sb.from('judgments').upsert({
      round_id: roundId,
      card_version_id: cv.id,
      verdict: j.verdict,
      red_kind: j.redKind ?? null,
      a_vs_plan: j.aVsPlan,
      b_vs_plan: j.bVsPlan,
      ab_agree: j.abAgree,
      a_text: a,
      b_text: b,
      reason: j.reason,
      method: j.method,
      prompt_version: j.promptVersion ?? null,
      model: j.method === 'llm' ? (process.env.LLM_MOCK === '1' ? 'mock' : process.env.LLM_MODEL) : null,
      needs_review: !!j.needsReview,
    }, { onConflict: 'round_id,card_version_id', ignoreDuplicates: true })
    if (e3) return bad(`judgments 기록 실패: ${e3.message}`, 500)
    judged++
  }
  await sb.from('rounds').update({ status: 'judged', judged_at: new Date().toISOString() }).eq('id', roundId)

  // ★ '먼저 묻기'(factcheck) 라운드: 두 사람이 새 전제와 맞게(🟢) 답하면 그 버전이 전제가 된다 (docs/03).
  //   🟡·🔴이면 활성화하지 않고 큐로 간다 — 설계사가 다시 본다.
  let activated = 0
  if (round.kind === 'factcheck') {
    const { data: js } = await sb.from('judgments').select('card_version_id, verdict').eq('round_id', roundId)
    for (const j of js ?? []) {
      if (j.verdict !== 'green') continue
      const { error } = await sb.from('card_versions').update({ activated_at: new Date().toISOString() }).eq('id', j.card_version_id).is('activated_at', null)
      if (!error) activated++
    }
  }
  return Response.json({ ok: true, judged, activated })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return bad('POST only', 405)

  const raw = await req.text()
  if (raw.length > MAX_BODY) return bad('본문이 너무 큽니다', 413)
  let body: any
  try { body = JSON.parse(raw) } catch { return bad('JSON 파싱 실패') }

  // ── 2주차 본 경로: 라운드 판정 ────────────────────────────────────────
  if (typeof body.roundId === 'string') {
    if (!/^[0-9a-f-]{36}$/.test(body.roundId)) return bad('roundId 형식')
    try { return await judgeRound(body.roundId) } catch (e) { return bad(`판정 실패: ${(e as Error).message}`, 500) }
  }

  const { mode, card, a, b } = body as { mode?: string; card?: Card; a?: string; b?: string }
  if (!card || typeof card !== 'object' || typeof a !== 'string' || typeof b !== 'string') return bad('bad input')
  if (process.env.ALLOW_DEMO_JUDGE !== '1')
    return bad('이 배포에서는 카드 본문을 직접 받지 않습니다 ({roundId} 경로를 쓰세요)', 403)

  // ── AI 활용 2번: 🔴 건 설계사용 요약 ──────────────────────────────────
  if (mode === 'summary') {
    if (process.env.ENABLE_PLANNER_SUMMARY !== '1') return bad('요약 기능이 꺼져 있습니다', 404)
    const judgment = body.judgment as Judgment | undefined
    if (!judgment || (judgment.verdict !== 'red' && !judgment.needsReview)) return bad('요약은 🔴 또는 확인 필요 건에만 생성합니다')
    const r = llmOrFail()
    if ('error' in r) return r.error
    try {
      const summary = await r.llm.summarize!({ card, a, b, judgment })
      return Response.json({ summary, promptVersion: PROMPT_VERSIONS.summary, model: process.env.LLM_MODEL })
    } catch (e) {
      return bad(`요약 실패: ${(e as Error).message}`, 502)
    }
  }

  // ── 1주차 데모: 카드 1장 판정 ────────────────────────────────────────
  let llm
  if (card.type === 'text') {
    const r = llmOrFail()
    if ('error' in r) return r.error
    llm = r.llm
  }
  try {
    return Response.json(await judge(card, a, b, llm, { previousVerdict: body.previousVerdict }))
  } catch (e) {
    const fallback: Judgment = {
      verdict: 'yellow', aVsPlan: 'unparsed', bVsPlan: 'unparsed', abAgree: false,
      reason: `판정 실패: ${(e as Error).message}`, method: 'llm', promptVersion: PROMPT_VERSIONS.judge, needsReview: true,
    }
    return Response.json(fallback, { status: 200 })
  }
}
