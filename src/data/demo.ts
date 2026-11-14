import type { Card, Judgment } from '../judge/index'
import { formatAnswer, formatValue } from '../lib/answer-options'
import { isOtherAnswer, otherText } from '../judge/deterministic'
import { SLOTS, slotCard, slotsOfWeek } from './template'

/** 예시 화면(설계사 코드 전 · 데모 서버)의 카드 = 질문 틀 30칸 + 가상고객 예시 값 (11.04 새 방향) */
export const CARDS: Card[] = SLOTS.map(s => slotCard(s, s.example))
export const byKey = (k: string) => CARDS.find(c => c.key === k)!

/** 예시 화면의 "이번 주" = 1주차 주택 5문항 */
export const BASELINE = slotsOfWeek(1).map(s => s.key)

/** 한 기기 데모에서 라운드 답변·판정을 두는 자리. 2주차에 answers/judgments 테이블로. */
export const answerKey = (id: string) => `round:${id}`
export const judgmentKey = (id: string) => `judgments:${id}`
export interface DraftAnswer { text: string; isCondition: boolean }
export type RoundAnswers = Record<string, Partial<Record<'husband' | 'wife', DraftAnswer>>>

/**
 * 시연·스크린샷용 고정 답변과 판정.
 * home_when은 엔진이 실제로 내는 값이고, text 카드 둘은 LLM 없이도 화면이 뜨도록 고정했다.
 * 실제 플로우는 lib/api.ts → /api/judge 를 탄다. DEMO는 거기서만 분기한다.
 */
export const DEMO_ANSWERS: Record<string, { husband: string; wife: string }> = {
  t1_buy_year: { husband: '2032', wife: '2032' },
  // 팀원 예시 (11.05): 계획 월 300만 — 아내는 350만으로 늘리고 싶다
  t3_life_monthly: { husband: '3000000', wife: '3500000' },
  t6_house_fund_where: { husband: '투자 위주', wife: '예 · 적금' },
  // 말로 적은 답 — 값으로 읽히지 않아 AI 가 계획과 같은 뜻인지 본다
  t2_child_when: { husband: '1~2년 안', wife: '기타: 집 사고 나서요' },
}

export const DEMO_JUDGMENTS: Record<string, Judgment> = {
  t1_buy_year: {
    verdict: 'green', aVsPlan: 'match', bVsPlan: 'match', abAgree: true,
    reason: '', method: 'deterministic',
  },
  t3_life_monthly: {
    verdict: 'red', aVsPlan: 'match', bVsPlan: 'major', abAgree: false,
    reason: '',
    method: 'deterministic',
  },
  t6_house_fund_where: {
    verdict: 'red', aVsPlan: 'major', bVsPlan: 'major', abAgree: false,
    reason: '',
    method: 'deterministic',
  },
  t2_child_when: {
    verdict: 'red', aVsPlan: 'match', bVsPlan: 'major', abAgree: false,
    reason: '아내분은 시기 대신 "집 사고 나서"라고 적음 — 계획(1~2년 안)보다 늦은 시점',
    method: 'llm', promptVersion: 'v3',
  },
}

/** 설계사 큐의 AI 요약 2줄 (AI 활용 2번, summary v4). 3줄째 검토 기준은 화면이 붙인다. 실제로는 judgments.planner_summary. */
export const DEMO_SUMMARY: Record<string, string> = {
  t3_life_monthly: '계획은 월 300만 원, 남편은 계획과 같고 아내는 350만 원으로 답함\n노후에 필요한 돈 전체와 남편 · 아내 노후 준비 월 납입액이 함께 흔들림',
  t6_house_fund_where: '계획은 절반씩인데 남편은 투자 위주, 아내는 예 · 적금으로 답함\n주택자금을 안전자산으로 옮기는 시기와 내 집 마련 시기가 함께 흔들림',
  t2_child_when: '계획은 1~2년 안, 남편은 같고 아내는 "집 사고 나서"라고 적음\n출산 · 육아 월 적립액, 내 집 마련 시기, 임신 · 출산 보험 시기가 함께 흔들림',
}

/** 큐에 올라오는 것: 🔴 전부 + 확인 필요 🟡 (planner_queue 뷰와 같은 조건) */
export const DEMO_QUEUE = Object.keys(DEMO_JUDGMENTS).filter(k => {
  const j = DEMO_JUDGMENTS[k]
  return j.verdict === 'red' || j.needsReview
})

/**
 * 한 기기 데모에서 실제로 답하고 판정까지 돌렸다면 그 결과를 쓴다 (없으면 DEMO).
 * 부부 화면은 이걸 **절대 읽지 않는다** — 설계사 콘솔만 읽는다.
 */
export function loadLiveRound(id = 'baseline'): { answers: RoundAnswers; judgments: Record<string, Judgment> } | null {
  try {
    const a = sessionStorage.getItem(answerKey(id))
    const j = sessionStorage.getItem(judgmentKey(id))
    if (!a || !j) return null
    return { answers: JSON.parse(a), judgments: JSON.parse(j) }
  } catch {
    return null
  }
}

