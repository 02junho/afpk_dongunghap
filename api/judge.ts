/**
 * Vercel serverless. 브라우저 → POST /api/judge { card, a, b } → Judgment
 * LLM 키는 여기서만 쓴다. text 카드가 아니면 LLM을 호출하지 않는다.
 */
import { judge, type Card } from '../src/judge/index'
import { createLlmClient } from '../src/judge/text-llm'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  const { card, a, b } = (await req.json()) as { card: Card; a: string; b: string }
  if (!card || typeof a !== 'string' || typeof b !== 'string') return new Response('bad input', { status: 400 })

  const llm = card.type === 'text'
    ? createLlmClient({ apiKey: process.env.LLM_API_KEY!, model: process.env.LLM_MODEL!, baseUrl: process.env.LLM_BASE_URL })
    : undefined
  try {
    const j = await judge(card, a, b, llm)
    return Response.json(j)
  } catch (e) {
    // LLM 실패는 조용히 🟢가 되면 안 된다. 🟡 + 사유로 떨어뜨린다.
    return Response.json({ verdict: 'yellow', aVsPlan: 'minor', bVsPlan: 'minor', abAgree: false, reason: `판정 실패: ${(e as Error).message}`, method: 'llm' }, { status: 200 })
  }
}
