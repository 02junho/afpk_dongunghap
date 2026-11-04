/**
 * 질문 틀 — 6테마 × 5문항 = 30문항 (11.04 새 방향, docs/20).
 * 틀은 모든 고객이 같다. 고객마다 달라지는 건 planned 값뿐이고, 그 값은 재무설계 결과(Word)에서 채운다.
 * 문항을 고치면 docs/20 도 같이 고친다.
 *
 * 허용 범위(tolerance)는 판정 규칙(src/judge/deterministic.ts)과 같은 뜻이다:
 *   number = 비율(0.1 = ±10%) · date = 개월. 이 안이면 🟢, 두 배 안이면 🟡, 넘으면 🔴.
 */
import type { Card, CardCategory, NumberUnit } from '../judge/index'

export interface Theme { week: number; category: CardCategory; label: string }

/** 매주 하나씩, 이 순서로. 테마 이름은 기존 주제 값(category)을 그대로 쓴다 — DB enum 을 바꾸지 않으려고 */
export const THEMES: Theme[] = [
  { week: 1, category: 'housing', label: '주택' },
  { week: 2, category: 'children', label: '출산/육아' },
  { week: 3, category: 'retire', label: '노후' },
  { week: 4, category: 'insurance', label: '보험' },
  { week: 5, category: 'debt', label: '부채' },
  { week: 6, category: 'saving', label: '투자' },
]
export const WEEKS = THEMES.length
export const PER_THEME = 5

export interface Slot {
  key: string
  week: number
  type: Card['type']
  unit?: NumberUnit
  label: string
  question: string
  options?: string[]
  tolerance?: number
  allowCondition?: boolean
  stake: string
  /** 재무설계 결과(Word)에서 무엇을 찾아 넣나 — AI 와 설계사가 함께 보는 설명 */
  find: string
  /** 가상고객(에이피 · 에피케) 예시 값 — 테스트 · 시연용 "예시 값으로 채우기" */
  example: string
}

const KNOW = '아직 모름'

