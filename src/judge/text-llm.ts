import type { LlmClient, TextJudgeInput, TextJudgeOutput } from './types'
import { buildPrompt } from './prompt'

/**
 * 서버에서만 사용 (api/judge.ts, eval/run.ts). 브라우저에서 import 금지.
 * Anthropic Messages API 호환. 다른 제공자를 쓰려면 이 파일만 바꾼다.
 */
export function createLlmClient(env: { apiKey: string; model: string; baseUrl?: string }): LlmClient {
  const base = env.baseUrl ?? 'https://api.anthropic.com'
  return {
    async judgeText({ card, a, b }: TextJudgeInput): Promise<TextJudgeOutput> {
      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.model,
          max_tokens: 300,
          temperature: 0,
          messages: [{ role: 'user', content: buildPrompt(card, a, b) }],
        }),
      })
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
      const data = await res.json()
      const text: string = data.content?.map((c: any) => c.text ?? '').join('') ?? ''
      return parseOutput(text)
    },
  }
}

export function parseOutput(text: string): TextJudgeOutput {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`LLM 출력에 JSON 없음: ${text.slice(0, 120)}`)
  const o = JSON.parse(m[0])
  const ok = (v: unknown) => v === 'match' || v === 'minor' || v === 'major'
  if (!ok(o.aVsPlan) || !ok(o.bVsPlan) || typeof o.abAgree !== 'boolean')
    throw new Error(`LLM 출력 형식 오류: ${m[0]}`)
  return { aVsPlan: o.aVsPlan, bVsPlan: o.bVsPlan, abAgree: o.abAgree, reason: String(o.reason ?? '') }
}

/** 테스트·오프라인용. 키워드 겹침으로 대충 판정한다. 품질 기대 금지. */
export const mockLlm: LlmClient = {
  async judgeText({ card, a, b }) {
    const tok = (s: string) => new Set(s.replace(/[^\p{L}\p{N}]/gu, ' ').split(/\s+/).filter(w => w.length > 1))
    const jac = (x: Set<string>, y: Set<string>) => {
      const i = [...x].filter(v => y.has(v)).length
      return i / (x.size + y.size - i || 1)
    }
    const p = tok(String(card.plannedValue)), ta = tok(a), tb = tok(b)
    const dev = (s: number): 'match' | 'minor' | 'major' => (s >= 0.4 ? 'match' : s >= 0.15 ? 'minor' : 'major')
    return { aVsPlan: dev(jac(ta, p)), bVsPlan: dev(jac(tb, p)), abAgree: jac(ta, tb) >= 0.3, reason: 'mock' }
  },
}
