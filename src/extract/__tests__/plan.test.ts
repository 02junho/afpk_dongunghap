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
  const won = slotByKey('t1_next_deposit')!, when = slotByKey('t1_buy_when')!, age = slotByKey('t3_husband_retire')!, pct = slotByKey('t6_invest_ratio')!, months = slotByKey('t2_leave_months')!
  it('금액 표기 → 원', () => {
    expect(planValue(won, '3억 원')).toEqual({ ok: true, value: '300000000' })
    expect(planValue(won, '6,700만원')).toEqual({ ok: true, value: '67000000' })
  })
  it('시점 — 연 · 월만 받는다. 상대 시점은 설계사가 정한다', () => {
    expect(parsePlanDate('2032년 6월')).toBe('2032-06')
    expect(parsePlanDate('2032-6')).toBe('2032-06')
    expect(planValue(when, '내 집 마련은 2032년 6월')).toEqual({ ok: true, value: '2032-06' })
    expect(planValue(when, '6~7년 안')).toMatchObject({ ok: false })
    expect(planValue(when, '내년')).toMatchObject({ ok: false })
  })
  it('나이 · 비율 · 개월', () => {
    expect(planValue(age, '만 60세')).toMatchObject({ ok: false })   // "만"이 붙으면 못 읽는다 → 설계사가 60
    expect(planValue(age, '60세')).toEqual({ ok: true, value: '60' })
    expect(planValue(pct, '20%')).toEqual({ ok: true, value: '20' })
    expect(planValue(pct, '120%')).toMatchObject({ ok: false })
    expect(planValue(months, '24개월')).toEqual({ ok: true, value: '24' })
  })
  it('보기는 정확히 같은 것만', () => {
    const c = slotByKey('t5_support_kind')!
    expect(planValue(c, '받는 돈')).toEqual({ ok: true, value: '받는 돈' })
    expect(planValue(c, '증여')).toMatchObject({ ok: false })
  })
})

describe('Word 에서 찾은 값 — 근거가 문서에 있어야 한다', () => {
  const doc = '1. 주거 계획\n내 집 마련은 2032년 6월을 목표로 합니다.\n전세 보증금 | 3억 원'
  it('찾은 글을 규칙으로 바꾸고, 근거 문장이 문서에 있는지 본다', () => {
    const out = parsePlanOutput(JSON.stringify([
      { key: 't1_buy_when', found: '2032년 6월', quote: '내 집 마련은 2032년 6월을 목표로', note: '' },
      { key: 't1_next_deposit', found: '3억 원', quote: '보증금 4억', note: '' },   // 문서에 없는 근거
    ]), doc)
    expect(out).toHaveLength(30)
    expect(out.find(f => f.key === 't1_buy_when')).toMatchObject({ value: '2032-06', quoteInDoc: true })
    expect(out.find(f => f.key === 't1_next_deposit')).toMatchObject({ value: '300000000', quoteInDoc: false, problem: '원문에서 근거를 찾지 못함' })
    expect(out.find(f => f.key === 't2_child_when')).toMatchObject({ found: null, quoteInDoc: false })
  })
  it('틀에 없는 key 는 버린다', () => {
    const out = parsePlanOutput('[{"key":"x_made_up","found":"1억","quote":"1억","note":""}]', doc)
    expect(out.every(f => f.found === null)).toBe(true)
  })
  it('프롬프트에 30칸이 다 들어간다', () => {
    const p = buildPlanPrompt(doc)
    for (const s of SLOTS) expect(p).toContain(s.key)
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
  it('금액 1원 · 시점 1개월 · 나이 1살만 달라도 🔴, 같으면 🟢', async () => {
    const { judge } = await import('../../judge/index')
    const { slotCard } = await import('../../data/template')
    const won = slotCard(slotByKey('t1_next_deposit')!, 300000000)
    expect((await judge(won, '300000000', '300000000')).verdict).toBe('green')
    expect((await judge(won, '300000000', '300000001')).verdict).toBe('red')
    const when = slotCard(slotByKey('t1_buy_when')!, '2032-06')
    expect((await judge(when, '2032-06', '2032-07')).verdict).toBe('red')
    const age = slotCard(slotByKey('t3_husband_retire')!, 60)
    expect(await judge(age, '61', '61')).toMatchObject({ verdict: 'red', redKind: 'plan_stale' })
  })
})
