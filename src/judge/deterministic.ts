import type { Card, DeviationOrUnknown } from './types'

/**
 * 금액 파싱. '6억', '6억 2천', '62,000만원', '620000000' → 원.
 *
 * 원칙: **모르면 NaN**. 조용히 틀린 숫자를 내놓는 것이 파싱 실패보다 나쁘다.
 * 파싱 실패는 🟡 + 사유로 사람에게 간다. 틀린 파싱은 🟢이나 🔴이 되어 조용히 지나간다.
 *   - '6천'  단독 → NaN (6천원인지 6천만원인지 알 수 없다)
 *   - '6'    단독 → NaN (금액이 6원일 수는 없다)
 *   - '1억 5천'   → 1.5억 (억 뒤의 '천'은 '천만')
 */
export function parseWon(s: string | number): number {
  if (typeof s === 'number') return s
  const t = String(s).replace(/[\s,]/g, '').replace(/원/g, '')
  if (!t) return NaN
  if (/^0+(\.0+)?$/.test(t)) return 0 // '0', '0원' — 저축 못 하고 있어요

  let total = 0
  let matched = false

  const eok = t.match(/([\d.]+)억/)
  if (eok) {
    total += parseFloat(eok[1]) * 1e8
    matched = true
  }
  const rest = eok ? t.slice(t.indexOf(eok[0]) + eok[0].length) : t

  const cheonman = rest.match(/([\d.]+)천만/)
  const baekman = rest.match(/([\d.]+)백만/)
  const man = rest.match(/([\d.]+)만/)
  const cheon = rest.match(/([\d.]+)천(?!만)/)
  if (cheonman) {
    total += parseFloat(cheonman[1]) * 1e7
    matched = true
  } else if (baekman) {
    total += parseFloat(baekman[1]) * 1e6
    matched = true
  } else if (man) {
    total += parseFloat(man[1]) * 1e4
    matched = true
  } else if (cheon) {
    // 억이 앞에 있으면 '1억 5천' = 1억 5천만. 단독 '5천'은 모호하므로 거부한다.
    if (!eok) return NaN
    total += parseFloat(cheon[1]) * 1e7
    matched = true
  }
  if (matched) return total

  // 단위가 하나도 없는 경우: 원 단위 정수로만 인정한다 (5자리 = 1만원 이상)
  const digits = t.replace(/[^\d]/g, '')
  if (!/^[\d.]+$/.test(t) || digits.length < 5) return NaN
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** 나이·개수·비율. '60', '60세', '65살' → 60/65. 단위를 떼고 숫자만 본다. */
export function parseCount(s: string | number): number {
  if (typeof s === 'number') return s
  const t = String(s).replace(/[\s,]/g, '').replace(/(세|살|개|명|%|퍼센트|년|회)/g, '')
  if (!/^[\d.]+$/.test(t)) return NaN
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** 카드의 unit 에 맞는 숫자 파서. unit 이 없으면 금액(krw)이다. */
export function parseNumeric(card: Pick<Card, 'unit'>, s: string | number): number {
  return (card.unit ?? 'krw') === 'krw' ? parseWon(s) : parseCount(s)
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
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return Math.abs((ay - by) * 12 + (am - bm))
}

/**
 * 선택형 질문의 "기타 — 직접 입력" 답은 이 접두사를 달고 저장된다 (10.23 팀 결정 Q1).
 * 보기에 없는 답이라 규칙으로 비교할 수 없다 → 추측하지 않고 'unparsed' → 🟡 설계사 확인.
 */
export const OTHER_PREFIX = '기타: '
export const isOtherAnswer = (s: string) => s.trim().startsWith(OTHER_PREFIX.trim())

/** 기타 답에서 적은 글만 */
export const otherText = (s: string) => s.trim().replace(/^기타\s*:\s*/, '')

/**
 * number · date 답을 값으로 읽는다. 기타("기타: 3억 2천")도 규칙으로 읽히면 값이다.
 * 틀의 값이 아닌 답 후보("아직 모름", "집을 사지 않기로 했다" — card.options)는 'fixed' — 계획과 다른 답이다.
 */
function readAnswer(card: Card, answer: string): { kind: 'value'; v: string | number } | { kind: 'fixed' } | { kind: 'unparsed' } {
  const t = answer.trim()
  if (!isOtherAnswer(t) && (card.options ?? []).includes(t)) return { kind: 'fixed' }
  const other = isOtherAnswer(t)
  const body = other ? otherText(t) : t
  // 기타 글은 **값만 적었을 때만** 규칙으로 읽는다. "3억 정도인데 더 주실 수도" 를 3억으로 읽으면 안 된다 → AI 가 본다
  if (card.type === 'number') {
    if (other && !/^[\d.,\s]+(억|천만|백만|만|천|원|세|살|명|개월|달|%|\s)*([\d.,\s]+(억|천만|백만|만|천|원|세|살|명|개월|달|%|\s)*)*$/.test(body)) return { kind: 'unparsed' }
    const n = parseNumeric(card, body.replace(/개월|달/g, ''))
    return isNaN(n) ? { kind: 'unparsed' } : { kind: 'value', v: n }
  }
  if (other && !/^\d{4}\s*(년\s*\d{1,2}\s*월|[-.]\s*\d{1,2})$/.test(body)) return { kind: 'unparsed' }
  const d = parseYearMonth(body)
  return d ? { kind: 'value', v: d } : { kind: 'unparsed' }
}

/** 정답지가 값이 아닌 답("해당 없음" · "아직 모름" — card.options)인가 (11.05 해당 없음) */
export const planIsNonValue = (card: Card) =>
  card.type !== 'choice' && card.type !== 'text' && typeof card.plannedValue === 'string' && (card.options ?? []).includes(card.plannedValue.trim())

/** 결정적 비교. text 카드는 여기 오면 안 된다. 해석 불가는 'unparsed'. */
export function compareToPlan(card: Card, answer: string): DeviationOrUnknown {
  // 정답지가 "해당 없음"이면 "해당 없음"만 같다. 숫자를 적었으면 새 계획이 생긴 것 → 다름. 말로 적은 답은 규칙으로 못 읽는다
  if (planIsNonValue(card)) {
    if (isOtherAnswer(answer)) return 'unparsed'
    return answer.trim() === String(card.plannedValue).trim() ? 'match' : 'major'
  }
  switch (card.type) {
    case 'number': {
      const r = readAnswer(card, answer)
      if (r.kind === 'fixed') return 'major'
      const p = parseNumeric(card, card.plannedValue)
      if (r.kind === 'unparsed' || isNaN(p)) return 'unparsed'
      const a = r.v as number
      if (p === 0) return a === 0 ? 'match' : 'major'
      const ratio = Math.abs(a - p) / Math.abs(p)
      const tol = card.tolerance ?? 0.1
      return ratio <= tol ? 'match' : ratio <= tol * 2 ? 'minor' : 'major'
    }
    case 'date': {
      const r = readAnswer(card, answer)
      if (r.kind === 'fixed') return 'major'
      const p = parseYearMonth(card.plannedValue)
      if (r.kind === 'unparsed' || !p) return 'unparsed'
      const d = monthsDiff(r.v as string, p)
      const tol = card.tolerance ?? 6
      return d <= tol ? 'match' : d <= tol * 2 ? 'minor' : 'major'
    }
    case 'choice':
      if (isOtherAnswer(answer)) return 'unparsed'
      return answer.trim() === String(card.plannedValue).trim() ? 'match' : 'major'
    case 'text':
      return 'unparsed'
  }
}

/** 두 답변이 서로 양립하는가. 해석 불가는 null. (11.05 부터 판정에는 쓰지 않는다 — 설계사 화면 참고용) */
export function answersAgree(card: Card, a: string, b: string): boolean | null {
  switch (card.type) {
    case 'number':
    case 'date': {
      const x = readAnswer(card, a), y = readAnswer(card, b)
      if (x.kind === 'unparsed' || y.kind === 'unparsed') return null
      if (x.kind === 'fixed' || y.kind === 'fixed') return a.trim() === b.trim()
      if (card.type === 'date') return monthsDiff(x.v as string, y.v as string) <= (card.tolerance ?? 6)
      const p = x.v as number, q = y.v as number
      const scale = Math.max(Math.abs(p), Math.abs(q))
      if (scale === 0) return true // 둘 다 0원 — 일치다. 0/0 = NaN 으로 불일치가 되면 안 된다
      return Math.abs(p - q) / scale <= (card.tolerance ?? 0.1)
    }
    case 'choice':
      if (isOtherAnswer(a) || isOtherAnswer(b)) return null
      return a.trim() === b.trim()
    case 'text':
      return null
  }
}
