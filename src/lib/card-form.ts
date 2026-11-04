import type { CardCategory, CardType, NumberUnit } from '../judge/types'
import { parseNumeric, parseYearMonth } from '../judge/deterministic'

/**
 * 설계사가 [카드 추가]로 새 카드를 만들 때의 입력 검사·정규화. 순수 함수 —
 * 브라우저(폼 미리보기)와 api/planner.ts(add_card) 가 같은 규칙을 쓴다.
 *
 * 저장 형식은 card_versions 와 같다: number → 원/나이/개수 정수 문자열, date → 'YYYY-MM'.
 * 허용 범위는 타입마다 뜻이 다르다 (number 비율 0.05 / date 개월 6). 폼은 %로 받고 여기서 비율로 바꾸지 않는다 —
 * 호출하는 쪽이 비율로 넘긴다.
 */

export const CATEGORY_KEYS: CardCategory[] = ['wedding', 'housing', 'income', 'children', 'family', 'debt', 'saving', 'insurance', 'retire', 'tax']
export const TYPE_KEYS: CardType[] = ['number', 'date', 'choice', 'text']
export const UNIT_KEYS: NumberUnit[] = ['krw', 'age', 'count', 'percent']

/** 폼의 "타입" 한 칸 = type + unit. 설계사에게는 금액·나이처럼 보인다 */
export const KIND_OPTIONS: { id: string; label: string; type: CardType; unit?: NumberUnit; hint: string }[] = [
  { id: 'krw', label: '금액', type: 'number', unit: 'krw', hint: '예: 3억, 8천만원, 1,320,000' },
  { id: 'date', label: '시점', type: 'date', hint: '예: 2029-06, 2029년 6월' },
  { id: 'choice', label: '선택', type: 'choice', hint: '선택지 중 하나' },
  { id: 'text', label: '서술', type: 'text', hint: '설계안에 적힌 전제 그대로' },
  { id: 'age', label: '나이', type: 'number', unit: 'age', hint: '예: 60' },
  { id: 'count', label: '개수·횟수', type: 'number', unit: 'count', hint: '예: 2' },
  { id: 'percent', label: '비율(%)', type: 'number', unit: 'percent', hint: '예: 30' },
]

export const DEFAULT_TOLERANCE = { number: 0.05, date: 6 } as const

export interface NewCardInput {
  category: string
  type: string
  unit?: string | null
  label: string
  question: string
  plannedValue: string
  options?: string[] | string | null
  tolerance?: number | null
  allowCondition?: boolean
  stake: string
}

export interface NewCard {
  category: CardCategory
  type: CardType
  unit: NumberUnit | null
  label: string
  question: string
  plannedValue: string
  options: string[] | null
  tolerance: number | null
  allowCondition: boolean
  stake: string
}

export type NewCardResult = { ok: true; card: NewCard } | { ok: false; error: string }

/** "가, 나" 또는 줄바꿈으로 나눈 선택지 → 배열 (빈 칸·중복 제거) */
export function splitOptions(v: NewCardInput['options']): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[\n,]/)
  return [...new Set(arr.map(s => String(s).trim()).filter(Boolean))]
}

export function normalizeNewCard(x: NewCardInput): NewCardResult {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const category = s(x.category) as CardCategory
  const type = s(x.type) as CardType
  if (!CATEGORY_KEYS.includes(category)) return { ok: false, error: '주제를 고르세요' }
  if (!TYPE_KEYS.includes(type)) return { ok: false, error: '답의 형태를 고르세요' }

  const label = s(x.label), question = s(x.question), stake = s(x.stake), raw = s(x.plannedValue)
  if (!label) return { ok: false, error: '카드 이름이 필요합니다' }
  if (!question) return { ok: false, error: '두 분께 묻는 질문이 필요합니다' }
  if (!raw) return { ok: false, error: '설계 전제 값이 필요합니다' }
  if (!stake) return { ok: false, error: '"이 계획이 바뀌면 생기는 일"을 한 줄 적어 주세요' }
  if (label.length > 40) return { ok: false, error: '카드 이름은 40자까지 쓸 수 있습니다' }

  let unit: NumberUnit | null = null
  let plannedValue = raw
  let options: string[] | null = null
  let tolerance: number | null = null
  let allowCondition = false

  if (type === 'number') {
    unit = (s(x.unit) || 'krw') as NumberUnit
    if (!UNIT_KEYS.includes(unit)) return { ok: false, error: '단위가 올바르지 않습니다' }
    const n = parseNumeric({ unit }, raw)
    if (!Number.isFinite(n)) return { ok: false, error: unit === 'krw' ? '금액을 읽을 수 없습니다 (예: 3억, 8천만원)' : '숫자를 읽을 수 없습니다' }
    plannedValue = String(n)
    tolerance = x.tolerance == null ? DEFAULT_TOLERANCE.number : Number(x.tolerance)
    if (!(tolerance > 0 && tolerance < 1)) return { ok: false, error: '허용 범위는 0%보다 크고 100%보다 작아야 합니다' }
  } else if (type === 'date') {
    if (!/\d{4}/.test(raw)) return { ok: false, error: '시점은 연도를 넣어 주세요 (예: 2029-06)' }
    const ym = parseYearMonth(raw)
    if (!ym) return { ok: false, error: '시점을 읽을 수 없습니다 (예: 2029-06)' }
    plannedValue = ym
    tolerance = x.tolerance == null ? DEFAULT_TOLERANCE.date : Number(x.tolerance)
    if (!(Number.isInteger(tolerance) && tolerance >= 0 && tolerance <= 60)) return { ok: false, error: '허용 범위는 0~60개월 사이 정수로 넣어 주세요' }
    allowCondition = !!x.allowCondition
  } else if (type === 'choice') {
    options = splitOptions(x.options)
    if (options.length < 2) return { ok: false, error: '선택지를 두 개 이상 넣어 주세요' }
    if (!options.includes(raw)) return { ok: false, error: '설계 전제 값은 선택지 중 하나여야 합니다' }
  }

  return { ok: true, card: { category, type, unit, label, question, plannedValue, options, tolerance, allowCondition, stake } }
}

/** 부부별 카드 key. 템플릿 카드(home_when 등)와 겹치지 않게 접두사를 둔다 */
export function newCardKey(now = Date.now(), rand = Math.random()): string {
  return `p_${now.toString(36)}${Math.floor(rand * 1296).toString(36).padStart(2, '0')}`
}
