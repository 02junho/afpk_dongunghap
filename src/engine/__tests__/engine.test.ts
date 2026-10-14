import { describe, it, expect } from 'vitest'
import {
  억, 만, checkEligibility, survivesRaise, blendedPlan, pmt, loanNeed,
  marriageGiftWindow, newbornLoanDeadline, purchaseWindowForNewborn, ymd,
  type Household, type HomePurchase,
} from '../index'

/** 가상고객 — 스토리라인 03. 준호 탭의 확정값 */
const client: Household = {
  annualIncome: 만(7_600),
  incomes: [만(4_200), 만(3_400)],
  netWorth: 만(24_340),
  marriageDate: new Date('2025-10-15'),
  childBirthDates: [],
}
const purchase: HomePurchase = {
  price: 억(6),
  equity: 만(24_952),
  closingCosts: 만(1_200), // 취득세·중개수수료 등 가정 (세금설계에서 정밀화)
  applyDate: new Date('2029-06-01'),
}
const NEED = loanNeed(purchase) // 6억 + 1,200만 − 2억 4,952만 = 3억 6,248만

describe('세 개의 벽 — 신혼부부전용 구입자금', () => {
  const e = checkEligibility('newlywed', client, purchase)

  it('필요대출액은 3억 6,248만', () => expect(NEED).toBe(만(36_248)))

  it('현재 소득으로는 적격이다 (평균 소득이라 탈락한다는 초기 가정은 틀렸다)', () => {
    expect(e.eligible).toBe(true)
  })
  it('벽 1: 소득 여유가 900만원뿐이다', () => {
    expect(e.incomeHeadroom).toBe(만(900))
  })
  /**
   * 카드 stake 문구가 기대는 숫자다. 여기가 바뀌면 seed-cards.json 의
   * income·raise_plan stake 와 eval/golden.jsonl g03 note 도 같이 바꿔야 한다.
   * (초기 설계안의 "+500만원이면 자격 상실"은 틀렸다 — 여유가 900만원이다)
   */
  it('벽 1: 경계는 +900만원이다. 딱 900만은 적격, 1원 더는 탈락', () => {
    expect(survivesRaise('newlywed', client, purchase, 만(500)).eligible).toBe(true)
    expect(survivesRaise('newlywed', client, purchase, 만(900)).eligible).toBe(true)
    expect(survivesRaise('newlywed', client, purchase, 만(900) + 1).eligible).toBe(false)
    expect(survivesRaise('newlywed', client, purchase, 만(1_000)).eligible).toBe(false)
  })
  it('벽 1: 어느 쪽이 올라도 합산 기준이므로 같다', () => {
    expect(survivesRaise('newlywed', client, purchase, 만(1_000), 1).eligible).toBe(false)
  })
  it('벽 2: 한도 3.2억 < 필요 3.6248억 → 4,248만 부족', () => {
    expect(NEED - e.limit).toBe(만(4_248))
  })
  it('벽 3: 주택가격 6억은 경계선 — 1원만 넘어도 탈락', () => {
    expect(checkEligibility('newlywed', client, { ...purchase, price: 억(6) + 1 }).eligible).toBe(false)
  })
})

describe('출산하면 세 벽이 동시에 풀린다 — 신생아 특례', () => {
  const withChild: Household = { ...client, childBirthDates: [new Date('2027-09-01')] }
  const e = checkEligibility('newborn', withChild, purchase)

  it('적격', () => expect(e.eligible).toBe(true))
  it('소득 상한 2억(맞벌이) → 여유 1.24억', () => expect(e.incomeHeadroom).toBe(억(2) - 만(7_600)))
  it('한도 4억 ≥ 필요 3.6248억', () => expect(e.limit).toBeGreaterThanOrEqual(NEED))
  it('무자녀면 탈락', () => expect(checkEligibility('newborn', client, purchase).eligible).toBe(false))
  it('출산 후 2년 지나 접수하면 탈락', () => {
    const late = { ...purchase, applyDate: new Date('2029-10-01') }
    expect(checkEligibility('newborn', withChild, late).eligible).toBe(false)
  })
})

describe('벽 2의 금액 환산 — 월 상환액', () => {
  const mixed = blendedPlan(NEED, 억(3.2), 0.0385, 0.045)
  const single = blendedPlan(NEED, 억(4), 0.033, 0.045)

  it('혼합(3.2억@3.85% + 4,248만@4.5%) ≈ 월 171.5만', () => {
    expect(mixed.monthly / 10_000).toBeCloseTo(171.5, 0)
    expect(mixed.tranches).toHaveLength(2)
  })
  it('신생아 특례 단독(3.6248억@3.3%) ≈ 월 158.8만', () => {
    expect(single.monthly / 10_000).toBeCloseTo(158.8, 0)
    expect(single.tranches).toHaveLength(1)
  })
  it('차액 월 12~13만, 30년 누적 약 4,600만', () => {
    const diffMonthly = (mixed.monthly - single.monthly) / 10_000
    expect(diffMonthly).toBeGreaterThan(12)
    expect(diffMonthly).toBeLessThan(13)
    expect((diffMonthly * 360) / 10_000).toBeCloseTo(0.46, 1) // 억 단위
  })
  it('pmt 기본 검산: 1억 @ 0% 30년 = 월 27.78만', () => {
    expect(pmt(억(1), 0) / 10_000).toBeCloseTo(27.78, 1)
  })
})

describe('시점 제약의 중첩', () => {
  it('증여공제 창구는 2027-10까지 — 전세 만기와 같은 달', () => {
    expect(ymd(marriageGiftWindow(client.marriageDate).to)).toBe('2027-10-15')
  })
  it('2027-09 출생이면 신생아 특례 접수 기한은 2029-09', () => {
    expect(ymd(newbornLoanDeadline(new Date('2027-09-01')))).toBe('2029-09-01')
  })
  it('매수 가능 창구 = [출생일, 출생일+2년]', () => {
    const w = purchaseWindowForNewborn(new Date('2027-09-01'))
    expect(ymd(w.from)).toBe('2027-09-01')
    expect(ymd(w.to)).toBe('2029-09-01')
  })
})
