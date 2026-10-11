import type { Card, Deviation } from './types'

/** '6억', '6억 2천', '62000만원', '620000000' 같은 입력을 원으로. 실패 시 NaN */
export function parseWon(s: string | number): number {
  if (typeof s === 'number') return s
  const t = s.replace(/[\s,원]/g, '')
  let total = 0, matched = false
  const eok = t.match(/([\d.]+)억/)
  if (eok) { total += parseFloat(eok[1]) * 1e8; matched = true }
  const man = t.match(/(?:억)?\s*([\d.]+)(?:천만|만)/)
  if (man) { total += parseFloat(man[1]) * (t.includes('천만') ? 1e7 : 1e4); matched = true }
  if (!matched) { const n = parseFloat(t); return isNaN(n) ? NaN : n }
  return total
}

/** '2029', '2029년', '2029-06', '2029년 6월', '내후년' → 'YYYY-MM' 또는 null */
export function parseYearMonth(s: string | number, now = new Date()): string | null {
  const t = String(s).trim()
  const rel: Record<string, number> = { 올해: 0, 내년: 1, 내후년: 2 }
  for (const [k, v] of Object.entries(rel)) if (t.startsWith(k)) return `${now.getFullYear() + v}-06`
  const m = t.match(/(\d{4})\s*[-년.]?\s*(\d{1,2})?/)
  if (!m) return null
  const mm = m[2] ? m[2].padStart(2, '0') : '06'
  return `${m[1]}-${mm}`
}

function monthsDiff(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number)
  return Math.abs((ay - by) * 12 + (am - bm))
}

/** 결정적 비교. text 카드는 여기 오면 안 된다. */
export function compareToPlan(card: Card, answer: string): Deviation | null {
  switch (card.type) {
    case 'number': {
      const a = parseWon(answer), p = parseWon(card.plannedValue)
      if (isNaN(a)) return null
      const ratio = Math.abs(a - p) / p
      const tol = card.tolerance ?? 0.1
      return ratio <= tol ? 'match' : ratio <= tol * 2 ? 'minor' : 'major'
    }
    case 'date': {
      const a = parseYearMonth(answer), p = parseYearMonth(card.plannedValue)
      if (!a || !p) return null
      const d = monthsDiff(a, p)
      const tol = card.tolerance ?? 6
      return d <= tol ? 'match' : d <= tol * 2 ? 'minor' : 'major'
    }
    case 'choice':
      return answer.trim() === String(card.plannedValue).trim() ? 'match' : 'major'
    case 'text':
      return null
  }
}

export function answersAgree(card: Card, a: string, b: string): boolean | null {
  switch (card.type) {
    case 'number': {
      const x = parseWon(a), y = parseWon(b)
      if (isNaN(x) || isNaN(y)) return null
      return Math.abs(x - y) / Math.max(x, y) <= (card.tolerance ?? 0.1)
    }
    case 'date': {
      const x = parseYearMonth(a), y = parseYearMonth(b)
      if (!x || !y) return null
      return monthsDiff(x, y) <= (card.tolerance ?? 6)
    }
    case 'choice': return a.trim() === b.trim()
    case 'text': return null
  }
}
