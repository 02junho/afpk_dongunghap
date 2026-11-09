/**
 * 질문 틀 — 6테마 × 5문항 = 30문항 (11.05 목표 질문 · docs/20 · docs/23).
 * 틀은 모든 고객이 같다. 고객마다 달라지는 건 planned 값(정답지)뿐이고, 그 값은 재무설계 결과(Word · PDF)에서 채운다.
 * 문항을 고치면 docs/20 도 같이 고친다.
 *
 * 허용 범위는 없다 (11.05 사용자 결정): 재무설계 결과와 조금이라도 다르면 다른 것이다.
 *   금액 · 나이 · 개수 · 비율 · 보기 모두 같아야 🟢, 다르면 🔴. (규칙: tolerance 0 — src/judge/deterministic.ts)
 *
 * 목표 질문 (11.05 밤 사용자 결정, 팀원 제안): 부부에게 계획 값을 **보여 주지 않고** 목표를 묻는다.
 *   "은퇴 후 한 달 생활비는 얼마를 원하나요?" → 숫자를 적거나(금액은 만 원) 보기에서 고른다.
 *   보기는 모든 고객에게 같다 — 계획 값으로 보기를 만들면 답을 알려 주게 된다 (다른 답 후보는 쓰지 않는다).
 *   그래서 외워서 답할 수 있는 목표만 묻는다. 계산 결과(보장성 보험료 153,988원)는 보기로 바꿔 묻는다.
 *   말로 적기 답만 AI 가 계획과 같은 뜻인지 본다.
 *
 * 해당 없음 (11.05 사용자 결정 A): 모든 칸에 "아직 모름" · "해당 없음"이 붙는다.
 *   맞지 않는 질문은 건너뛰지 않고 설계사가 정답지에 "해당 없음"을 넣는다 (AI 는 넣지 않는다).
 *   나중에 계획이 생겨 다른 답을 고르면 그것도 🔴 로 잡힌다.
 *   number 칸의 options = 값이 아닌 답(아직 모름 · 해당 없음). 정답지가 "해당 없음"이면 "해당 없음"만 같다.
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
  /** choice: 보기 전부 + 아직 모름 · 해당 없음 (계획 값도 이 중 하나) · number/date: 값이 아닌 답 (아직 모름 · 해당 없음) */
  options?: string[]
  /** number 의 0 을 후보로 넣을 때 이름 ("지원 없음") */
  zero?: string
  /** 개수 · 비율 후보를 규칙 대신 이 값들로 (계획 값은 빠진다) */
  picks?: number[]
  /** 개수 뒤에 붙는 말 ("명", "개월") */
  suffix?: string
  /** 금액이 매달(month) · 매년(year) 금액인지. 없으면 한 번에 드는 금액 — 문서의 "원/월납" · "연 …" 표기와 맞는지 규칙이 본다 (11.05) */
  per?: 'month' | 'year'
  allowCondition?: boolean
  stake: string
  /** 재무설계 결과에서 무엇을 찾아 넣나 — AI 가 읽는 안내. 팀 문서 이름(부동산 · 보험)이 아니라 "무엇을" 적는다 (다른 설계사 문서에서도 통하게) */
  find: string
  /** 가상고객(에이피 · 에피케) 예시 값 — 테스트 · 시연용 "예시 값으로 채우기" */
  example: string
}

export const KNOW = '아직 모름'
/** 이 고객에게 맞지 않는 질문 — 설계사만 정답지에 넣는다 (11.05 A) */
export const NA = '해당 없음'
/** 값이 아닌 답 — 모든 칸에 붙는다 */
export const NON_VALUE = [KNOW, NA]
const pick = (...choices: string[]) => [...choices, ...NON_VALUE]

