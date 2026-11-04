/**
 * 질문 틀 칸에 넣는 계획 값 검사 · 정리 (11.04). 설계사 화면과 서버(api/planner template_save)가 같은 함수를 쓴다.
 * AI 가 Word 에서 찾은 글("3억 원", "2032년 6월")도 여기서 규칙으로 바꾼다 — 숫자를 AI 가 바꾸지 않게.
 *
 * 저장 모양: 금액 = 원 단위 정수 문자열 · 나이 · 개수 · 비율 = 숫자 문자열 · 시점 = 'YYYY-MM' · 선택 = 보기 하나 · 서술 = 한 문장
 */
import { parseCount, parseWon } from '../judge/deterministic'
import type { Slot } from '../data/template'

export type PlanValue = { ok: true; value: string } | { ok: false; error: string }

/** 상대 시점("3년 뒤", "내년")은 받지 않는다 — 날짜로 바꾸는 것도 계산이라 설계사가 정한다 */
export function parsePlanDate(raw: string): string | null {
  const t = raw.trim()
  let m = t.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*월?$/)
  if (!m) m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/)
  if (!m) return null
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) return null
  return `${m[1]}-${String(mm).padStart(2, '0')}`
}

export function planValue(slot: Pick<Slot, 'type' | 'unit' | 'options' | 'label'>, raw: string | number | null | undefined): PlanValue {
  const t = String(raw ?? '').trim()
  if (!t) return { ok: false, error: '비어 있음' }
  switch (slot.type) {
    case 'number': {
      if ((slot.unit ?? 'krw') === 'krw') {
        const n = parseWon(t)
        if (isNaN(n) || n < 0) return { ok: false, error: '금액을 읽을 수 없습니다 (예: 3억, 8천만원, 1,260,000)' }
        return { ok: true, value: String(Math.round(n)) }
      }
      const n = parseCount(t.replace(/개월|달/g, ''))
      if (isNaN(n) || n < 0) return { ok: false, error: '숫자를 읽을 수 없습니다' }
      if (slot.unit === 'percent' && n > 100) return { ok: false, error: '비율은 0~100' }
      return { ok: true, value: String(n) }
    }
    case 'date': {
      const d = parsePlanDate(t)
      return d ? { ok: true, value: d } : { ok: false, error: '연 · 월로 넣어 주세요 (예: 2032-06, 2032년 6월)' }
    }
    case 'choice': {
      const hit = (slot.options ?? []).find(o => o === t)
      return hit ? { ok: true, value: hit } : { ok: false, error: `보기 중 하나: ${(slot.options ?? []).join(' / ')}` }
    }
    case 'text':
      return t.length <= 200 ? { ok: true, value: t } : { ok: false, error: '200자 안으로' }
  }
}
