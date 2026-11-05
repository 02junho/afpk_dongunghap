import { describe, it, expect } from 'vitest'
import { judge, resolve, escalate, parseWon, parseCount, parseYearMonth, type Card, type Judgment } from '../index'
import { parseOutput, mockLlm } from '../text-llm'
import { buildPrompt, PROMPT_VERSIONS } from '../prompt'

const price: Card = { key: 'home_price', category: 'housing', type: 'number', unit: 'krw', label: '목표 주택가격', question: '얼마짜리 집을 보고 계세요?', plannedValue: 600_000_000, tolerance: 0.05, stake: '신혼부부 구입자금 상한 6억' }
const when: Card = { key: 'home_when', category: 'housing', type: 'date', label: '주택 취득 시점', question: '언제쯤 집을 사실 계획인가요?', plannedValue: '2029-06', tolerance: 6, allowCondition: true, stake: '전세 만기·특례 기한' }
const leave: Card = { key: 'leave_who', category: 'children', type: 'choice', label: '육아휴직 주체', question: '육아휴직은 누가?', plannedValue: '아내', options: ['남편', '아내', '둘 다', '미정'], stake: '외벌이 전환 현금흐름' }
const saving: Card = { key: 'saving', category: 'saving', type: 'number', unit: 'krw', label: '월 저축액', question: '한 달에 얼마나 저축하세요?', plannedValue: 1_320_000, tolerance: 0.15, stake: '2029년 자기자금 2.5억 달성' }
const retire: Card = { key: 'retire_age', category: 'retire', type: 'number', unit: 'age', label: '은퇴 목표 연령', question: '몇 살쯤 은퇴하고 싶으세요?', plannedValue: 60, tolerance: 0.05, stake: '연금 납입 유보 판단' }

describe('파서 — 금액', () => {
  it('단위가 명시된 금액', () => {
    expect(parseWon('6억')).toBe(6e8)
    expect(parseWon('6억 2천만')).toBe(6.2e8)
    expect(parseWon('62,000만원')).toBe(6.2e8)
    expect(parseWon('620000000')).toBe(6.2e8)
    expect(parseWon('8,000만원')).toBe(8e7)
    expect(parseWon('1.5억')).toBe(1.5e8)
  })
  it('억 뒤의 "천"은 "천만" — 조용히 사라지면 안 된다', () => {
    expect(parseWon('6억 2천')).toBe(6.2e8)
    expect(parseWon('1억5천')).toBe(1.5e8)
  })
  it('모호한 입력은 NaN — 틀린 숫자보다 파싱 실패가 낫다', () => {
    expect(parseWon('6천')).toBeNaN() // 6천원? 6천만원?
    expect(parseWon('6')).toBeNaN() // 금액이 6원일 수는 없다
    expect(parseWon('600')).toBeNaN()
    expect(parseWon('모르겠어요')).toBeNaN()
  })
  it('0은 유효한 금액 — 저축 못 하고 있어요', () => {
    expect(parseWon('0')).toBe(0)
    expect(parseWon('0원')).toBe(0)
  })
})

describe('파서 — 나이·시점', () => {
  it('나이는 단위 없는 숫자를 받는다', () => {
    expect(parseCount('60')).toBe(60)
    expect(parseCount('65세')).toBe(65)
    expect(parseCount('예순')).toBeNaN()
  })
  it('시점', () => {
    expect(parseYearMonth('2029년')).toBe('2029-06')
    expect(parseYearMonth('2029-03')).toBe('2029-03')
    expect(parseYearMonth('2029년 3월')).toBe('2029-03')
    expect(parseYearMonth('내후년', new Date('2027-01-01'))).toBe('2029-06')
    expect(parseYearMonth('애 낳고 나서')).toBeNull()
  })
})

