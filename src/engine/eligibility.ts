import { PROGRAMS } from './programs'
import { addYears } from './dates'
import type { Eligibility, Household, HomePurchase, LoanProgram } from './types'

export function checkEligibility(
  program: LoanProgram,
  h: Household,
  p: HomePurchase,
): Eligibility {
  const r = PROGRAMS[program]
  const reasons: string[] = []
  const isDual = h.incomes[0] > 0 && h.incomes[1] > 0
  const cap = isDual && r.dualIncomeCap ? r.dualIncomeCap : r.incomeCap

  if (h.annualIncome > cap) reasons.push(`소득 ${fmt(h.annualIncome)} > 상한 ${fmt(cap)}`)
  if (r.perPersonCap && isDual) {
    for (const [i, inc] of h.incomes.entries())
      if (inc > r.perPersonCap) reasons.push(`배우자${i + 1} 소득 ${fmt(inc)} > 1인 상한 ${fmt(r.perPersonCap)}`)
  }
  if (h.netWorth > r.netWorthCap) reasons.push(`순자산 ${fmt(h.netWorth)} > 상한 ${fmt(r.netWorthCap)}`)
  if (p.price > r.priceCap) reasons.push(`주택가격 ${fmt(p.price)} > 상한 ${fmt(r.priceCap)}`)

  if (r.marriageWithinYears !== undefined) {
    const deadline = addYears(h.marriageDate, r.marriageWithinYears)
    if (p.applyDate > deadline) reasons.push(`혼인 ${r.marriageWithinYears}년 경과`)
  }
  if (r.birthWithinYears !== undefined) {
    const ok = h.childBirthDates.some(b => {
      const recent = addYears(b, r.birthWithinYears!) >= p.applyDate && b <= p.applyDate
      const afterCutoff = !r.birthOnOrAfter || b >= r.birthOnOrAfter
      return recent && afterCutoff
    })
    if (!ok) reasons.push(`대출접수일 기준 ${r.birthWithinYears}년 내 출생 자녀 없음`)
  }

  return {
    program,
    eligible: reasons.length === 0,
    reasons,
    incomeHeadroom: cap - h.annualIncome,
    limit: r.loanLimit,
  }
}

/** 한 배우자 연봉이 delta만큼 올랐을 때도 적격인가 */
export function survivesRaise(program: LoanProgram, h: Household, p: HomePurchase, delta: number, who: 0 | 1 = 0) {
  const incomes: [number, number] = [...h.incomes] as [number, number]
  incomes[who] += delta
  return checkEligibility(program, { ...h, incomes, annualIncome: incomes[0] + incomes[1] }, p)
}

/** 6억원 · 6.5억원 · 6.25억원 · 7,600만원 — 억 단위는 뒤 0 을 떼고 최대 소수 2자리 */
export const fmt = (won: number) =>
  won >= 100_000_000
    ? `${parseFloat((won / 100_000_000).toFixed(2))}억원`
    : `${Math.round(won / 10_000).toLocaleString()}만원`
