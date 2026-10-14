import seed from './seed-cards.json'
import type { Card, Judgment } from '../judge/index'
import { fmt } from '../engine/index'

export const CARDS = seed as Card[]
export const byKey = (k: string) => CARDS.find(c => c.key === k)!

export const BASELINE = ['home_when', 'raise_plan', 'family_help']

/**
 * 시연·스크린샷용 고정 답변과 판정.
 * home_when은 엔진이 실제로 내는 값이고, text 카드 둘은 LLM 없이도 화면이 뜨도록 고정했다.
 * 실제 플로우는 lib/api.ts → /api/judge 를 탄다. DEMO는 거기서만 분기한다.
 */
export const DEMO_ANSWERS: Record<string, { husband: string; wife: string }> = {
  home_when: { husband: '2029년쯤 생각하고 있어요', wife: '2029년 상반기요' },
  raise_plan: { husband: '사실 이직 준비 중이에요. 연봉 20% 정도 올려서', wife: '남편이 이직 알아보고 있어요' },
  family_help: { husband: '1.5억 정도 해주신다고 하셨어요', wife: '그건 주시는 게 아니라 빌리는 거라고 들었는데' },
}

export const DEMO_JUDGMENTS: Record<string, Judgment> = {
  home_when: {
    verdict: 'green', aVsPlan: 'match', bVsPlan: 'match', abAgree: true,
    reason: '', method: 'deterministic',
  },
  raise_plan: {
    verdict: 'red', redKind: 'plan_stale', aVsPlan: 'major', bVsPlan: 'major', abAgree: true,
    reason: '두 분 다 이직을 전제하고 있으나 설계안은 현 직장 유지를 전제함',
    method: 'llm', promptVersion: 'v1',
  },
  family_help: {
    verdict: 'red', redKind: 'couple_conflict', aVsPlan: 'match', bVsPlan: 'major', abAgree: false,
    reason: '금액은 같으나 증여와 차용으로 성격이 갈림',
    method: 'llm', promptVersion: 'v1',
  },
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
} as const

export const typeLabel = (c: Card) =>
  c.type === 'number' ? (c.unit === 'age' ? '나이' : '금액')
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
  return c.unit === 'age' ? `만 ${n}세` : fmt(n)
}

export const CATEGORIES: Record<Card['category'], { label: string; bg: string; fg: string; short: string }> = {
  housing:   { label: '주거',      short: '주거', bg: '#e9effd', fg: '#3f63c9' },
  income:    { label: '소득·직업', short: '소득', bg: '#fdeae6', fg: '#c25a4a' },
  children:  { label: '출산·양육', short: '양육', bg: '#fdf1dc', fg: '#a86a12' },
  family:    { label: '양가 지원', short: '양가', bg: '#eee9fb', fg: '#6b4fc0' },
  saving:    { label: '저축·투자', short: '저축', bg: '#e4f5ec', fg: '#1f7a52' },
  insurance: { label: '보험',      short: '보험', bg: '#e6f3f8', fg: '#2a6f8a' },
  retire:    { label: '은퇴',      short: '은퇴', bg: '#f3efe6', fg: '#7a6530' },
  tax:       { label: '세금',      short: '세금', bg: '#f0f0f0', fg: '#555' },
}
export const CATEGORY_ORDER: Card['category'][] = ['housing','income','children','family','saving','insurance','retire','tax']