export const VERDICT_CLASS = { green: 'verdict-agree', yellow: 'verdict-talk', red: 'verdict-escalate' } as const

export const VERDICT_TEXT = {
  green: '계획 그대로예요',
  yellow: '확인이 필요해요',
  red: '계획과 달라요',
} as const

/**
 * 11.05: 재무설계 결과와 다르면 다른 것 — 부부 불일치 · 전제 폐기를 나누지 않는다.
 * 예전 판정(plan_stale · couple_conflict)도 "계획과 다름"으로 보인다.
 */
export const KIND_CHIP = {
  plan_diff: { text: '계획과 다름', cls: 'chip-escalate' },
  repeated_yellow: { text: '2연속 확인 필요', cls: 'chip-escalate' },
  needs_review: { text: '확인 필요', cls: 'chip-talk' },
} as const
export const chipOf = (j: { verdict: string; redKind?: string | null }) =>
  j.verdict === 'red' ? KIND_CHIP[j.redKind === 'repeated_yellow' ? 'repeated_yellow' : 'plan_diff'] : KIND_CHIP.needs_review

export const typeLabel = (c: Card) =>
  c.type === 'number' ? (c.unit === 'age' ? '나이' : c.unit === 'count' ? '개수' : c.unit === 'percent' ? '비율' : '금액')
  : c.type === 'date' ? '시점'
  : c.type === 'choice' ? '선택' : '서술'

/** 카드 값 사람이 읽는 형태. 금액은 억/만 단위로 (src/lib/answer-options.ts 와 같은 규칙) */
export function showValue(c: Card): string {
  return formatValue(c, c.plannedValue)
}

/**
 * DB 에 저장된 전제 값(문자열)을 사람이 읽는 형태로. 큐·변경 이력처럼 Card 전체가 없는 곳에서 쓴다.
 * '650000000' → '6.5억원', '2029-12' → '2029년 12월'. 숫자로 못 읽으면 그대로. key 를 주면 "명" · "지원 없음" 까지.
 */
export function showPlanned(type: Card['type'] | undefined, unit: Card['unit'] | null | undefined, raw: string, key = ''): string {
  if (!type || raw === '—') return raw
  if (isOtherAnswer(raw)) return `“${otherText(raw)}” (말로 적음)`
  return formatAnswer({ key, type, unit: unit ?? undefined }, raw)
}

/** 답변 문자열을 사람이 읽는 형태로 ('YYYY-MM' → 'YYYY년 M월', 원 → 억/만, 기타는 적은 글) */
export function showAnswer(c: Card, s: string): string {
  if (isOtherAnswer(s)) return `“${otherText(s)}” (말로 적음)`
  return formatAnswer(c, s)
}

/** 설계사 화면의 답 한 줄 — 값 옆에 계획과 같은지. 말로 적은 답은 판정(AI · 확인 필요)을 따로 보이므로 표시를 붙이지 않는다 */
export function answerLine(shown: string, raw: string, planned: string): string {
  if (isOtherAnswer(raw)) return shown
  return `${shown} · ${raw.trim() === planned.trim() ? '계획과 같음' : '다름'}`
}

/**
 * 11.04 새 방향: 테마 6개 (주택 · 출산/육아 · 노후 · 보험 · 부채 · 투자 — src/data/template.ts THEMES).
 * DB enum 은 그대로 두고 이름만 바꿨다. 결혼 · 소득 · 양가 · 세금은 예전 카드 표시용으로만 남는다.
 */
export const CATEGORIES: Record<Card['category'], { label: string; bg: string; fg: string; short: string }> = {
  housing:   { label: '주택',      short: '주택', bg: '#e9effd', fg: '#3f63c9' },
  children:  { label: '출산/육아', short: '육아', bg: '#fdf1dc', fg: '#a86a12' },
  retire:    { label: '노후',      short: '노후', bg: '#f3efe6', fg: '#7a6530' },
  insurance: { label: '보험',      short: '보험', bg: '#e6f3f8', fg: '#2a6f8a' },
  debt:      { label: '부채',      short: '부채', bg: '#f1ece4', fg: '#8a5a2b' },
  saving:    { label: '투자',      short: '투자', bg: '#e4f5ec', fg: '#1f7a52' },
  wedding:   { label: '결혼',      short: '결혼', bg: '#fbe9f1', fg: '#b04a7a' },
  income:    { label: '소득·직업', short: '소득', bg: '#fdeae6', fg: '#c25a4a' },
  family:    { label: '양가 지원', short: '양가', bg: '#eee9fb', fg: '#6b4fc0' },
  tax:       { label: '세금',      short: '세금', bg: '#f0f0f0', fg: '#555' },
}
export const CATEGORY_ORDER: Card['category'][] = ['housing','children','retire','insurance','debt','saving','wedding','income','family','tax']
