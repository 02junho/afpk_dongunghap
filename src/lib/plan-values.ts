/**
 * 질문 틀 칸에 넣는 계획 값 검사 · 정리 (11.04). 설계사 화면과 서버(api/planner template_save)가 같은 함수를 쓴다.
 * AI 가 재무설계 결과(Word · PDF)에서 찾은 글("3억 원", "2032년 6월")도 여기서 규칙으로 바꾼다 — 숫자를 AI 가 바꾸지 않게.
 *
 * 저장 모양: 금액 = 원 단위 정수 문자열 · 나이 · 개수 · 비율 = 숫자 문자열 · 시점 = 'YYYY-MM' · 선택 = 보기 하나 · 서술 = 한 문장
 */
import { parseCount, parseWon } from '../judge/deterministic'
import { NA, type Slot } from '../data/template'

export type PlanValue = { ok: true; value: string } | { ok: false; error: string }

/**
 * 금액 표기의 기간 표시 (11.05 예시 재무설계 PDF 시험에서 "200,000원/월납"을 못 읽어서).
 * 문서에는 "200,000원/월납", "10,419원/월납/갱신형", "월 50만원", "연 240만원"처럼 기간이 붙는다.
 * 칸의 기간(slot.per)과 같으면 표시를 떼고 읽고, 다르면 읽지 않는다 — 연 → 월 나누기도 계산이라 설계사가 정한다.
 */
const MONTHLY = /(^|\s)(매월|월)\s*(?=[\d약])|\/\s*월|월납|월\s*$/
const YEARLY = /(^|\s)(매년|연간|연)\s*(?=[\d약])|\/\s*(년|연)|연납/
export function moneyPer(t: string): 'month' | 'year' | null {
  if (MONTHLY.test(t)) return 'month'
  if (YEARLY.test(t)) return 'year'
  return null
}
const PER_NAME = { month: '매달', year: '매년' } as const

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

export function planValue(slot: Pick<Slot, 'type' | 'unit' | 'options' | 'label' | 'per'>, raw: string | number | null | undefined): PlanValue {
  const t = String(raw ?? '').trim()
  if (!t) return { ok: false, error: '비어 있음' }
  // 이 고객에게 맞지 않는 질문 — 어느 칸이든 설계사가 넣을 수 있다 (11.05 A). AI 가 찾은 값으로는 받지 않는다(src/extract/plan.ts)
  if (t === NA) return { ok: true, value: NA }
  switch (slot.type) {
    case 'number': {
      if ((slot.unit ?? 'krw') === 'krw') {
        const per = moneyPer(t)
        if (per && per !== slot.per) return { ok: false, error: `${PER_NAME[per]} 금액입니다 — 이 칸은 ${slot.per ? PER_NAME[slot.per] + ' 금액' : '한 번에 드는 금액'}이라 설계사가 정해 주세요` }
        // 기간 표시 · "약" 떼기: "200,000원/월납/갱신형" → "200,000원", "월 50만원" → "50만원"
        const bare = t.replace(/\s*\/.*$/, '').replace(/^(매월|매년|연간|월|연)\s*/, '').replace(/^약\s*/, '').replace(/\s*(월납|연납)$/, '').trim()
        // "9,000원"처럼 원이 분명히 붙은 작은 금액은 받는다. 단위 없는 "300"은 그대로 거부(표의 '단위: 만원'일 수 있다)
        const n = /^[\d,]+\s*원$/.test(bare) ? Number(bare.replace(/[^\d]/g, '')) : parseWon(bare)
        if (isNaN(n) || n < 0) return { ok: false, error: '금액을 읽을 수 없습니다 (예: 3억, 8천만원, 1,260,000)' }
        return { ok: true, value: String(Math.round(n)) }
      }
      // "약 6개월" · "만 60세" — 재무설계 결과에 흔한 표기 (11.14 팀 보고서로 찾기 점검에서 발견).
      // 돈 단위 '만'과 헷갈리지 않게, 띄어 쓴 '만 '은 나이 칸에서만 뗀다
      let bare = t.replace(/^약\s*/, '')
      if (slot.unit === 'age') bare = bare.replace(/^만\s+/, '')
      const n = parseCount(bare.replace(/개월|달/g, ''))
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
