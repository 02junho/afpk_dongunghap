import type { Card, DeviationOrUnknown, Judgment, LlmClient, Verdict } from './types'
import { compareToPlan, answersAgree } from './deterministic'
import { PROMPT_VERSIONS } from './prompt'

export * from './types'
export * from './deterministic'
export { PROMPT_VERSIONS, PROMPT_VERSION, buildPrompt, buildSummaryPrompt } from './prompt'

/**
 * 3자 비교 → 신호등. 분기 전부가 docs/02_AI활용범위.md 의 표와 1:1 이다.
 * 여기 로직을 바꾸면 그 표도 같이 바꾼다.
 *
 * | A | B | A·B | 판정 |
 * |---|---|---|---|
 * | unparsed 포함 | | | 🟡 (needsReview) |
 * | match | match | agree | 🟢 |
 * | match | match | disagree | 🟡 |
 * | minor | match/minor | agree/disagree | 🟡 |
 * | major | 무엇이든 | agree | 🔴 전제 폐기 |
 * | major | 무엇이든 | disagree | 🔴 부부 불일치 |
 */
export function resolve(
  aVsPlan: DeviationOrUnknown,
  bVsPlan: DeviationOrUnknown,
  abAgree: boolean,
): Pick<Judgment, 'verdict' | 'redKind'> {
  if (aVsPlan === 'unparsed' || bVsPlan === 'unparsed') return { verdict: 'yellow' }
  const majors = [aVsPlan, bVsPlan].filter(d => d === 'major').length
  // 한쪽만 major 라도 두 사람이 서로 일치하면 '부부 불일치'가 아니라 '전제 폐기'다.
  // (설계가 현실을 못 따라온 경우를 부부 싸움으로 보고하면 안 된다)
  if (majors >= 1) return abAgree ? { verdict: 'red', redKind: 'plan_stale' } : { verdict: 'red', redKind: 'couple_conflict' }
  if (aVsPlan === 'minor' || bVsPlan === 'minor') return { verdict: 'yellow' }
  if (!abAgree) return { verdict: 'yellow' } // 둘 다 전제 근처인데 서로 다르다면 보수적으로 🟡
  return { verdict: 'green' }
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

export async function judge(card: Card, a: string, b: string, llm?: LlmClient, opts: JudgeOptions = {}): Promise<Judgment> {
  if (card.type !== 'text') {
    const aVsPlan = compareToPlan(card, a)
    const bVsPlan = compareToPlan(card, b)
    const agree = answersAgree(card, a, b)
    if (aVsPlan === 'unparsed' || bVsPlan === 'unparsed' || agree === null) {
      const reason = card.type === 'choice'
        ? '보기에 없는 답(기타)을 직접 적었습니다 — 설계사 확인 필요'
        : card.type === 'date' && card.allowCondition
          ? '시점 대신 조건으로 답했습니다 — 설계사 확인 필요'
          : `답변을 ${card.type === 'date' ? '날짜' : '숫자'}로 해석하지 못했습니다`
      return escalate(
        { verdict: 'yellow', aVsPlan, bVsPlan, abAgree: agree ?? false, reason, method: 'deterministic', needsReview: true },
        opts.previousVerdict,
      )
    }
    return escalate(
      { ...resolve(aVsPlan, bVsPlan, agree), aVsPlan, bVsPlan, abAgree: agree, reason: '', method: 'deterministic' },
      opts.previousVerdict,
    )
  }
  if (!llm) throw new Error('text 카드는 LlmClient가 필요합니다')
  const o = await llm.judgeText({ card, a, b })
  return escalate(
    { ...resolve(o.aVsPlan, o.bVsPlan, o.abAgree), ...o, method: 'llm', promptVersion: PROMPT_VERSIONS.judge },
    opts.previousVerdict,
  )
}
