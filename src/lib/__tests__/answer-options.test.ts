import { describe, expect, it } from 'vitest'
import { NA, KNOW, NON_VALUE, SLOTS, slotByKey, slotCard } from '../../data/template'
import { formatValue } from '../answer-options'
import { REVIEW } from '../../data/review'
import { answerValue, EMPTY_ANSWER, numValue } from '../answer-input'
import { judge, OTHER_PREFIX } from '../../judge/index'
import { mockLlm } from '../../judge/text-llm'

const card = (key: string, v?: string) => { const s = slotByKey(key)!; return slotCard(s, v ?? s.example) }

describe('목표 질문 답 칸 (11.05 밤) — 계획을 보여 주지 않고 숫자 · 보기로', () => {
  it('금액은 숫자만 적으면 만 원 단위, 단위를 붙여도 읽는다', () => {
    const life = card('t3_life_monthly')
    expect(numValue(life, '300')).toBe('3000000')
    expect(numValue(life, '1,200')).toBe('12000000')
    expect(numValue(card('t1_home_price'), '4억 8천')).toBe('480000000')
    expect(numValue(card('t1_home_price'), '48000')).toBe('480000000')
    expect(numValue(life, '많이')).toBe('')
  })
  it('나이 · 개수 · 연도 · 비율은 숫자 그대로', () => {
    expect(numValue(card('t3_husband_retire'), '60')).toBe('60')
    expect(numValue(card('t1_buy_year'), '2032')).toBe('2032')
    expect(numValue(card('t2_leave_months'), '6개월')).toBe('6')
    expect(numValue(card('t5_repay_ratio'), '120')).toBe('')
  })
  it('보기 · 말로 적기 · 아무것도 안 고름', () => {
    const c = card('t6_house_fund_where')
    expect(answerValue(c, { ...EMPTY_ANSWER, mode: 'opt', opt: '절반씩' })).toBe('절반씩')
    expect(answerValue(c, { ...EMPTY_ANSWER, mode: 'other', other: ' 반반쯤 ' })).toBe(OTHER_PREFIX + '반반쯤')
    expect(answerValue(c, { ...EMPTY_ANSWER, mode: 'other', other: '  ' })).toBe('')
    expect(answerValue(c, EMPTY_ANSWER)).toBe('')
  })
  it('30칸 모두 아직 모름 · 해당 없음이 붙고, 보기 칸은 아직 모름 · 해당 없음 말고도 보기가 2개 이상', () => {
    for (const s of SLOTS) {
      for (const x of NON_VALUE) expect(s.options, s.key).toContain(x)
      if (s.type === 'choice') expect(s.options!.filter(o => !NON_VALUE.includes(o)).length, s.key).toBeGreaterThanOrEqual(2)
      // 수정 방향 검토 기준 (11.14) — 30칸 모두, 함께 볼 질문은 틀 안의 다른 칸
      const r = REVIEW[s.key]
      expect(r?.check, s.key).toBeTruthy()
      for (const k of r.related) { expect(slotByKey(k), `${s.key} → ${k}`).toBeTruthy(); expect(k).not.toBe(s.key) }
    }
  })
  it('계획 값 글 (설계사 화면)', () => {
    expect(formatValue(card('t1_buy_year'), '2032')).toBe('2032년')
    expect(formatValue(card('t2_leave_months'), '12')).toBe('12개월')
    expect(formatValue(card('t3_life_monthly'), '3000000')).toBe('300만원')
    expect(formatValue(card('t1_loan_max'), '0')).toBe('대출 받지 않는다')
    expect(formatValue(card('t4_cancer_cover'), NA)).toBe(NA)
  })
})

describe('판정 — 계획과 같으면 🟢, 다르면 🔴 (허용 범위 없음)', () => {
  it('팀원 예시: 계획 월 300만 — 아내 350만이면 🔴, 둘 다 300만이면 🟢', async () => {
    const life = card('t3_life_monthly')
    expect((await judge(life, '3000000', '3500000')).verdict).toBe('red')
    expect((await judge(life, '3000000', '3000000')).verdict).toBe('green')
    expect((await judge(life, '3500000', '3500000')).verdict).toBe('red')   // 둘 다 바뀌어도 계획과 다르다
  })
  it('30칸 모두: 예시 값을 둘 다 답하면 🟢, 한 분이 아직 모름이면 🔴', async () => {
    for (const s of SLOTS) {
      const c = slotCard(s, s.example)
      expect((await judge(c, s.example, s.example)).verdict, s.key).toBe('green')
      expect((await judge(c, s.example, KNOW)).verdict, s.key).toBe('red')
    }
  })
})

describe('해당 없음 (11.05 A) — 건너뛰지 않고 정답지에 해당 없음', () => {
  it('정답지가 해당 없음이면 둘 다 해당 없음일 때만 🟢 — 숫자 칸도', async () => {
    const months = card('t2_leave_months', NA)
    expect(months.plannedValue).toBe(NA)   // 숫자로 바꾸지 않는다
    expect((await judge(months, NA, NA)).verdict).toBe('green')
    expect((await judge(months, NA, '6')).verdict).toBe('red')   // 새 계획이 생겼다
    expect((await judge(months, NA, KNOW)).verdict).toBe('red')
    const when = card('t2_child_when', NA)
    expect((await judge(when, NA, NA)).verdict).toBe('green')
    expect((await judge(when, NA, '1~2년 안')).verdict).toBe('red')
  })
  it('정답지에 값이 있는데 해당 없음이라고 답하면 🔴', async () => {
    expect((await judge(card('t3_life_monthly'), '3000000', NA)).verdict).toBe('red')
  })
  it('정답지가 해당 없음인데 말로 적었으면 규칙으로 못 읽는다 → AI 가 없으면 🟡', async () => {
    const j = await judge(card('t2_leave_months', NA), NA, OTHER_PREFIX + '아직 아이 생각은 없어요')
    expect(j).toMatchObject({ verdict: 'yellow', needsReview: true })
  })
})

describe('말로 적기 (값만 적었으면 규칙, 아니면 AI)', () => {
  const won = card('t1_home_price')
  it('값만 적었으면 규칙이 읽는다 — 계획과 같으면 🟢', async () => {
    const j = await judge(won, '480000000', OTHER_PREFIX + '4억 8천')
    expect(j).toMatchObject({ verdict: 'green', method: 'deterministic' })
    expect((await judge(won, '480000000', OTHER_PREFIX + '5억')).verdict).toBe('red')
  })
  it('값 말고 다른 말이 섞이면 숫자만 뽑지 않는다 → AI 가 없으면 🟡 확인 필요', async () => {
    const j = await judge(won, '480000000', OTHER_PREFIX + '5억 정도인데 더 오를 수도')
    expect(j).toMatchObject({ verdict: 'yellow', needsReview: true, bVsPlan: 'unparsed' })
  })
  it('AI 가 있으면 말로 적은 답만 AI 가 본다 — 규칙으로 읽은 쪽은 그대로', async () => {
    const j = await judge(won, '480000000', OTHER_PREFIX + '5억 정도인데 더 오를 수도', mockLlm)
    expect(j.method).toBe('llm')
    expect(j.aVsPlan).toBe('match')
    expect(j.bVsPlan).not.toBe('unparsed')
  })
  it('숫자 · 보기 답에는 AI 를 쓰지 않는다', async () => {
    expect((await judge(won, '480000000', '450000000', mockLlm)).method).toBe('deterministic')
    expect((await judge(card('t5_rate_type'), '고정금리', '변동금리', mockLlm)).method).toBe('deterministic')
  })
})
