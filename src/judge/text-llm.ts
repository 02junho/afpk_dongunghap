import Anthropic from '@anthropic-ai/sdk'
import type { Card, Judgment, LlmClient, TextJudgeInput, TextJudgeOutput } from './types'
import { buildPrompt, buildSummaryPrompt } from './prompt'
import { buildPlanPrompt } from '../extract/plan'
import { formatAnswer, formatValue } from '../lib/answer-options'

/**
 * 서버에서만 사용 (api/judge.ts, eval/run.ts, scripts/, vite dev 미들웨어). 브라우저에서 import 금지.
 * 공식 SDK(@anthropic-ai/sdk)를 쓴다. 다른 제공자를 쓰려면 이 파일만 바꾼다.
 *
 * 현재 모델(Sonnet 5.5·Opus 5.5)에서 주의할 것:
 *   · temperature/top_p 를 보내면 400 이다. "같은 입력에 같은 답"은 파라미터로 못 박는 게 아니라
 *     eval --repeat 로 **측정**한다 (docs/02).
 *   · thinking 은 기본으로 켜져 있고 max_tokens 에 포함된다. 판별은 짧은 분류이므로
 *     effort 를 low 로 두고, max_tokens 는 thinking 몫까지 넉넉히 잡는다.
 *   · 에러 메시지는 `LLM <status>: ...` 형식으로 통일한다 — eval/errors.ts 가 이 접두사로 분류한다.
 */
export interface LlmEnv {
  apiKey: string
  model: string
  baseUrl?: string
  /**
   * 사용자 키(sk-ant-usr-…)는 워크스페이스에 묶여 있지 않아 이 헤더가 없으면 400 이다.
   * 워크스페이스 키(sk-ant-api03-…)를 쓰면 필요 없다. 콘솔 → Workspaces → ID (wrkspc_…).
   */
  workspaceId?: string
}

export function createLlmClient(env: LlmEnv): LlmClient {
  const client = new Anthropic({
    apiKey: env.apiKey,
    baseURL: env.baseUrl,
    defaultHeaders: env.workspaceId ? { 'anthropic-workspace-id': env.workspaceId } : undefined,
  })

  async function call(prompt: string, maxTokens: number): Promise<string> {
    let res: Anthropic.Message
    try {
      res = await client.messages.create({
        model: env.model,
        max_tokens: maxTokens,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (e) {
      // 상태 코드를 우리 접두사로 옮긴다. 본문의 숫자를 상태 코드로 오해하지 않도록 (errors.ts)
      if (e instanceof Anthropic.APIError) throw new Error(`LLM ${e.status ?? 0}: ${e.message}`)
      throw e
    }
    if (res.stop_reason === 'refusal') throw new Error(`LLM refusal: ${res.stop_details?.explanation ?? '안전 분류기 거절'}`)
    if (res.stop_reason === 'max_tokens') throw new Error('LLM max_tokens: 출력이 잘렸습니다 (max_tokens 를 올리세요)')
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('')
  }

  return {
    async judgeText({ card, a, b }: TextJudgeInput): Promise<TextJudgeOutput> {
      return parseOutput(await call(buildPrompt(card, a, b), 4000))
    },
    async summarize({ card, a, b, judgment, profile }: { card: Card; a: string; b: string; judgment: Judgment; profile?: string }) {
      // 계획 · 답은 사람이 읽는 글로 ('300000000' → '3억원') — AI 가 단위를 바꾸지 않게
      const text = await call(buildSummaryPrompt({ ...card, plannedValue: formatValue(card, card.plannedValue) }, formatAnswer(card, a), formatAnswer(card, b), judgment, profile), 4000)
      return text.trim().split('\n').map(l => l.trim()).filter(l => l && !/[?？]$/.test(l)).slice(0, 2).join('\n')
    },
    async extractPlan(docText: string) {
      // 30칸 JSON — 출력이 길어 max_tokens 를 넉넉히 (thinking 몫 포함)
      return call(buildPlanPrompt(docText), 16000)
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

/** 테스트·오프라인용. 키워드 겹침으로 대충 판정한다. 품질 기대 금지 — 베이스라인(대조군)으로만. */
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
  async summarize({ card }) {
    return `mock 요약 (${card.label})\n품질 기대 금지 — 실제 측정은 LLM_API_KEY 필요`
  },
  async extractPlan(docText: string) {
    // 화면 흐름 확인용 — 문서에 처음 나오는 "YYYY년"만 내 집 마련 시기 칸에 넣는다. 나머지는 못 찾음
    const m = docText.match(/20\d{2}년/)
    return JSON.stringify(m ? [{ key: 't1_buy_year', found: m[0], quote: m[0], note: 'mock — 실제 추출은 LLM_API_KEY 필요' }] : [])
  },
}
