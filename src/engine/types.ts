/** 금액은 전부 원(KRW) 정수. 만원·억원 단위 변환은 UI에서. */
export type Won = number

export interface Household {
  /** 부부 합산 세전 연소득 */
  annualIncome: Won
  /** 배우자 각각 세전 연소득 (맞벌이 1인 상한 검사용) */
  incomes: [Won, Won]
  /** 순자산 = 자산 - 부채 */
  netWorth: Won
  /** 혼인신고일 */
  marriageDate: Date
  /** 자녀 출생일 목록 (없으면 빈 배열) */
  childBirthDates: Date[]
}

export interface HomePurchase {
  /** 매수 주택 가격 */
  price: Won
  /** 자기자금 */
  equity: Won
  /** 취득 부대비용(취득세·중개수수료·등기 등). 설계안에서 가정값으로 입력. 기본 0 */
  closingCosts?: Won
  /** 대출 접수(실행) 예정일 */
  applyDate: Date
}

export type LoanProgram = 'newlywed' | 'newborn'

export interface Eligibility {
  program: LoanProgram
  eligible: boolean
  /** 탈락 사유. 비어 있으면 적격 */
  reasons: string[]
  /** 소득 상한까지 남은 여유 (음수면 초과) */
  incomeHeadroom: Won
  /** 이 프로그램의 대출 한도 */
  limit: Won
}

export interface RepaymentPlan {
  /** 월 상환액 합계 */
  monthly: Won
  /** 구성 대출별 내역 */
  tranches: { label: string; principal: Won; rate: number; monthly: Won }[]
  /** 총 이자 (만기까지) */
  totalInterest: Won
}