describe('계획과 비교 → 신호등 (11.05: 다르면 다른 것, 부부 불일치를 나누지 않는다)', () => {
  it('둘 다 계획과 같음 → 🟢', () => expect(resolve('match', 'match', true).verdict).toBe('green'))
  it('한 분이라도 조금 다름(minor) → 🔴 — 허용 범위 없음', () => expect(resolve('minor', 'match', true)).toEqual({ verdict: 'red' }))
  it('한 분만 다름 → 🔴 계획과 다름 (부부 불일치라고 따로 부르지 않는다)', () =>
    expect(resolve('major', 'match', false)).toEqual({ verdict: 'red' }))
  it('둘 다 다름 → 🔴 계획과 다름 (두 답이 같은지는 판정에 쓰지 않는다)', () => {
    expect(resolve('major', 'major', true)).toEqual({ verdict: 'red' })
    expect(resolve('major', 'major', false)).toEqual({ verdict: 'red' })
  })
  it('해석 불가가 섞이면 🟡 — major 로도 match 로도 가지 않는다', () => {
    expect(resolve('unparsed', 'match', true).verdict).toBe('yellow')
    expect(resolve('major', 'unparsed', false).verdict).toBe('yellow')
  })
})

describe('2연속 🟡 → 🔴 승격', () => {
  const y: Judgment = { verdict: 'yellow', aVsPlan: 'minor', bVsPlan: 'match', abAgree: true, reason: '', method: 'deterministic' }
  it('직전이 🟡이면 승격되고 red_kind 가 붙는다', () => {
    const e = escalate(y, 'yellow')
    expect(e.verdict).toBe('red')
    expect(e.redKind).toBe('repeated_yellow')
  })
  it('직전이 🟢이면 그대로 🟡', () => expect(escalate(y, 'green').verdict).toBe('yellow'))
  it('직전 기록이 없으면 그대로 🟡', () => expect(escalate(y).verdict).toBe('yellow'))
  it('🟢은 승격 대상이 아니다', () =>
    expect(escalate({ ...y, verdict: 'green' }, 'yellow').verdict).toBe('green'))
  it('judge() 가 previousVerdict 를 받아 승격한다', async () => {
    const j = await judge(when, '2029년', '애 낳고 나서', undefined, { previousVerdict: 'yellow' })
    expect(j.verdict).toBe('red')
    expect(j.redKind).toBe('repeated_yellow')
  })
})

