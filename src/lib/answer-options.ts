/**
 * 계획 값 · 답을 사람이 읽는 글로 (설계사 화면 · AI 에게 보여 줄 모양).
 *
 * 11.05 밤: 부부에게 계획을 보여 주지 않고 목표를 묻게 되면서 **다른 답 후보**(계획 값의 0.5~1.5배 등)는 없앴다.
 * 후보가 계획 값에서 나오면 답을 알려 주게 되기 때문이다. 부부 답 칸은 src/lib/answer-input.ts · pages/couple/AnswerInput.tsx.
 */
import type { Card } from '../judge/types'
import { OTHER_PREFIX, isOtherAnswer } from '../judge/deterministic'
import { slotByKey } from '../data/template'

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

/** "말로 적기" 로 적은 글 → 저장 값 ("기타: …" — 예전 기타 답과 같은 모양이라 판정 규칙이 그대로 읽는다) */
export const otherValue = (text: string) => (text.trim() ? OTHER_PREFIX + text.trim() : '')
