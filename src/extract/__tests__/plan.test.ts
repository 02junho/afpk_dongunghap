import { describe, expect, it } from 'vitest'
import { SLOTS, THEMES, PER_THEME, slotsOfWeek, slotByKey } from '../../data/template'
import { planValue, parsePlanDate } from '../../lib/plan-values'
import { buildPlanPrompt, parsePlanOutput } from '../plan'
import { documentXmlToText } from '../../lib/docx-text'
import { namesFromFilename } from '../names'

describe('질문 틀 (6테마 × 5문항)', () => {
  it('테마 6개, 테마마다 5문항, key 는 겹치지 않는다', () => {
    expect(THEMES).toHaveLength(6)
    for (const t of THEMES) expect(slotsOfWeek(t.week)).toHaveLength(PER_THEME)
    expect(new Set(SLOTS.map(s => s.key)).size).toBe(30)
  })
  it('가상고객 예시 값은 모두 저장 규칙을 통과한다', () => {
    for (const s of SLOTS) expect(planValue(s, s.example), s.key).toMatchObject({ ok: true })
  })
  it('선택 문항의 예시 값은 보기 중 하나다', () => {
    for (const s of SLOTS.filter(x => x.type === 'choice')) expect(s.options).toContain(s.example)
  })
})

describe('계획 값 규칙 — 숫자는 AI 가 아니라 규칙이 바꾼다', () => {
  const won = slotByKey('t1_home_price')!, year = slotByKey('t1_buy_year')!, age = slotByKey('t3_husband_retire')!, pct = slotByKey('t5_repay_ratio')!, months = slotByKey('t2_leave_months')!
  it('금액 표기 → 원', () => {
    expect(planValue(won, '3억 원')).toEqual({ ok: true, value: '300000000' })
    expect(planValue(won, '6,700만원')).toEqual({ ok: true, value: '67000000' })
  })
  it('금액의 기간 표시 (11.05 예시 PDF) — 칸의 기간과 같으면 떼고 읽고, 다르면 설계사에게', () => {
    const monthly = slotByKey('t3_wife_pension')!
    expect(planValue(monthly, '200,000원/월납')).toEqual({ ok: true, value: '200000' })
    expect(planValue(monthly, '10,419원/월납/갱신형')).toEqual({ ok: true, value: '10419' })
    expect(planValue(monthly, '약 9,000원/월')).toEqual({ ok: true, value: '9000' })
    expect(planValue(monthly, '월 50만원')).toEqual({ ok: true, value: '500000' })
    // 연 → 월 나누기도 계산이라 하지 않는다
    expect(planValue(monthly, '연 240만원')).toMatchObject({ ok: false })
    expect(planValue(won, '월 30만원')).toMatchObject({ ok: false })
    // 단위 없는 작은 수는 여전히 거부 (표의 '단위: 만원'일 수 있다)
    expect(planValue(monthly, '700')).toMatchObject({ ok: false })
  })
  it('시점 — 연도 칸은 숫자 연도만. 상대 시점은 설계사가 정한다', () => {
    expect(parsePlanDate('2032년 6월')).toBe('2032-06')
    expect(parsePlanDate('2032-6')).toBe('2032-06')
    expect(planValue(year, '2032년')).toEqual({ ok: true, value: '2032' })
    expect(planValue(year, '6~7년 안')).toMatchObject({ ok: false })
    expect(planValue(year, '내년')).toMatchObject({ ok: false })
  })
  it('해당 없음 — 어느 칸이든 설계사가 넣을 수 있다 (11.05 A)', () => {
    expect(planValue(won, '해당 없음')).toEqual({ ok: true, value: '해당 없음' })
    expect(planValue(slotByKey('t2_child_when')!, '해당 없음')).toEqual({ ok: true, value: '해당 없음' })
  })
  it('나이 · 비율 · 개월', () => {
    expect(planValue(age, '만 60세')).toMatchObject({ ok: false })   // "만"이 붙으면 못 읽는다 → 설계사가 60
    expect(planValue(age, '60세')).toEqual({ ok: true, value: '60' })
    expect(planValue(pct, '20%')).toEqual({ ok: true, value: '20' })
    expect(planValue(pct, '120%')).toMatchObject({ ok: false })
    expect(planValue(months, '24개월')).toEqual({ ok: true, value: '24' })
  })
  it('보기는 정확히 같은 것만', () => {
    const c = slotByKey('t5_rate_type')!
    expect(planValue(c, '고정금리')).toEqual({ ok: true, value: '고정금리' })
    expect(planValue(c, '고정')).toMatchObject({ ok: false })
  })
})

