export type CardType = 'number' | 'date' | 'choice' | 'text'

/** 큰 카테고리 8개. 팀이 정하고(AFPK 7과목 + 양가), 세부 카드는 설계안에서 추출·분류된다 */
export type CardCategory = 'wedding' | 'housing' | 'income' | 'children' | 'family' | 'debt' | 'saving' | 'insurance' | 'retire' | 'tax'

/**
 * number 카드의 값이 무엇인지. 같은 'number'라도 금액과 나이는 파싱·표시 규칙이 다르다.
 * ('60' 은 나이로는 60, 금액으로는 60원일 수 없다 → 금액은 단위 없는 1~4자리를 거부한다)
 */
export type NumberUnit = 'krw' | 'age' | 'count' | 'percent'

export interface Card {
  key: string
  type: CardType
  category: CardCategory
  label: string
  question: string
  /** 설계안에 박힌 전제값. number: 원, date: 'YYYY-MM', choice: 선택지 문자열, text: 서술 */
  plannedValue: string | number
  /** number: 허용 비율(0.1 = ±10%) / date: 허용 개월 / choice·text: 무시 */
  tolerance?: number
  /** number일 때 값의 종류. 없으면 'krw'(원). 나이·개수는 금액으로 파싱·표시하면 안 된다 */
  unit?: NumberUnit
  /** choice일 때 선택지 */
  options?: string[]
  /** 이 전제가 흔들리면 무너지는 것 — 화면 이름은 "이 계획이 바뀌면 생기는 일"(10.25). 설계사 큐와 AI 요약에 쓴다 (부부 화면엔 안 보인다) */
  stake: string
  /**
   * date 카드에서 "정확한 시점 대신 조건으로" 답하는 걸 허용할지.
   * docs/02 의 대표 예시("2029년" vs "애 낳고 나서")가 사는 자리다.
   * 조건부 답변은 날짜로 파싱되지 않으므로 'unparsed' → 🟡 + needsReview 로 떨어진다.
   */
  allowCondition?: boolean
}

export type Deviation = 'match' | 'minor' | 'major'
/**
 * 'unparsed' = 답변을 이 카드의 타입으로 해석하지 못했다.
 * minor 로 위조하면 안 된다 — 판정 통계와 "2연속 🟡" 승격이 실제 minor 와 섞인다.
 */
export type DeviationOrUnknown = Deviation | 'unparsed'

export type Verdict = 'green' | 'yellow' | 'red'
/** repeated_yellow = 같은 카드가 2회 연속 🟡 → 승격 (docs/03 §갱신 없이 끝나는 경우) */
export type RedKind = 'couple_conflict' | 'plan_stale' | 'repeated_yellow'

export interface Judgment {
  verdict: Verdict
  redKind?: RedKind
  aVsPlan: DeviationOrUnknown
  bVsPlan: DeviationOrUnknown
  abAgree: boolean
  reason: string
  method: 'deterministic' | 'llm'
  promptVersion?: string
  /** 🟡이지만 사람이 봐야 하는 건 (파싱 실패·조건부 답변). 설계사 큐에 함께 띄운다 */
  needsReview?: boolean
}

export interface TextJudgeInput {
  card: Card
  a: string
  b: string
}
export interface TextJudgeOutput {
  aVsPlan: Deviation
  bVsPlan: Deviation
  abAgree: boolean
  reason: string
}
export interface LlmClient {
  judgeText(input: TextJudgeInput): Promise<TextJudgeOutput>
  /** 🔴 건의 설계사용 3줄 요약 (AI 활용 2번). 선택 구현. */
  summarize?(input: { card: Card; a: string; b: string; judgment: Judgment }): Promise<string>
  /** 재무제표 엑셀 글 → 질문 카드 초안 JSON 원문 (AI 활용 3번, src/extract). 선택 구현. */
  extract?(sheetText: string): Promise<string>
}
