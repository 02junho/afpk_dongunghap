/**
 * 수정 방향 검토 기준 (11.14 팀 요청 — 예슬 ver. "수정 검토 항목 · 수정 방향 제안").
 *
 * AI 가 방향을 제안하지 않는다. 질문마다 팀이 미리 적어 둔
 *  · related: 이 답이 계획과 다르면 함께 다시 볼 질문 (같은 틀 안의 key)
 *  · check:   설계사가 수정 방향을 정할 때 볼 기준 (모든 고객에게 같은 기준. 고객 숫자를 새로 계산하지 않는다)
 * 을 처리 대기 화면에 그대로 보여 준다. 방향은 설계사가 정한다.
 * 숫자 기준은 팀 4단계 문서가 쓴 가이드라인만 (거주주택마련부채상환지표 20% · 은행 DSR 40%).
 */
export interface Review { related: string[]; check: string }

export const REVIEW: Record<string, Review> = {
  // 1주 · 주택
  t1_buy_way: { related: ['t1_buy_year', 't1_save_monthly', 't6_safe_shift'],
    check: '청약이면 계약금 · 중도금 낼 시기에, 매수면 잔금 낼 시기에 모아 둔 돈이 맞춰지는지 봅니다.' },
  t1_home_price: { related: ['t1_loan_max', 't1_save_monthly', 't5_repay_ratio'],
    check: '집값이 바뀌어도 대출 상환액이 소득의 20%(거주주택마련부채상환지표) 안에 드는지, 직접 낼 돈이 입주 때까지 모이는지 봅니다.' },
  t1_buy_year: { related: ['t1_save_monthly', 't2_child_when', 't6_safe_shift'],
    check: '앞당기면 남은 기간에 직접 낼 돈이 모이는지, 출산 · 소득 공백 시기와 겹치는지 봅니다.' },
  t1_loan_max: { related: ['t1_home_price', 't5_loan_years', 't5_repay_ratio'],
    check: '대출을 늘리면 상환액이 소득의 20% 안에 드는지, 은행 DSR 40% 안인지, 금리가 오를 때도 버티는지 봅니다.' },
  t1_save_monthly: { related: ['t1_buy_year', 't2_baby_monthly', 't3_wife_pension'],
    check: '적립액이 줄면 입주 시기를 늦출지 · 집값을 낮출지, 늘리면 다른 목적 적립이 줄지 않는지 봅니다.' },

  // 2주 · 출산/육아
  t2_child_when: { related: ['t2_baby_monthly', 't1_buy_year', 't4_pregnancy_policy'],
    check: '앞당기면 출산 준비자금이 그때까지 모이는지, 임신 · 출산 보험이 임신 전에 들어가는지 봅니다.' },
  t2_child_count: { related: ['t2_baby_monthly', 't1_home_price', 't2_leave_months'],
    check: '자녀 수가 바뀌면 출산 · 육아 자금, 필요한 집 크기, 외벌이 기간을 다시 봅니다.' },
  t2_leave_months: { related: ['t2_baby_monthly', 't6_emergency_where', 't3_wife_pension'],
    check: '쉬는 기간이 길어지면 그동안의 생활비를 비상자금으로 메울 수 있는지, 노후 납입을 쉬어도 되는지 봅니다.' },
  t2_work_after: { related: ['t5_repay_ratio', 't3_wife_pension', 't6_after_return'],
    check: '복귀 뒤 소득이 줄면 대출 상환액이 줄어든 소득의 20% 안에 드는지, 노후 납입을 유지할 수 있는지 봅니다.' },
  t2_baby_monthly: { related: ['t2_leave_months', 't1_save_monthly', 't6_emergency_where'],
    check: '적립액이 줄면 소득 공백기 생활비를 어디서 꺼낼지, 주택 적립에서 옮겨 올지 봅니다.' },

  // 3주 · 노후
  t3_husband_retire: { related: ['t3_life_monthly', 't3_husband_pension', 't5_loan_years'],
    check: '은퇴가 당겨지면 연금을 받기 전 소득 공백 기간과, 은퇴 전에 대출을 다 갚는지 봅니다.' },
  t3_wife_retire: { related: ['t3_life_monthly', 't3_wife_pension'],
    check: '은퇴가 당겨지면 아내 명의 노후자산으로 공백기를 메울 수 있는지 봅니다.' },
  t3_life_monthly: { related: ['t3_husband_pension', 't3_wife_pension', 't3_husband_retire'],
    check: '생활비 목표가 바뀌면 노후에 필요한 돈 전체를 다시 계산하고, 지금 납입액으로 모자라는지 봅니다.' },
  t3_husband_pension: { related: ['t3_life_monthly', 't3_wife_pension', 't1_save_monthly'],
    check: '납입액을 줄이면 노후 목표에 모자라는 돈과 줄어드는 세액공제를 봅니다. 중도 해지는 세금이 붙습니다.' },
  t3_wife_pension: { related: ['t3_life_monthly', 't3_husband_pension', 't2_leave_months'],
    check: '부부 사이 노후 준비 격차가 다시 벌어지는지, 출산 공백기에 납입을 쉬었다 이어 갈 수 있는지 봅니다.' },

  // 4주 · 보험
  t4_premium_way: { related: ['t4_cancer_cover', 't4_policy_plan', 't1_save_monthly'],
    check: '보험료를 줄이면 빠지는 보장을, 늘리면 줄어드는 저축을 함께 봅니다.' },
  t4_cancer_cover: { related: ['t4_premium_way', 't4_top_risk'],
    check: '진단비로 치료하며 일을 쉬는 동안의 생활비를 메울 수 있는지 봅니다.' },
  t4_pregnancy_policy: { related: ['t2_child_when', 't4_premium_way'],
    check: '임신 · 출산 특약은 임신 뒤 가입이 제한되므로 출산 계획보다 먼저 들어가는지 봅니다.' },
  t4_top_risk: { related: ['t4_cancer_cover', 't4_premium_way', 't4_policy_plan'],
    check: '두 분이 가장 걱정하는 위험에 보험료가 쓰이고 있는지, 보장 순서를 다시 정할지 봅니다.' },
  t4_policy_plan: { related: ['t4_premium_way', 't4_top_risk'],
    check: '바꾸거나 해지하기 전에 새 보험 가입이 가능한지, 빠지는 보장 기간이 생기지 않는지 봅니다.' },

  // 5주 · 부채
  t5_debt_way: { related: ['t6_emergency_where', 't2_baby_monthly'],
    check: '미리 갚으면 남는 비상자금이 충분한지, 나눠 갚으면 출산기에 할부가 남는지 봅니다.' },
  t5_rate_type: { related: ['t5_repay_ratio', 't1_loan_max'],
    check: '변동금리면 금리가 오를 때 상환액이 소득의 20%를 넘지 않는지 봅니다.' },
  t5_loan_years: { related: ['t5_repay_ratio', 't3_husband_retire', 't1_loan_max'],
    check: '기간을 줄이면 매달 상환액이 소득의 20% 안인지, 늘리면 은퇴 뒤까지 갚게 되는지 봅니다.' },
  t5_repay_ratio: { related: ['t1_loan_max', 't1_home_price', 't5_loan_years'],
    check: '한도가 낮아지면 대출 규모나 집값을 다시 정합니다. 가이드라인은 소득의 20%, 은행 DSR은 40%입니다.' },
  t5_account_rule: { related: ['t1_save_monthly', 't2_baby_monthly'],
    check: '저축 목표마다 누가 어느 통장에서 넣는지가 정해져 있는지 봅니다.' },

  // 6주 · 투자
  t6_emergency_where: { related: ['t2_leave_months', 't5_debt_way'],
    check: '급할 때 바로 꺼낼 돈이 가격이 움직이는 상품에 들어가 있지 않은지 봅니다.' },
  t6_house_fund_where: { related: ['t6_safe_shift', 't1_buy_year'],
    check: '집 살 때까지 남은 기간과 두 분의 투자성향에 맞게 나뉘어 있는지 봅니다.' },
  t6_retire_fund_where: { related: ['t3_husband_pension', 't3_wife_pension'],
    check: '두 분의 투자성향이 다르면 명의별로 나눠 운용할지 봅니다.' },
  t6_after_return: { related: ['t2_work_after', 't6_retire_fund_where'],
    check: '소득이 회복된 뒤에 비중을 바꾸는지, 비상자금이 먼저 채워졌는지 봅니다.' },
  t6_safe_shift: { related: ['t1_buy_year', 't6_house_fund_where'],
    check: '입주 시기가 바뀌면 안전자산으로 옮기는 시점도 같이 옮깁니다.' },
}
