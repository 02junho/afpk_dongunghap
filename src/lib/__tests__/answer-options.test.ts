import { describe, expect, it } from 'vitest'
import { SLOTS, slotByKey, slotCard } from '../../data/template'
import { answerChoices, formatValue, niceWon } from '../answer-options'
import { judge, OTHER_PREFIX } from '../../judge/index'
import { mockLlm } from '../../judge/text-llm'

const NOW = new Date('2026-11-05')
const card = (key: string, v?: string) => { const s = slotByKey(key)!; return slotCard(s, v ?? s.example) }

describe('다른 답 후보 (11.05 객관식) — 계획 값에서 규칙으로', () => {
  it('금액: 3억 → 1.5억 · 2.5억 · 3.5억 · 4.5억 + 아직 모름', () => {
    expect(answerChoices(card('t1_next_deposit'), NOW).map(c => c.label)).toEqual(['1억 5,000만원', '2억 5,000만원', '3억 5,000만원', '4억 5,000만원', '아직 모름'])
  })
  it('금액 0 이 말이 되는 칸은 이름을 붙여 맨 앞에', () => {
    expect(answerChoices(card('t1_family_support'), NOW)[0]).toEqual({ value: '0', label: '지원 없음' })
  })
  it('시점: 1년 전 · 6개월 전 · 6개월 뒤 · 1년 뒤 · 2년 뒤 — 지난 달은 뺀다', () => {
    expect(answerChoices(card('t1_buy_when'), NOW).map(c => c.value)).toEqual(['2031-06', '2031-12', '2032-12', '2033-06', '2034-06', '집을 사지 않기로 했다', '아직 모름'])
    expect(answerChoices(card('t5_debt_clear'), NOW).map(c => c.value).slice(0, 2)).toEqual(['2027-06', '2027-12'])
  })
  it('개수: 틀의 후보에서 계획 값을 뺀다', () => {
    expect(answerChoices(card('t2_child_count'), NOW).map(c => c.label)).toEqual(['아이 계획 없음', '1명', '3명', '4명', '아직 모름'])
  })
  it('나이 · 선택', () => {
    expect(answerChoices(card('t3_husband_retire'), NOW).map(c => c.label)).toEqual(['만 55세', '만 58세', '만 62세', '만 65세', '아직 모름'])
    expect(answerChoices(card('t5_support_kind'), NOW).map(c => c.value)).toEqual(['빌리는 돈', '아직 모름'])
  })
  it('30칸 모두: 후보가 2개 이상, 계획 값과 같은 후보는 없다, 고르면 🔴', async () => {
    for (const s of SLOTS) {
      const c = slotCard(s, s.example)
      const list = answerChoices(c, NOW)
      expect(list.length, s.key).toBeGreaterThanOrEqual(2)
      expect(new Set(list.map(x => x.value)).size, s.key).toBe(list.length)
      for (const x of list) {
        expect(x.value, s.key).not.toBe(String(c.plannedValue))
        expect((await judge(c, String(c.plannedValue), x.value)).verdict, `${s.key} · ${x.label}`).toBe('red')
      }
      expect((await judge(c, String(c.plannedValue), String(c.plannedValue))).verdict, s.key).toBe('green')
    }
  })
  it('보기 좋은 금액 단위', () => {
    expect(niceWon(92_500, 185_000)).toBe(90_000)
    expect(niceWon(240_000_000, 300_000_000)).toBe(250_000_000)
    expect(niceWon(360_000_000, 300_000_000)).toBe(350_000_000)
    expect(formatValue(card('t2_leave_months'), '12')).toBe('12개월')
    expect(formatValue(card('t4_premium_limit'), '185000')).toBe('18만 5,000원')   // 19만원으로 반올림하면 안 된다
  })
})

describe('기타 — 직접 적기 (가안: 값만 적었으면 규칙, 아니면 AI)', () => {
  const won = card('t1_next_deposit')
  it('값만 적었으면 규칙이 읽는다 — 계획과 같으면 🟢', async () => {
    const j = await judge(won, '300000000', OTHER_PREFIX + '3억')
    expect(j).toMatchObject({ verdict: 'green', method: 'deterministic' })
    expect((await judge(won, '300000000', OTHER_PREFIX + '3억 2천')).verdict).toBe('red')
  })
  it('값 말고 다른 말이 섞이면 숫자만 뽑지 않는다 → AI 가 없으면 🟡 확인 필요', async () => {
    const j = await judge(won, '300000000', OTHER_PREFIX + '3억 정도인데 더 주실 수도')
    expect(j).toMatchObject({ verdict: 'yellow', needsReview: true, bVsPlan: 'unparsed' })
  })
  it('AI 가 있으면 기타 답만 AI 가 본다 — 규칙으로 읽은 쪽은 그대로', async () => {
    const j = await judge(won, '300000000', OTHER_PREFIX + '3억 정도인데 더 주실 수도', mockLlm)
    expect(j.method).toBe('llm')
    expect(j.aVsPlan).toBe('match')
    expect(j.bVsPlan).not.toBe('unparsed')
  })
  it('기타가 아닌 답에는 AI 를 쓰지 않는다', async () => {
    expect((await judge(won, '300000000', '450000000', mockLlm)).method).toBe('deterministic')
  })
  it('"아직 모름"은 계획과 다른 답 → 🔴', async () => {
    expect((await judge(won, '300000000', '아직 모름')).verdict).toBe('red')
    expect((await judge(card('t1_buy_when'), '2032-06', '집을 사지 않기로 했다')).verdict).toBe('red')
  })
  it('시점 기타는 연 · 월만 적었을 때만 규칙이 읽는다', async () => {
    const when = card('t1_buy_when')
    expect((await judge(when, '2032-06', OTHER_PREFIX + '2032년 6월')).verdict).toBe('green')
    expect((await judge(when, '2032-06', OTHER_PREFIX + '2032년쯤')).verdict).toBe('yellow')
  })
})