describe('결정적 카드', () => {
  it('number: 6억 vs 6억 2천만 → 둘 다 허용 5% 안 → 🟢', async () => {
    const j = await judge(price, '6억', '6억 2천만')
    expect(j.method).toBe('deterministic')
    expect(j.verdict).toBe('green')
  })
  it('number: 6억 vs 7억 → 🔴', async () => {
    expect((await judge(price, '6억', '7억')).verdict).toBe('red')
  })
  it('number: 둘 다 7억 → 🔴 계획과 다름', async () => {
    const j = await judge(price, '7억', '7억 정도')
    expect(j.verdict).toBe('red')
    expect(j.redKind).toBeUndefined()
  })
  it('number: 모호한 금액은 🟡 + 사람이 봐야 함 (🔴으로 가지 않는다)', async () => {
    const j = await judge(price, '6억', '6천')
    expect(j.verdict).toBe('yellow')
    expect(j.needsReview).toBe(true)
    expect(j.bVsPlan).toBe('unparsed')
  })
  it('number: 둘 다 "0원" 저축 → 🔴 (두 답은 서로 같다 — 참고로만 남는다)', async () => {
    const j = await judge(saving, '0', '0원')
    expect(j.verdict).toBe('red')
    expect(j.abAgree).toBe(true)
  })
  it('number(age): 60세 vs 62 → 🟢 (나이를 금액 규칙으로 파싱하지 않는다)', async () => {
    const j = await judge(retire, '60세', '62') // 금액 규칙이면 둘 다 unparsed → 🟡이 되어버린다
    expect(j.aVsPlan).toBe('match')
    expect(j.bVsPlan).toBe('match') // ±5% = ±3년
    expect(j.verdict).toBe('green')
  })
  it('number(age): 60 vs 67 → 🔴 (허용 범위의 2배 초과)', async () => {
    expect((await judge(retire, '60', '67')).verdict).toBe('red')
  })
  it('date: 2029 vs 2030 → 🔴 (허용 범위 안이 아니면 조금 달라도 다름)', async () => {
    expect((await judge(when, '2029년', '2030년')).verdict).toBe('red')
  })
  it('date: 조건부 답변 → 🟡 + 조건부라고 사유에 남는다', async () => {
    const j = await judge(when, '2029년', '애 낳고 나서')
    expect(j.verdict).toBe('yellow')
    expect(j.needsReview).toBe(true)
    expect(j.reason).toContain('조건')
  })
  it('choice: 아내 vs 남편 → 🔴', async () => {
    expect((await judge(leave, '아내', '남편')).verdict).toBe('red')
  })
  it('choice: "기타: …" 직접 입력은 추측하지 않고 🟡 + 설계사 확인 (10.23 Q1)', async () => {
    const j = await judge(leave, '아내', '기타: 번갈아 쓰기로')
    expect(j.verdict).toBe('yellow')
    expect(j.needsReview).toBe(true)
    expect(j.reason).toContain('기타')
  })
  it('choice: 둘 다 그대로(전제와 같은 보기) → 🟢', async () => {
    expect((await judge(leave, '아내', '아내')).verdict).toBe('green')
  })
  it('text 카드는 LlmClient 없이 판정하지 않는다', async () => {
    const t: Card = { key: 't', category: 'income', type: 'text', label: 'x', question: 'x', plannedValue: 'x', stake: 'x' }
    await expect(judge(t, 'a', 'b')).rejects.toThrow('LlmClient')
  })
  it('결정적 판정은 promptVersion 을 남기지 않는다 (LLM을 안 썼으므로)', async () => {
    expect((await judge(price, '6억', '6억')).promptVersion).toBeUndefined()
  })
})

describe('LLM 경로', () => {
  it('text 카드는 method=llm + promptVersion 기록', async () => {
    const t: Card = { key: 'raise_plan', category: 'income', type: 'text', label: '승진·이직', question: 'x', plannedValue: '없음', stake: 'x' }
    const j = await judge(t, '없음', '없음', mockLlm)
    expect(j.method).toBe('llm')
    expect(j.promptVersion).toBe(PROMPT_VERSIONS.judge)
  })
  it('정상 출력 파싱', () => {
    expect(parseOutput('{"aVsPlan":"match","bVsPlan":"minor","abAgree":true,"reason":"ok"}').bVsPlan).toBe('minor')
  })
  it('앞뒤 잡담 섞여도 JSON만 뽑음', () => {
    expect(parseOutput('네, 결과입니다.\n{"aVsPlan":"major","bVsPlan":"major","abAgree":false,"reason":"x"}\n끝').abAgree).toBe(false)
  })
  it('형식 오류는 throw — 조용히 🟢 되면 안 됨', () => {
    expect(() => parseOutput('{"aVsPlan":"yes"}')).toThrow()
  })
})

describe('프롬프트', () => {
  it('abAgree 의 정의가 프롬프트에 들어 있다 (v1의 누락 지점)', () => {
    const p = buildPrompt({ label: 'x', question: 'x', plannedValue: 'x', stake: 'x' }, 'a', 'b')
    expect(p).toContain('동시에 참일 수 있는가')
  })
  it('전제·답변이 프롬프트에 그대로 들어간다', () => {
    const p = buildPrompt({ label: '승진', question: '계획?', plannedValue: '없음', stake: '자격 상실' }, '이직해요', '없어요')
    expect(p).toContain('이직해요')
    expect(p).toContain('자격 상실')
  })
})
