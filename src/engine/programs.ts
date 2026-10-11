/**
 * 정책대출 요건. 출처: 주택도시기금 nhuf.molit.go.kr, 2026년 기준 (L1).
 * 블로그 등 2차 자료 금지. 바꿀 땐 출처 URL과 확인일을 같이 갱신한다.
 */
import type { LoanProgram, Won } from './types'

export const 억 = (n: number): Won => Math.round(n * 100_000_000)
export const 만 = (n: number): Won => Math.round(n * 10_000)

export interface ProgramRule {
  label: string
  incomeCap: Won
  /** 맞벌이일 때 합산 상한 (없으면 incomeCap 그대로) */
  dualIncomeCap?: Won
  /** 맞벌이일 때 1인 상한 */
  perPersonCap?: Won
  netWorthCap: Won
  loanLimit: Won
  priceCap: Won
  rate: { min: number; max: number }
  /** 혼인 후 N년 이내 */
  marriageWithinYears?: number
  /** 대출 접수일 기준 N년 내 출산 */
  birthWithinYears?: number
  /** 이 날짜 이후 출생아만 인정 */
  birthOnOrAfter?: Date
  sourceUrl: string
  verifiedOn: string
}

export const PROGRAMS: Record<LoanProgram, ProgramRule> = {
  newlywed: {
    label: '신혼부부전용 구입자금',
    incomeCap: 만(8_500),
    netWorthCap: 억(5.11),
    loanLimit: 억(3.2), // 2025.6.27 이전 4억
    priceCap: 억(6),
    rate: { min: 0.0255, max: 0.0385 },
    marriageWithinYears: 7,
    sourceUrl: 'https://nhuf.molit.go.kr',
    verifiedOn: '2026-10-10',
  },
  newborn: {
    label: '신생아 특례 디딤돌',
    incomeCap: 억(1.3),
    dualIncomeCap: 억(2),
    perPersonCap: 억(1.3),
    netWorthCap: 억(5.11),
    loanLimit: 억(4), // 2025.6.27 이전 5억
    priceCap: 억(9),
    rate: { min: 0.018, max: 0.045 },
    birthWithinYears: 2,
    birthOnOrAfter: new Date('2023-01-01'),
    sourceUrl: 'https://nhuf.molit.go.kr',
    verifiedOn: '2026-10-10',
  },
}