export const SLOTS: Slot[] = [
  // ── 1주 · 주택 ──
  { key: 't1_move_when', week: 1, type: 'date', label: '다음 집 이사 시점', question: '다음 집으로는 언제 옮기기로 했나요?', tolerance: 3, allowCondition: true,
    stake: '보증금 돌려받는 시점 · 대출 실행 시점이 함께 움직임', find: '이사(전세 · 매매) 예정 시점', example: '2027-10' },
  { key: 't1_next_deposit', week: 1, type: 'number', unit: 'krw', label: '다음 집 보증금(집값)', question: '다음 집 보증금(또는 집값)은 얼마로 생각하나요?', tolerance: 0.1,
    stake: '모은 돈 · 지원금을 뺀 나머지가 대출 금액', find: '목표 전세 보증금 또는 매매가', example: '300000000' },
  { key: 't1_must_buy', week: 1, type: 'choice', label: '집을 꼭 살지', question: '집을 꼭 사야 한다고 생각하나요?', options: ['꼭 산다', '전세 · 월세로 지낸다', KNOW],
    stake: '두 분 답이 다르면 저축 목표 전체가 달라짐', find: '주택 구입 목표가 있는지', example: '꼭 산다' },
  { key: 't1_buy_when', week: 1, type: 'date', label: '내 집 마련 시점', question: '내 집은 언제쯤 마련할 생각인가요?', tolerance: 6, allowCondition: true,
    stake: '출산 시점과 겹치는지 · 보증금이 매수 자금으로 넘어가는 시점', find: '주택 구입 목표 시점', example: '2032-06' },
  { key: 't1_family_support', week: 1, type: 'number', unit: 'krw', label: '부모님 지원금', question: '집 마련에 부모님 지원금은 얼마로 알고 있나요?', tolerance: 0.1,
    stake: '가장 큰 자금 축. 줄면 그만큼 대출이 늘어남', find: '양가(부모님) 지원 예정 금액', example: '100000000' },

  // ── 2주 · 출산/육아 ──
  { key: 't2_child_when', week: 2, type: 'date', label: '첫 아이 시점', question: '첫 아이는 언제쯤 생각하나요?', tolerance: 6, allowCondition: true,
    stake: '소득 공백이 시작되는 시점. 내 집 마련 시점과 겹침', find: '출산 계획 시점', example: '2029-03' },
  { key: 't2_child_count', week: 2, type: 'number', unit: 'count', label: '자녀 수', question: '아이는 몇 명을 생각하나요?', tolerance: 0,
    stake: '교육비 · 집 크기 · 외벌이 기간이 모두 달라짐', find: '자녀 계획 수', example: '2' },
  { key: 't2_leave_months', week: 2, type: 'number', unit: 'count', label: '출산 뒤 쉬는 기간 (개월)', question: '출산 뒤 일을 쉬는 사람은 몇 개월 쉬나요?', tolerance: 0.25,
    stake: '그 기간이 외벌이. 프리랜서는 육아휴직 급여가 없음', find: '육아 휴직 · 휴업 기간 (개월)', example: '24' },
  { key: 't2_work_after', week: 2, type: 'choice', label: '쉰 뒤 일', question: '쉰 뒤에 그 사람은 일을 어떻게 이어가나요?', options: ['예전처럼', '줄여서', '그만둠', KNOW],
    stake: '생활비 분담 · 대출 상환 능력이 바뀜', find: '출산 뒤 소득(일) 계획', example: '예전처럼' },
  { key: 't2_edu_monthly', week: 2, type: 'number', unit: 'krw', label: '교육비 월 준비액', question: '아이 교육비는 한 달 얼마씩 준비할 생각인가요?', tolerance: 0.1,
    stake: '노후 저축과 같은 돈을 나눠 씀', find: '교육자금 월 적립액', example: '300000' },

  // ── 3주 · 노후 (소득 포함) ──
  { key: 't3_husband_retire', week: 3, type: 'number', unit: 'age', label: '남편 은퇴 나이', question: '남편분은 몇 살까지 일할 생각인가요?', tolerance: 0.04,
    stake: '퇴직연금 받는 시점 · 노후 자금 목표', find: '남편 은퇴 예정 나이', example: '60' },
  { key: 't3_wife_retire', week: 3, type: 'number', unit: 'age', label: '아내 은퇴 나이', question: '아내분은 몇 살까지 일할 생각인가요?', tolerance: 0.04,
    stake: '퇴직금이 없으면 노후 소득 격차가 벌어짐', find: '아내 은퇴 예정 나이', example: '60' },
  { key: 't3_husband_income', week: 3, type: 'text', label: '남편 직장 · 연봉 전망', question: '남편분 직장과 연봉은 앞으로 어떻게 될 것 같나요?',
    stake: '대출 한도와 저축액이 이 소득에서 나옴', find: '남편 소득 전망 (직장 유지 · 이직 · 연봉)', example: '지금 직장 유지, 연봉은 물가만큼 오름' },
  { key: 't3_wife_income', week: 3, type: 'number', unit: 'krw', label: '아내 내년 소득', question: '아내분 내년 소득은 얼마로 보나요?', tolerance: 0.1,
    stake: '생활비 분담 · 대출 심사 · 지역 건보료 · 국민연금', find: '아내 연소득(매출) 예상', example: '40000000' },
  { key: 't3_pension_monthly', week: 3, type: 'number', unit: 'krw', label: '연금 월 납입액', question: '연금(IRP · 연금저축)에는 한 달 얼마씩 넣기로 했나요?', tolerance: 0.1,
    stake: '소득이 줄면 가장 먼저 끊김. 세액공제도 함께 줄어듦', find: '개인연금(IRP · 연금저축) 월 납입액', example: '500000' },

  // ── 4주 · 보험 ──
  { key: 't4_premium_limit', week: 4, type: 'number', unit: 'krw', label: '월 보험료 한도', question: '보험료는 한 달 최대 얼마까지로 정했나요?', tolerance: 0.1,
    stake: '재설계 범위가 이 안에서 정해짐', find: '월 보험료 한도', example: '185000' },
  { key: 't4_policy_plan', week: 4, type: 'choice', label: '지금 보험 처리', question: '지금 든 보험은 어떻게 하기로 했나요?', options: ['그대로 둔다', '설계안대로 바꾼다', KNOW],
    stake: '한 분만 알고 있으면 해지 · 가입이 미뤄짐', find: '보험 재설계 방침', example: '설계안대로 바꾼다' },
  { key: 't4_income_cover', week: 4, type: 'choice', label: '일 못 할 때 대비', question: '둘 중 한 분이 일을 못 하게 될 때를 대비한 보험이 필요하다고 보나요?', options: ['필요', '필요 없음', KNOW],
    stake: '외벌이 기간 · 대출 상환 중에 생기면 계획 전체가 멈춤', find: '소득 보장 보험 필요 여부', example: '필요' },
  { key: 't4_child_policy', week: 4, type: 'choice', label: '자녀 보험 시기', question: '아이가 생기면 자녀 보험은 언제 들 생각인가요?', options: ['임신 중', '태어난 뒤', '안 든다', KNOW],
    stake: '출산 시점과 함께 보험료 한도가 바뀜', find: '자녀(태아) 보험 계획', example: '임신 중' },
  { key: 't4_top_risk', week: 4, type: 'choice', label: '가장 대비할 위험', question: '가장 대비하고 싶은 위험은 무엇인가요?', options: ['큰 병 · 사고 의료비', '일을 못 하게 됨', '사망', '노후 의료비'],
    stake: '두 분 답이 다르면 보험료를 어디에 쓸지가 달라짐', find: '보장 우선순위', example: '일을 못 하게 됨' },

  // ── 5주 · 부채 (양가 지원 성격 · 자금관리 포함) ──
  { key: 't5_loan_max', week: 5, type: 'number', unit: 'krw', label: '집 대출 최대 금액', question: '집 대출은 최대 얼마까지 받기로 했나요?', tolerance: 0.1,
    stake: '보증금 · 지원금과 맞물림. 매달 갚는 돈이 정해짐', find: '대출 목표(최대) 금액', example: '120000000' },
  { key: 't5_loan_name', week: 5, type: 'choice', label: '대출 명의', question: '대출은 누구 이름으로 받기로 했나요?', options: ['남편', '아내', '함께', KNOW],
    stake: '신고 소득이 낮은 쪽이면 한도가 줄어 집 계획이 흔들림', find: '대출 명의', example: '남편' },
  { key: 't5_support_kind', week: 5, type: 'choice', label: '부모님 지원금 성격', question: '부모님 지원금은 받는 돈인가요, 빌리는 돈인가요?', options: ['받는 돈', '빌리는 돈', KNOW],
    stake: '받는 돈이면 혼인 증여공제 기한, 빌리는 돈이면 이자 · 상환 계획과 자금출처 소명', find: '지원금이 증여인지 차용인지', example: '받는 돈' },
  { key: 't5_debt_clear', week: 5, type: 'date', label: '지금 빚 정리 시점', question: '지금 있는 빚(학자금 · 할부 등)은 언제까지 정리하나요?', tolerance: 6, allowCondition: true,
    stake: '대출 심사 때 남아 있으면 한도 · 금리에 영향', find: '기존 부채(학자금 · 할부) 상환 완료 시점', example: '2026-12' },
  { key: 't5_account_rule', week: 5, type: 'choice', label: '생활비 통장', question: '생활비 통장은 어떻게 나누기로 했나요?', options: ['하나로 합친다', '공동 + 개인', '각자', KNOW],
    stake: '저축 목표를 누가 실행하는지 흐려짐', find: '자금 관리(통장) 방식', example: '공동 + 개인' },

  // ── 6주 · 투자 (저축 포함) ──
  { key: 't6_saving_monthly', week: 6, type: 'number', unit: 'krw', label: '월 저축액', question: '매달 함께 저축하는 금액은 얼마인가요?', tolerance: 0.1,
    stake: '모든 목표의 원천', find: '월 저축 · 투자액', example: '1260000' },
  { key: 't6_emergency', week: 6, type: 'number', unit: 'krw', label: '비상금', question: '비상금은 얼마를 늘 남겨 두기로 했나요?', tolerance: 0.1,
    stake: '외벌이 · 이직 때 투자금을 깨지 않으려면 필요', find: '비상예비자금 목표', example: '10000000' },
  { key: 't6_invest_style', week: 6, type: 'choice', label: '공동 자금 굴리는 방식', question: '함께 모은 돈은 어떻게 굴리기로 했나요?', options: ['안전하게', '반반', '적극적으로'],
    stake: '한 분은 안정형 · 한 분은 적극형이면 공동 목표 자금이 흔들림', find: '공동 자금 운용 방식', example: '반반' },
  { key: 't6_invest_ratio', week: 6, type: 'number', unit: 'percent', label: '주식 · 펀드 비율 (%)', question: '모은 돈 중 주식 · 펀드에 넣는 비율은 얼마로 정했나요?', tolerance: 0.25,
    stake: '집 살 돈이 가격 변동에 노출되는 정도', find: '투자 자산 비중 (%)', example: '20' },
  { key: 't6_own_invest', week: 6, type: 'choice', label: '각자 투자 규칙', question: '각자 따로 하는 투자는 어떻게 하기로 했나요?', options: ['하지 않는다', '정한 금액 안에서만', '자유롭게', KNOW],
    stake: '한쪽이 상의 없이 큰돈을 넣으면 공동 목표가 무너짐', find: '개인 투자 규칙', example: '정한 금액 안에서만' },
]

export const slotsOfWeek = (week: number) => SLOTS.filter(s => s.week === week)
export const themeOfWeek = (week: number) => THEMES.find(t => t.week === week)!
export const slotByKey = (key: string) => SLOTS.find(s => s.key === key)

/** 틀 + 값 → 판정에 쓰는 카드 */
export function slotCard(s: Slot, planned: string | number): Card {
  return {
    key: s.key, type: s.type, unit: s.unit, category: themeOfWeek(s.week).category, label: s.label, question: s.question,
    plannedValue: s.type === 'number' ? Number(planned) : String(planned), tolerance: s.tolerance, options: s.options,
    stake: s.stake, allowCondition: s.allowCondition,
  }
}