describe('재무설계 결과에서 찾은 값 — 근거가 문서에 있어야 한다', () => {
  const doc = '1. 주거 계획\n내 집 마련은 2032년을 목표로 합니다.\n목표 집값 | 3억 원'
  it('찾은 글을 규칙으로 바꾸고, 근거 문장이 문서에 있는지 본다', () => {
    const out = parsePlanOutput(JSON.stringify([
      { key: 't1_buy_year', found: '2032년', quote: '내 집 마련은 2032년을 목표로', note: '' },
      { key: 't1_home_price', found: '3억 원', quote: '집값 4억', note: '' },   // 문서에 없는 근거
      { key: 't2_child_count', found: '해당 없음', quote: '내 집 마련은 2032년을 목표로', note: '' },   // AI 는 해당 없음을 낼 수 없다
    ]), doc)
    expect(out).toHaveLength(30)
    expect(out.find(f => f.key === 't1_buy_year')).toMatchObject({ value: '2032', quoteInDoc: true })
    expect(out.find(f => f.key === 't1_home_price')).toMatchObject({ value: '300000000', quoteInDoc: false, problem: '원문에서 근거를 찾지 못함' })
    expect(out.find(f => f.key === 't2_child_when')).toMatchObject({ found: null, quoteInDoc: false })
    expect(out.find(f => f.key === 't2_child_count')).toMatchObject({ found: null })
  })
  it('틀에 없는 key 는 버린다', () => {
    const out = parsePlanOutput('[{"key":"x_made_up","found":"1억","quote":"1억","note":""}]', doc)
    expect(out.every(f => f.found === null)).toBe(true)
  })
  it('프롬프트에 30칸이 다 들어가고, 보기에 아직 모름 · 해당 없음은 안 보인다', () => {
    const p = buildPlanPrompt(doc)
    for (const s of SLOTS) expect(p).toContain(s.key)
    expect(p).not.toContain('/ 해당 없음')
    expect(p).toContain('t1_buy_year [주택] 내 집 마련(입주 · 매수) 목표 연도 (숫자(년))')
  })
})

describe('Word 글 읽기 · 파일 이름', () => {
  it('문단은 줄, 표 칸은 " | "', () => {
    const xml = '<w:body><w:p><w:r><w:t>주거 계획</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>보증금</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3억 &amp; 원</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body>'
    expect(documentXmlToText(xml)).toBe('주거 계획\n보증금\n| 3억 & 원')
  })
  it('남편이름_아내이름_재무설계.docx → 이름', () => {
    expect(namesFromFilename('에이피_에피케_재무설계.docx')).toEqual({ husband: '에이피', wife: '에피케' })
    expect(namesFromFilename('설계안.docx')).toBeNull()
  })
})

describe('허용 범위 없음 (11.05) — 계획과 다르면 다른 것', () => {
  it('금액 1원 · 연도 1년 · 나이 1살만 달라도 🔴, 같으면 🟢', async () => {
    const { judge } = await import('../../judge/index')
    const { slotCard } = await import('../../data/template')
    const won = slotCard(slotByKey('t1_home_price')!, 300000000)
    expect((await judge(won, '300000000', '300000000')).verdict).toBe('green')
    expect((await judge(won, '300000000', '300000001')).verdict).toBe('red')
    const year = slotCard(slotByKey('t1_buy_year')!, 2032)
    expect((await judge(year, '2032', '2033')).verdict).toBe('red')
    const age = slotCard(slotByKey('t3_husband_retire')!, 60)
    expect(await judge(age, '61', '61')).toMatchObject({ verdict: 'red' })
  })
})
