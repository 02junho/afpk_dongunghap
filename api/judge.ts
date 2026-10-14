/**
 * Vercel serverless. LLM 키는 여기서만 쓴다.
 *
 *   POST /api/judge  { card, a, b }                     → Judgment   (판별)
 *   POST /api/judge  { mode:'summary', card, a, b, judgment } → { summary }  (AI 활용 2번)
 *
 * 규칙
 *   · 판별에서 text 카드가 아니면 LLM을 호출하지 않는다 (CLAUDE.md). 결정적 비교로 끝낸다.
 *   · 요약은 docs/02 의 AI 활용 2번. 🔴·확인필요 건에만, ENABLE_PLANNER_SUMMARY=1 일 때만 돈다.
 *   · 키가 없으면 **조용히 🟡이 되지 않고 500으로 터진다.** 시연 중 전 카드가 🟡이 되는 것이
 *     가장 나쁜 실패다. 설정 실수는 크게 드러나야 한다.
 *   · 데모 모드(ALLOW_DEMO_JUDGE=1)가 아니면 카드 본문을 클라이언트에서 받지 않는다.
 *     2주차에는 { roundId, cardVersionId } 만 받고 서버가 DB에서 읽어 판정·기록한다
 *     (그래야 부부에게 answers select 를 열지 않고도 블라인드가 보장된다 — supabase/rls.sql).
 */
import { judge, type Card, type Judgment } from '../src/judge/index'
import { createLlmClient } from '../src/judge/text-llm'
import { PROMPT_VERSIONS } from '../src/judge/prompt'

export const config = { runtime: 'edge' }

const MAX_BODY = 8_000 // 자유서술 답변 2개 + 카드 한 장. 이보다 크면 쓸 데가 없다.

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

function llmEnv() {
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL
  if (!apiKey || !model) return null
  return { apiKey, model, baseUrl: process.env.LLM_BASE_URL, workspaceId: process.env.LLM_WORKSPACE_ID }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return bad('POST only', 405)

  const raw = await req.text()
  if (raw.length > MAX_BODY) return bad('본문이 너무 큽니다', 413)

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return bad('JSON 파싱 실패')
  }

  const { mode, card, a, b } = body as { mode?: string; card?: Card; a?: string; b?: string }
  if (!card || typeof card !== 'object' || typeof a !== 'string' || typeof b !== 'string') return bad('bad input')
  if (process.env.ALLOW_DEMO_JUDGE !== '1')
    return bad('이 배포에서는 카드 본문을 직접 받지 않습니다 (roundId/cardVersionId 경로를 쓰세요)', 403)

  // ── AI 활용 2번: 🔴 건 설계사용 요약 ──────────────────────────────────
  if (mode === 'summary') {
    if (process.env.ENABLE_PLANNER_SUMMARY !== '1') return bad('요약 기능이 꺼져 있습니다', 404)
    const judgment = body.judgment as Judgment | undefined
    if (!judgment || (judgment.verdict !== 'red' && !judgment.needsReview))
      return bad('요약은 🔴 또는 확인 필요 건에만 생성합니다')
    const env = llmEnv()
    if (!env) return bad('LLM_API_KEY / LLM_MODEL 이 설정되지 않았습니다', 500)
    try {
      const summary = await createLlmClient(env).summarize!({ card, a, b, judgment })
      return Response.json({ summary, promptVersion: PROMPT_VERSIONS.summary, model: env.model })
    } catch (e) {
      return bad(`요약 실패: ${(e as Error).message}`, 502)
    }
  }

  // ── 판별 ──────────────────────────────────────────────────────────────
  let llm
  if (card.type === 'text') {
    const env = llmEnv()
    // 키 없음을 🟡로 덮지 않는다. text 카드는 LLM 없이 판정할 수 없다.
    if (!env) return bad('LLM_API_KEY / LLM_MODEL 이 설정되지 않았습니다', 500)
    llm = createLlmClient(env)
  }

  try {
    const j = await judge(card, a, b, llm, { previousVerdict: body.previousVerdict })
    return Response.json(j)
  } catch (e) {
    // LLM 호출·파싱 실패는 조용히 🟢이 되면 안 된다. 🟡 + 사유 + 사람 확인으로 떨어뜨린다.
    const fallback: Judgment = {
      verdict: 'yellow',
      aVsPlan: 'unparsed',
      bVsPlan: 'unparsed',
      abAgree: false,
      reason: `판정 실패: ${(e as Error).message}`,
      method: 'llm',
      promptVersion: PROMPT_VERSIONS.judge,
      needsReview: true,
    }
    return Response.json(fallback, { status: 200 })
  }
}
