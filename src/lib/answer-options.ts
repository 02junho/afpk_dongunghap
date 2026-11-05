/**
 * "아니요, 바뀌었어요" 다음에 보여 줄 **다른 답 후보** (11.05 사용자 결정 — 객관식).
 *
 * 질문 틀은 모든 고객이 같지만 계획 값은 고객마다 다르다. 그래서 숫자 · 시점 후보는
 * 그 고객의 계획 값에서 **규칙으로** 만든다 (AI 가 만들지 않는다 — 계산 · 재설계가 아니라 보기를 늘어놓는 것뿐).
 *   금액  계획의 0.5 · 0.8 · 1.2 · 1.5 배를 보기 좋은 단위로 반올림 (3억 → 1.5억 · 2.5억 · 3.5억 · 4.5억)
 *   시점  계획의 1년 전 · 6개월 전 · 6개월 뒤 · 1년 뒤 · 2년 뒤 (지난 달은 뺀다)
 *   나이  계획의 −5 · −2 · +2 · +5
 *   개수 · 비율  틀에 적은 picks 에서 계획 값을 뺀 것
 *   선택  보기에서 계획 값을 뺀 것
 * 그다음 틀의 값이 아닌 답("집을 사지 않기로 했다", "아직 모름"), 맨 끝에 "기타 — 직접 적기"(화면이 붙인다).
 * 후보는 모두 계획과 다르다 → 고르면 판정은 🔴 (허용 범위 없음).
 */
import type { Card } from '../judge/types'
import { OTHER_PREFIX, isOtherAnswer } from '../judge/deterministic'
import { slotByKey } from '../data/template'

export interface AnswerChoice { value: string; label: string }

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
function addMonths(v: string, k: number): string {
  const [y, m] = v.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return ym(Math.floor(t / 12), (t % 12) + 1)
}

/** 금액을 보기 좋은 단위로. 단위는 계획 값(plan)이 정한다: 앞자리가 1·2 면 둘째 자리, 3 이상이면 그 반 (3억 → 5천만 단위) */
export function niceWon(n: number, plan: number): number {
  if (n <= 0 || plan <= 0) return 0
  const d = Math.floor(Math.log10(plan))
  const lead = Math.floor(plan / 10 ** d)
  const unit = lead < 3 ? 10 ** (d - 1) : 5 * 10 ** (d - 1)
  return Math.round(n / unit) * unit
}

/** 원 → "2억 5,000만원" · "18만 5,000원". 반올림하지 않는다 — 허용 범위가 없으니 보이는 값이 곧 계획 값이어야 한다 */
export function wonText(n: number): string {
  if (n === 0) return '0원'
  const eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), won = Math.round(n % 1e4)
  return [eok && `${eok}억`, man && `${man.toLocaleString()}만`, won && won.toLocaleString()].filter(Boolean).join(' ') + '원'
}

/** 값(원 단위 정수 · 'YYYY-MM' · 숫자)을 부부 화면 글로 */
export function formatValue(card: Pick<Card, 'key' | 'type' | 'unit'>, raw: string | number): string {
  const s = String(raw)
  if (card.type === 'date') {
    const m = s.match(/^(\d{4})-(\d{2})$/)
    return m ? `${m[1]}년 ${Number(m[2])}월` : s
  }
  if (card.type !== 'number' || !/^-?\d+(\.\d+)?$/.test(s)) return s
  const n = Number(s)
  const slot = slotByKey(card.key)
  if (n === 0 && slot?.zero) return slot.zero
  if (card.unit === 'age') return `만 ${n}세`
  if (card.unit === 'percent') return `${n}%`
  if (card.unit === 'count') return `${n}${slot?.suffix ?? ''}`
  return wonText(n)
}

/** 저장된 답 → 설계사 화면 글. 기타는 적은 글 그대로 */
export function formatAnswer(card: Pick<Card, 'key' | 'type' | 'unit'>, raw: string): string {
  if (isOtherAnswer(raw)) return raw.trim()
  return formatValue(card, raw)
}

/** 계획과 다른 답 후보 (계획 값은 빠진다). now 는 지난 시점을 빼는 데만 쓴다 */
export function answerChoices(card: Card, now = new Date()): AnswerChoice[] {
  const plan = String(card.plannedValue)
  const slot = slotByKey(card.key)
  const extras = card.options ?? slot?.options ?? []
  const out: string[] = []

  if (card.type === 'choice') {
    return extras.filter(o => o !== plan).map(o => ({ value: o, label: o }))
  }
  if (card.type === 'date' && /^\d{4}-\d{2}$/.test(plan)) {
    const thisMonth = ym(now.getFullYear(), now.getMonth() + 1)
    for (const k of [-12, -6, 6, 12, 24]) {
      const v = addMonths(plan, k)
      if (v >= thisMonth) out.push(v)
    }
  }
  if (card.type === 'number') {
    const p = Number(plan)
    const unit = card.unit ?? 'krw'
    let vals: number[] = []
    if (slot?.picks) vals = slot.picks
    else if (unit === 'age') vals = [p - 5, p - 2, p + 2, p + 5].filter(v => v > 0)
    else if (unit === 'krw') vals = p > 0 ? [0.5, 0.8, 1.2, 1.5].map(r => niceWon(p * r, p)) : []
    else if (unit === 'percent') vals = [p - 20, p - 10, p + 10, p + 20].filter(v => v >= 0 && v <= 100)
    else vals = [p - 1, p + 1].filter(v => v >= 0)
    if (slot?.zero && unit !== 'age' && !vals.includes(0)) vals = [0, ...vals]
    for (const v of [...new Set(vals)].sort((a, b) => a - b)) if (v !== p) out.push(String(v))
  }
  return [
    ...out.map(v => ({ value: v, label: formatValue(card, v) })),
    ...extras.filter(o => o !== plan).map(o => ({ value: o, label: o })),
  ]
}

/** "기타 — 직접 적기" 로 적은 글 → 저장 값 */
export const otherValue = (text: string) => (text.trim() ? OTHER_PREFIX + text.trim() : '')
