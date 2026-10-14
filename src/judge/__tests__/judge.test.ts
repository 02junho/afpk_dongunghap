import { describe, it, expect } from 'vitest'
import { judge, resolve, parseWon, parseYearMonth, type Card } from '../index'
import { parseOutput } from '../text-llm'

const price: Card = { key: 'home_price', category: 'housing', type: 'number', label: '목표 주택가격', question: '얼마짜리 집을 보고 계세요?', plannedValue: 600_000_000, tolerance: 0.05, stake: '신혼부부 구입자금 상한 6억' }
const when: Card = { key: 'home_when', category: 'housing', type: 'date', label: '주택 취득 시점', question: '언제쯤 집을 사실 계획인가요?', plannedValue: '2029-06', tolerance: 6, stake: '전세 만기·특례 기한' }
const leave: Card = { key: 'leave_who', category: 'children', type: 'choice', label: '육아휴직 주체', question: '육아휴직은 누가?', plannedValue: '아내', options: ['남편', '아내', '둘 다', '미정'], stake: '외벌이 전환 현금흐름' }

describe('파서', () => {
  it('금액', () => {
    expect(parseWon('6억')).toBe(6e8)
    expect(parseWon('6억 2천만')).toBe(6.2e8)
    expect(parseWon('62,000만원')).toBe(6.2e8)
    expect(parseWon('620000000')).toBe(6.2e8)
    expect(parseWon('모르겠어요')).toBeNaN()
  })
  it('시점', () => {
    expect(parseYearMonth('2029년')).toBe('2029-06')
    expect(parseYearMonth('2029-03')).toBe('2029-03')
    expect(parseYearMonth('2029년 3월')).toBe('2029-03')
    expect(parseYearMonth('내후년', new Date('2027-01-01'))).toBe('2029-06')
    expect(parseYearMonth('애 낳고 나서')).toBeNull()
  })
})

describe('3자 비교 → 신호등', () => {
  it('둘 다 전제와 같음 → 🟢', () => expect(resolve('match', 'match', true).verdict).toBe('green'))
  it('한쪽 minor → 🟡', () => expect(resolve('minor', 'match', true).verdict).toBe('yellow'))
  it('한쪽 major → 🔴 부부 불일치', () => expect(resolve('major', 'match', false)).toEqual({ verdict: 'red', redKind: 'couple_conflict' }))
  it('둘 다 major인데 서로 일치 → 🔴 전제 폐기 (부부는 같은 생각, 설계가 낡음)', () =>
    expect(resolve('major', 'major', true)).toEqual({ verdict: 'red', redKind: 'plan_stale' }))
  it('둘 다 major, 서로도 다름 → 🔴 부부 불일치', () =>
    expect(resolve('major', 'major', false)).toEqual({ verdict: 'red', redKind: 'couple_conflict' }))
})

describe('결정적 카드', () => {
  it('number: 6억 vs 6억 2천 → 🟡 (허용 5%, 3.3% 차이는 match… 둘 다 match면 🟢)', async () => {
    const j = await judge(price, '6억', '6억 2천만')
    expect(j.method).toBe('deterministic')
    expect(j.verdict).toBe('green')
  })
  it('number: 6억 vs 7억 → 🔴', async () => {
    expect((await judge(price, '6억', '7억')).verdict).toBe('red')
  })
  it('number: 둘 다 7억 → 🔴 전제 폐기', async () => {
    const j = await judge(price, '7억', '7억 정도')
    expect(j.verdict).toBe('red'); expect(j.redKind).toBe('plan_stale')
  })
  it('date: 2029 vs 2030 → 🟡 (12개월 = 허용 6개월의 2배 이내)', async () => {
    expect((await judge(when, '2029년', '2030년')).verdict).toBe('yellow')
  })
  it('date: 파싱 불가 → 🟡 + 사유', async () => {
    const j = await judge(when, '2029년', '애 낳고 나서')
    expect(j.verdict).toBe('yellow'); expect(j.reason).toContain('해석')
  })
  it('choice: 아내 vs 남편 → 🔴', async () => {
    expect((await judge(leave, '아내', '남편')).verdict).toBe('red')
  })
})

describe('LLM 출력 파싱', () => {
  it('정상', () => {
    expect(parseOutput('{"aVsPlan":"match","bVsPlan":"minor","abAgree":true,"reason":"ok"}').bVsPlan).toBe('minor')
  })
  it('앞뒤 잡담 섞여도 JSON만 뽑음', () => {
    expect(parseOutput('네, 결과입니다.\n{"aVsPlan":"major","bVsPlan":"major","abAgree":false,"reason":"x"}\n끝').abAgree).toBe(false)
  })
  it('형식 오류는 throw — 조용히 🟢 되면 안 됨', () => {
    expect(() => parseOutput('{"aVsPlan":"yes"}')).toThrow()
  })
})
