import type { Card, DeviationOrUnknown, Judgment, LlmClient, Verdict } from './types'
import { compareToPlan, answersAgree, isOtherAnswer } from './deterministic'
import { formatAnswer, formatValue } from '../lib/answer-options'
import { PROMPT_VERSIONS } from './prompt'

export * from './types'
export * from './deterministic'
export { PROMPT_VERSIONS, PROMPT_VERSION, buildPrompt, buildSummaryPrompt } from './prompt'

/**
 * 각 답을 계획과 비교 → 신호등. 분기 전부가 docs/02_AI활용범위.md 의 표와 1:1 이다.
 * 여기 로직을 바꾸면 그 표도 같이 바꾼다.
 *
 * 11.05 사용자 결정: **재무설계 결과와 다르면 다른 것.** 부부 불일치 · 전제 폐기를 나누지 않는다.
 *   허용 범위도 없다 — "조금 다름(minor)"도 다름.
 *
 * | A | B | 판정 |
 * |---|---|---|
 * | unparsed 포함 | | 🟡 확인 필요 (needsReview) |
 * | match | match | 🟢 |
 * | 그 밖 (한 분이라도 minor · major) | | 🔴 계획과 다름 |
 *
 * abAgree(두 답이 서로 같은가)는 판정에 쓰지 않는다. 설계사 화면 · eval 의 중간 라벨로만 남는다.
 */
export function resolve(
  aVsPlan: DeviationOrUnknown,
  bVsPlan: DeviationOrUnknown,
  _abAgree?: boolean,
): Pick<Judgment, 'verdict' | 'redKind'> {
  if (aVsPlan === 'unparsed' || bVsPlan === 'unparsed') return { verdict: 'yellow' }
  if (aVsPlan === 'match' && bVsPlan === 'match') return { verdict: 'green' }
  return { verdict: 'red' }
}

/**
 * 같은 카드가 2회 연속 🟡이면 🔴로 승격한다 (docs/03 §갱신 없이 끝나는 경우).
 * 설계사 개입 건수를 줄이면서 '조용히 지나가는 🟡'을 막는 장치.
 */
export function escalate(j: Judgment, previousVerdict?: Verdict): Judgment {
  if (j.verdict === 'yellow' && previousVerdict === 'yellow')
    return { ...j, verdict: 'red', redKind: 'repeated_yellow', reason: j.reason || '같은 전제가 2회 연속 🟡 — 승격' }
  return j
}

export interface JudgeOptions {
  /** 같은 카드의 직전 라운드 판정. 'yellow'면 2연속 승격 규칙이 적용된다 */
  previousVerdict?: Verdict
}

/**
 * 기타(직접 적기) 답을 AI 에게 보이는 모양 — 계획 · 답을 사람이 읽는 글로 (11.05 가안).
 * "300000000" 이 아니라 "3억원", "2032-06" 이 아니라 "2032년 6월".
 */
function asTextCard(card: Card): Card {
  return { ...card, type: 'text', plannedValue: formatValue(card, card.plannedValue) }
}

export async function judge(card: Card, a: string, b: string, llm?: LlmClient, opts: JudgeOptions = {}): Promise<Judgment> {
  if (card.type !== 'text') {
    const aVsPlan = compareToPlan(card, a)
    const bVsPlan = compareToPlan(card, b)
    const agree = answersAgree(card, a, b)
    if (aVsPlan === 'unparsed' || bVsPlan === 'unparsed' || agree === null) {
      // 가안 (11.05): 보기에 없는 답(기타)을 규칙으로 못 읽으면 AI 가 계획과 같은 뜻인지 본다.
      // 규칙으로 읽힌 쪽은 규칙 결과를 그대로 쓴다 — AI 는 못 읽은 쪽만 바꾼다.
      const other = isOtherAnswer(a) || isOtherAnswer(b)
      if (other && llm) {
        const o = await llm.judgeText({ card: asTextCard(card), a: formatAnswer(card, a).replace(/^기타\s*:\s*/, ''), b: formatAnswer(card, b).replace(/^기타\s*:\s*/, '') })
        const av = aVsPlan === 'unparsed' ? o.aVsPlan : aVsPlan
        const bv = bVsPlan === 'unparsed' ? o.bVsPlan : bVsPlan
        return escalate(
          { ...resolve(av, bv), aVsPlan: av, bVsPlan: bv, abAgree: agree ?? o.abAgree, reason: o.reason, method: 'llm', promptVersion: PROMPT_VERSIONS.judge },
          opts.previousVerdict,
        )
      }
      const reason = other
        ? '보기에 없는 답(기타)을 직접 적었습니다 — 설계사 확인 필요'
        : card.type === 'date' && card.allowCondition
          ? '시점 대신 조건으로 답했습니다 — 설계사 확인 필요'
          : `답변을 ${card.type === 'date' ? '날짜' : card.type === 'choice' ? '보기' : '숫자'}로 해석하지 못했습니다`
      return escalate(
        { verdict: 'yellow', aVsPlan, bVsPlan, abAgree: agree ?? false, reason, method: 'deterministic', needsReview: true },
        opts.previousVerdict,
      )
    }
    return escalate(
      { ...resolve(aVsPlan, bVsPlan), aVsPlan, bVsPlan, abAgree: agree, reason: '', method: 'deterministic' },
      opts.previousVerdict,
    )
  }
  if (!llm) throw new Error('text 카드는 LlmClient가 필요합니다')
  const o = await llm.judgeText({ card, a, b })
  return escalate(
    { ...resolve(o.aVsPlan, o.bVsPlan), ...o, method: 'llm', promptVersion: PROMPT_VERSIONS.judge },
    opts.previousVerdict,
  )
}
