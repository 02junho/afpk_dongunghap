/**
 * 목표 질문의 답 칸이 저장할 값을 만드는 순수 함수 (11.05 밤 — 계획 값을 보여 주지 않는다).
 * 화면은 pages/couple/AnswerInput.tsx. 저장 모양은 예전과 같다:
 *   금액 = 원 단위 정수 · 나이 · 개수 · 비율 = 숫자 · 보기 = 그 글자 · 말로 적기 = "기타: …"
 */
import type { Card } from '../judge/types'
import { parseCount, parseWon } from '../judge/deterministic'
import { otherValue } from './answer-options'

export interface AnswerState { mode: '' | 'num' | 'opt' | 'other'; num: string; opt: string; other: string }
export const EMPTY_ANSWER: AnswerState = { mode: '', num: '', opt: '', other: '' }

/** 숫자 칸에 적은 글 → 저장 값. 금액은 숫자만 적으면 만 원 단위, "4억 8천"처럼 단위를 붙여도 읽는다. 못 읽으면 '' */
export function numValue(card: Card, raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if ((card.unit ?? 'krw') === 'krw') {
    if (/^[\d,.]+$/.test(t)) {
      const n = Number(t.replace(/,/g, ''))
      return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 10000)) : ''
    }
    const n = parseWon(t)
    return Number.isFinite(n) && n >= 0 ? String(Math.round(n)) : ''
  }
  const n = parseCount(t.replace(/개월|달/g, ''))
  if (!Number.isFinite(n) || n < 0) return ''
  if (card.unit === 'percent' && n > 100) return ''
  return String(n)
}

/** 고른 것 · 적은 것 → 저장할 답 ('' 이면 아직 못 냄) */
export function answerValue(card: Card, s: AnswerState): string {
  if (s.mode === 'num') return numValue(card, s.num)
  if (s.mode === 'opt') return s.opt
  if (s.mode === 'other') return otherValue(s.other)
  return ''
}