export const SLOTS: Slot[] = [
  // ── 1주 · 주택 ──
  { key: 't1_buy_way', week: 1, type: 'choice', label: '집 마련 방법', question: '집은 어떤 방법으로 마련하고 싶나요?',
    options: pick('청약을 먼저 노린다', '기존 집을 산다', '전세 · 월세로 지낸다'),
    stake: '청약이면 계약금 · 중도금 시점이, 매수면 잔금 시점이 정해짐', find: '주택 마련 방법 (청약 · 매매 · 전월세)', example: '청약을 먼저 노린다' },
  { key: 't1_home_price', week: 1, type: 'number', unit: 'krw', label: '목표 집값', question: '마련하고 싶은 집값은 얼마인가요?',
    options: NON_VALUE,
    stake: '오르면 대출과 직접 낼 돈이 함께 늘어남', find: '목표 주택 가격(매매가 또는 보증금)', example: '480000000' },
  { key: 't1_buy_year', week: 1, type: 'number', unit: 'count', suffix: '년', label: '내 집 마련 시기', question: '내 집은 언제쯤 마련하고 싶나요?',
    options: NON_VALUE,
    stake: '출산 시점과 겹치는지 · 대출 상환이 언제 시작되는지가 바뀜', find: '내 집 마련(입주 · 매수) 목표 연도', example: '2032' },
  { key: 't1_loan_max', week: 1, type: 'number', unit: 'krw', label: '집 대출 최대 금액', question: '집 살 때 대출은 최대 얼마까지 받을 생각인가요?',
    zero: '대출 받지 않는다', options: NON_VALUE,
    stake: '매달 갚는 돈과 부채 지표가 이 금액에서 정해짐', find: '주택담보대출 목표(최대) 금액', example: '330000000' },
  { key: 't1_save_monthly', week: 1, type: 'number', unit: 'krw', per: 'month', label: '집 마련 월 적립액', question: '집 마련을 위해 한 달에 얼마씩 모으고 싶나요?',
    zero: '따로 모으지 않는다', options: NON_VALUE,
    stake: '줄면 집 살 때 직접 낼 돈이 모자람', find: '주택자금 월 적립액 (지금 시기 기준)', example: '1200000' },

  // ── 2주 · 출산/육아 ──
  { key: 't2_child_when', week: 2, type: 'choice', label: '첫 아이 시기', question: '첫 아이는 언제쯤 갖고 싶나요?',
    options: pick('1년 안', '1~2년 안', '3년 뒤 이후', '갖지 않는다'),
    stake: '소득 공백이 시작되는 시점. 내 집 마련 시점과 맞물림', find: '첫 출산 계획 시기', example: '1~2년 안' },
  { key: 't2_child_count', week: 2, type: 'number', unit: 'count', suffix: '명', label: '자녀 수', question: '아이는 몇 명을 원하나요?',
    zero: '아이 계획 없음', options: NON_VALUE,
    stake: '교육비 · 집 크기 · 외벌이 기간이 모두 달라짐', find: '자녀 계획 수', example: '1' },
  { key: 't2_leave_months', week: 2, type: 'number', unit: 'count', suffix: '개월', label: '출산 뒤 쉬는 기간', question: '출산 뒤 일은 몇 개월 쉬고 싶나요?',
    zero: '쉬지 않는다', options: NON_VALUE,
    stake: '그 기간이 외벌이. 프리랜서는 육아휴직 급여가 없음', find: '출산 · 육아로 일을 쉬는 기간 (개월)', example: '6' },
  { key: 't2_work_after', week: 2, type: 'choice', label: '쉰 뒤 일', question: '쉰 뒤에는 일을 어떻게 하고 싶나요?',
    options: pick('예전처럼', '줄여서', '그만둔다'),
    stake: '생활비 분담 · 대출 상환 능력이 바뀜', find: '출산 뒤 일(소득) 계획', example: '예전처럼' },
  { key: 't2_baby_monthly', week: 2, type: 'number', unit: 'krw', per: 'month', label: '출산 · 육아 월 적립액', question: '출산 · 육아 준비로 한 달에 얼마씩 모으고 싶나요?',
    zero: '따로 모으지 않는다', options: NON_VALUE,
    stake: '줄면 공백기 생활비를 예금에서 꺼내야 함', find: '출산 · 육아 준비자금 월 적립액', example: '490000' },

  // ── 3주 · 노후 ──
  { key: 't3_husband_retire', week: 3, type: 'number', unit: 'age', label: '남편 은퇴 나이', question: '남편분은 몇 살까지 일하고 싶나요?',
    options: NON_VALUE,
    stake: '퇴직연금 받는 시점 · 노후 자금 목표가 바뀜', find: '남편 은퇴 목표 나이', example: '60' },
  { key: 't3_wife_retire', week: 3, type: 'number', unit: 'age', label: '아내 은퇴 나이', question: '아내분은 몇 살까지 일하고 싶나요?',
    options: NON_VALUE,
    stake: '퇴직금이 없으면 노후 소득 격차가 벌어짐', find: '아내 은퇴 목표 나이', example: '60' },
  { key: 't3_life_monthly', week: 3, type: 'number', unit: 'krw', per: 'month', label: '은퇴 후 월 생활비', question: '은퇴 후 한 달 생활비는 얼마를 원하나요?',
    options: NON_VALUE,
    stake: '노후에 필요한 돈 전체가 이 금액에서 계산됨', find: '은퇴 후 부부 월 생활비 목표 (받을 연금액이 아니라 쓸 돈)', example: '3000000' },
  { key: 't3_husband_pension', week: 3, type: 'number', unit: 'krw', per: 'month', label: '남편 노후 준비 월 납입액', question: '남편분 이름으로 노후 준비(연금 등)에 한 달 얼마씩 넣고 싶나요?',
    zero: '넣지 않는다', options: NON_VALUE,
    stake: '소득이 줄면 가장 먼저 끊김. 세액공제도 함께 줄어듦', find: '남편 명의 연금저축 · IRP 등 노후 준비 월 납입액', example: '500000' },
  { key: 't3_wife_pension', week: 3, type: 'number', unit: 'krw', per: 'month', label: '아내 노후 준비 월 납입액', question: '아내분 이름으로 노후 준비(연금 등)에 한 달 얼마씩 넣고 싶나요?',
    zero: '넣지 않는다', options: NON_VALUE,
    stake: '부부 사이 노후 준비 격차가 여기서 정해짐', find: '아내 명의 연금저축 · IRP · 노란우산 등 노후 준비 월 납입액 (합계)', example: '350000' },

  // ── 4주 · 보험 ──
  { key: 't4_premium_way', week: 4, type: 'choice', label: '보험료 방향', question: '보험료는 어떻게 하고 싶나요?',
    options: pick('늘려서라도 보장을 채운다', '지금 수준을 유지한다', '줄인다'),
    stake: '늘면 저축이, 줄면 보장이 줄어듦', find: '보장성 보험료를 늘리는지 · 유지하는지 · 줄이는지', example: '늘려서라도 보장을 채운다' },
  { key: 't4_cancer_cover', week: 4, type: 'number', unit: 'krw', label: '암 진단비', question: '암 같은 큰 병에 대비한 진단비는 얼마를 원하나요?',
    options: NON_VALUE,
    stake: '치료로 일을 쉬는 동안 생활비를 메우는 돈', find: '암 진단비 목표 금액 (기존 + 보강 합계)', example: '60000000' },
  { key: 't4_pregnancy_policy', week: 4, type: 'choice', label: '임신 · 출산 보험 시기', question: '임신 · 출산 대비 보험은 언제 들고 싶나요?',
    options: pick('임신 전에', '임신 중에', '들지 않는다'),
    stake: '임신한 뒤에는 가입이 제한됨', find: '임신 · 출산 특약(태아 보험) 가입 시기', example: '임신 전에' },
  { key: 't4_top_risk', week: 4, type: 'choice', label: '가장 대비할 위험', question: '가장 대비하고 싶은 위험은 무엇인가요?',
    options: pick('큰 병 · 사고 의료비', '일을 못 하게 됨', '사망', '노후 의료비'),
    stake: '두 분 답이 다르면 보험료를 어디에 쓸지가 달라짐', find: '보장 우선순위', example: '큰 병 · 사고 의료비' },
  { key: 't4_policy_plan', week: 4, type: 'choice', label: '지금 보험 처리', question: '지금 든 보험은 어떻게 하고 싶나요?',
    options: pick('그대로 둔다', '부족한 보장만 더한다', '새로 다시 짠다'),
    stake: '한 분만 알고 있으면 가입 · 해지가 미뤄짐', find: '기존 보험 처리 방침', example: '부족한 보장만 더한다' },

  // ── 5주 · 부채 ──
  { key: 't5_debt_way', week: 5, type: 'choice', label: '지금 빚 갚는 방법', question: '지금 있는 빚(할부 등)은 어떻게 갚고 싶나요?',
    options: pick('미리 한꺼번에 갚는다', '정해진 대로 나눠 갚는다', '갚을 빚이 없다'),
    stake: '미리 갚으면 비상금이 줄고, 나눠 갚으면 출산기에 할부가 남음', find: '기존 부채(할부 · 학자금 등) 상환 방법', example: '미리 한꺼번에 갚는다' },
  { key: 't5_rate_type', week: 5, type: 'choice', label: '집 대출 금리 방식', question: '집 대출 금리는 어떤 방식을 원하나요?',
    options: pick('고정금리', '변동금리'),
    stake: '변동이면 금리가 오를 때 매달 갚는 돈이 커짐', find: '주택담보대출 금리 방식', example: '고정금리' },
  { key: 't5_loan_years', week: 5, type: 'number', unit: 'count', suffix: '년', label: '집 대출 기간', question: '집 대출은 몇 년에 걸쳐 갚고 싶나요?',
    options: NON_VALUE,
    stake: '짧으면 매달 갚는 돈이, 길면 이자가 늘어남', find: '주택담보대출 상환 기간 (년)', example: '30' },
  { key: 't5_repay_ratio', week: 5, type: 'number', unit: 'percent', label: '상환 부담 한도 (%)', question: '대출 갚는 돈은 소득의 몇 %까지 괜찮나요?',
    options: NON_VALUE,
    stake: '넘으면 집값이나 대출 규모를 다시 정해야 함', find: '소득 대비 대출 원리금 상환 비율 한도 (%)', example: '20' },
  { key: 't5_account_rule', week: 5, type: 'choice', label: '생활비 통장', question: '생활비 통장은 어떻게 나누고 싶나요?',
    options: pick('하나로 합친다', '공동 + 개인', '각자'),
    stake: '저축 목표를 누가 실행하는지 흐려짐', find: '자금 관리(통장) 방식', example: '공동 + 개인' },

  // ── 6주 · 투자 (팀원 제안) ──
  { key: 't6_emergency_where', week: 6, type: 'choice', label: '출산 · 비상자금 두는 곳', question: '출산 · 비상자금은 어디에 두고 싶나요?',
    options: pick('예 · 적금', '일부 투자', '투자 위주'),
    stake: '급할 때 꺼낼 돈이 가격 변동에 노출되는 정도', find: '출산 · 비상자금을 어디에 두는지 (예적금 · 투자)', example: '예 · 적금' },
  { key: 't6_house_fund_where', week: 6, type: 'choice', label: '주택자금 두는 곳', question: '주택자금은 어디에 두고 싶나요?',
    options: pick('예 · 적금', '절반씩', '투자 위주'),
    stake: '집 살 돈이 가격 변동에 노출되는 정도', find: '주택자금 운용 방식 (예적금 · 절반씩 · 투자)', example: '절반씩' },
  { key: 't6_retire_fund_where', week: 6, type: 'choice', label: '노후자금 두는 곳', question: '노후자금은 어디에 두고 싶나요?',
    options: pick('예 · 적금', '절반씩', '투자 위주'),
    stake: '한 분은 안정형 · 한 분은 적극형이면 노후 목표가 흔들림', find: '노후자금(연금 등) 운용 방식', example: '절반씩' },
  { key: 't6_after_return', week: 6, type: 'choice', label: '복직 뒤 투자 비중', question: '출산 뒤 일에 복귀하면 투자 비중은 어떻게 하고 싶나요?',
    options: pick('단계적으로 늘린다', '지금 그대로', '줄인다'),
    stake: '소득이 회복된 뒤 자산 배분이 바뀌는 시점', find: '복직(소득 회복) 뒤 투자 비중 계획', example: '단계적으로 늘린다' },
  { key: 't6_safe_shift', week: 6, type: 'choice', label: '안전자산으로 옮기는 시기', question: '집 사기 전, 주택자금은 언제 안전자산으로 옮기고 싶나요?',
    options: pick('입주 1년 전', '입주 2년 전', '입주 3년 전', '옮기지 않는다'),
    stake: '늦으면 입주 직전 가격 하락에 그대로 노출됨', find: '주택자금을 예금 등 안전자산으로 옮기는 시기', example: '입주 2년 전' },
]

export const slotsOfWeek = (week: number) => SLOTS.filter(s => s.week === week)
export const themeOfWeek = (week: number) => THEMES.find(t => t.week === week)!
export const slotByKey = (key: string) => SLOTS.find(s => s.key === key)

/** 허용 범위 없음 — 계획과 같아야만 같다 (11.05) */
export const EXACT = 0

/** 틀 + 값 → 판정에 쓰는 카드 */
export function slotCard(s: Slot, planned: string | number): Card {
  return {
    key: s.key, type: s.type, unit: s.unit, category: themeOfWeek(s.week).category, label: s.label, question: s.question,
    plannedValue: s.type === 'number' && !NON_VALUE.includes(String(planned)) ? Number(planned) : String(planned), tolerance: EXACT, options: s.options,
    stake: s.stake, allowCondition: s.allowCondition,
  }
}
