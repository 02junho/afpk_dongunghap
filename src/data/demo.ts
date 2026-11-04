import type { Card, Judgment } from '../judge/index'
import { fmt } from '../engine/index'
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
  t1_buy_when: { husband: '2032-06', wife: '2032-03' },
  t3_husband_income: { husband: '사실 이직 준비 중이에요. 연봉 20% 정도 올려서', wife: '남편이 이직 알아보고 있어요' },
  t5_support_kind: { husband: '받는 돈', wife: '빌리는 돈' },
  // 조건부 답변 — 자동 판정 불가. 🟡이지만 설계사가 봐야 한다 (needs_review)
  t2_child_when: { husband: '2029-03', wife: '집 사고 나서요' },
}

export const DEMO_JUDGMENTS: Record<string, Judgment> = {
  t1_buy_when: {
    verdict: 'green', aVsPlan: 'match', bVsPlan: 'match', abAgree: true,
    reason: '', method: 'deterministic',
  },
  t3_husband_income: {
    verdict: 'red', redKind: 'plan_stale', aVsPlan: 'major', bVsPlan: 'major', abAgree: true,
    reason: '두 분 다 이직을 전제하고 있으나 설계안은 현 직장 유지를 전제함',
    method: 'llm', promptVersion: 'v3',
  },
  t5_support_kind: {
    verdict: 'red', redKind: 'couple_conflict', aVsPlan: 'match', bVsPlan: 'major', abAgree: false,
    reason: '남편은 받는 돈, 아내는 빌리는 돈으로 답함',
    method: 'deterministic',
  },
  t2_child_when: {
    verdict: 'yellow', aVsPlan: 'match', bVsPlan: 'unparsed', abAgree: false,
    reason: '시점 대신 조건으로 답했습니다 — 설계사 확인 필요',
    method: 'deterministic', needsReview: true,
  },
}

/** 설계사 큐의 AI 3줄 요약 (AI 활용 2번). 실제로는 judgments.planner_summary. */
export const DEMO_SUMMARY: Record<string, string> = {
  t3_husband_income: '소득 상한까지 여유 900만원. 두 분 모두 남편 이직을 전제로 답했고 설계안은 현 직장 유지를 전제함. 합산 +900만을 넘기면 신혼부부 구입자금 자격 상실 — 이직 후 예상 소득 확인이 먼저.',
  t5_support_kind: '지원금 1억의 성격이 갈림. 남편은 증여로, 아내는 차용으로 인지. 증여면 혼인 증여재산공제 창구 2027.10 마감, 차용이면 적정이자율 문제. 어느 쪽인지 확인이 먼저.',
  t2_child_when: '아내가 시점 대신 조건("집 사고 나서")으로 답함 — 자동 판정 불가. 출산 시점에 따라 신생아 특례 접수 기한이 바뀜. 조건을 연·월로 확정할 수 있는지 확인.',
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
  green: '두 분 생각이 같아요',
  yellow: '조금 다르게 보고 계세요',
  red: '전제가 달라요',
} as const

export const RED_TEXT = {
  plan_stale: '두 분은 같은 생각이에요. 설계안이 현실을 못 따라왔습니다.',
  couple_conflict: '두 분이 다르게 알고 계세요.',
  repeated_yellow: '같은 전제가 두 번 연속 어긋났어요.',
} as const

export const KIND_CHIP = {
  plan_stale: { text: '전제 폐기', cls: 'chip-talk' },
  couple_conflict: { text: '부부 불일치', cls: 'chip-escalate' },
  repeated_yellow: { text: '2연속 🟡', cls: 'chip-escalate' },
  needs_review: { text: '확인 필요', cls: 'chip-talk' },
} as const

export const typeLabel = (c: Card) =>
  c.type === 'number' ? (c.unit === 'age' ? '나이' : c.unit === 'count' ? '개수' : c.unit === 'percent' ? '비율' : '금액')
  : c.type === 'date' ? '시점'
  : c.type === 'choice' ? '선택' : '서술'

/** 카드 값 사람이 읽는 형태. 금액은 억/만 단위로. */
export function showValue(c: Card): string {
  if (c.type === 'date') {
    const m = String(c.plannedValue).match(/^(\d{4})-(\d{2})$/)
    return m ? `${m[1]}년 ${Number(m[2])}월` : String(c.plannedValue)
  }
  if (c.type !== 'number') return String(c.plannedValue)
  const n = Number(c.plannedValue)
  return c.unit === 'age' ? `만 ${n}세` : c.unit === 'count' ? `${n}` : c.unit === 'percent' ? `${n}%` : fmt(n)
}

/**
 * DB 에 저장된 전제 값(문자열)을 사람이 읽는 형태로. 큐·변경 이력처럼 Card 전체가 없는 곳에서 쓴다.
 * '650000000' → '6.5억원', '2029-12' → '2029년 12월'. 숫자로 못 읽으면 그대로.
 */
export function showPlanned(type: Card['type'] | undefined, unit: Card['unit'] | null | undefined, raw: string): string {
  if (!type || raw === '—') return raw
  if (type === 'number' && !/^-?\d+(\.\d+)?$/.test(raw)) return raw
  return showValue({ key: '', type, unit: unit ?? undefined, category: 'housing', label: '', question: '', stake: '', plannedValue: type === 'number' ? Number(raw) : raw })
}

/** 답변 문자열을 사람이 읽는 형태로 (date 카드의 'YYYY-MM' → 'YYYY년 M월') */
export function showAnswer(c: Card, s: string): string {
  if (c.type === 'date') {
    const m = s.match(/^(\d{4})-(\d{2})$/)
    if (m) return `${m[1]}년 ${Number(m[2])}월`
  }
  return s
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
