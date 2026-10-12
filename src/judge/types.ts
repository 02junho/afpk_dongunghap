export type CardType = 'number' | 'date' | 'choice' | 'text'

export interface Card {
  key: string
  type: CardType
  label: string
  question: string
  /** 설계안에 박힌 전제값. number: 원, date: 'YYYY-MM', choice: 선택지 문자열, text: 서술 */
  plannedValue: string | number
  /** number: 허용 비율(0.1 = ±10%) / date: 허용 개월 / choice·text: 무시 */
  tolerance?: number
  /** choice일 때 선택지 */
  options?: string[]
  /** number일 때 단위. 생략하면 원(krw). 나이·개수는 금액으로 표시하면 안 된다 */
  unit?: 'krw' | 'age'
  /** 이 전제가 흔들리면 무너지는 것 — 결과 화면과 설계사 요약에 쓴다 */
  stake: string
}

export type Deviation = 'match' | 'minor' | 'major'

export type Verdict = 'green' | 'yellow' | 'red'
export type RedKind = 'couple_conflict' | 'plan_stale'

export interface Judgment {
  verdict: Verdict
  redKind?: RedKind
  aVsPlan: Deviation
  bVsPlan: Deviation
  abAgree: boolean
  reason: string
  /** 'deterministic' | 'llm' */
  method: 'deterministic' | 'llm'
  promptVersion?: string
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
}
