import type { Card, Deviation, Judgment, LlmClient } from './types'
import { compareToPlan, answersAgree } from './deterministic'
import { PROMPT_VERSION } from './prompt'

export * from './types'
export * from './deterministic'
export { PROMPT_VERSION, buildPrompt } from './prompt'

/**
 * 3자 비교 → 신호등.
 * 표는 docs/02_AI활용범위.md 참조. 여기 로직을 바꾸면 그 표도 바꾼다.
 */
export function resolve(aVsPlan: Deviation, bVsPlan: Deviation, abAgree: boolean): Pick<Judgment, 'verdict' | 'redKind'> {
  const majors = [aVsPlan, bVsPlan].filter(d => d === 'major').length
  if (majors === 2) return abAgree ? { verdict: 'red', redKind: 'plan_stale' } : { verdict: 'red', redKind: 'couple_conflict' }
  if (majors === 1) return { verdict: 'red', redKind: 'couple_conflict' }
  if (aVsPlan === 'minor' || bVsPlan === 'minor') return { verdict: 'yellow' }
  if (!abAgree) return { verdict: 'yellow' } // 둘 다 전제 근처인데 서로 다르다고 나오면 보수적으로 🟡
  return { verdict: 'green' }
}

export async function judge(card: Card, a: string, b: string, llm?: LlmClient): Promise<Judgment> {
  if (card.type !== 'text') {
    const aVsPlan = compareToPlan(card, a), bVsPlan = compareToPlan(card, b), agree = answersAgree(card, a, b)
    if (aVsPlan === null || bVsPlan === null || agree === null) {
      // 파싱 실패 → 사람이 봐야 한다. 🟡로 보내고 사유를 남긴다.
      return { verdict: 'yellow', aVsPlan: 'minor', bVsPlan: 'minor', abAgree: false, reason: '답변을 숫자/날짜로 해석하지 못했습니다', method: 'deterministic' }
    }
    return { ...resolve(aVsPlan, bVsPlan, agree), aVsPlan, bVsPlan, abAgree: agree, reason: '', method: 'deterministic' }
  }
  if (!llm) throw new Error('text 카드는 LlmClient가 필요합니다')
  const o = await llm.judgeText({ card, a, b })
  return { ...resolve(o.aVsPlan, o.bVsPlan, o.abAgree), ...o, method: 'llm', promptVersion: PROMPT_VERSION }
}
