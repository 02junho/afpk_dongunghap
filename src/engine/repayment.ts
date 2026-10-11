import type { RepaymentPlan, Won } from './types'

/** 원리금균등 월 상환액. rate는 연이율(0.0385), years는 만기 */
export function pmt(principal: Won, rate: number, years = 30): Won {
  const r = rate / 12
  const n = years * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

export interface Tranche { label: string; principal: Won; rate: number }

export function repaymentPlan(tranches: Tranche[], years = 30): RepaymentPlan {
  const rows = tranches.map(t => ({ ...t, monthly: pmt(t.principal, t.rate, years) }))
  const monthly = rows.reduce((s, t) => s + t.monthly, 0)
  const principal = rows.reduce((s, t) => s + t.principal, 0)
  return { monthly, tranches: rows, totalInterest: monthly * years * 12 - principal }
}

/**
 * 필요대출액이 정책대출 한도를 넘을 때: 한도까지 정책금리, 초과분은 일반금리.
 * 이게 "세 개의 벽" 두 번째 벽의 금액 환산이다.
 */
export function blendedPlan(need: Won, policyLimit: Won, policyRate: number, marketRate: number, years = 30) {
  const policyPart = Math.min(need, policyLimit)
  const marketPart = Math.max(0, need - policyLimit)
  const tranches: Tranche[] = [{ label: '정책대출', principal: policyPart, rate: policyRate }]
  if (marketPart > 0) tranches.push({ label: '일반 주담대', principal: marketPart, rate: marketRate })
  return repaymentPlan(tranches, years)
}

/** 필요대출액 = 집값 + 부대비용 − 자기자금 */
export function loanNeed(p: { price: Won; equity: Won; closingCosts?: Won }): Won {
  return p.price + (p.closingCosts ?? 0) - p.equity
}
