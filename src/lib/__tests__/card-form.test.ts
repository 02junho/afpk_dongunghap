import { describe, expect, it } from 'vitest'
import { normalizeNewCard, newCardKey, splitOptions } from '../card-form'
import { showPlanned } from '../../data/demo'
import { inviteMessage } from '../install'

const base = { category: 'housing', label: '전세 보증금', question: '전세 보증금은 얼마로 생각하나요?', stake: '자기자금을 뺀 나머지가 대출 금액' }

describe('normalizeNewCard — 카드 추가 입력 검사', () => {
  it('금액: "3억" → 원 단위 문자열, 허용 범위 기본 5%', () => {
    const r = normalizeNewCard({ ...base, type: 'number', unit: 'krw', plannedValue: '3억' })
    expect(r.ok && r.card).toMatchObject({ plannedValue: '300000000', unit: 'krw', tolerance: 0.05, options: null })
  })

  it('금액: 단위 없는 작은 숫자는 거부 (60원일 리 없다)', () => {
    const r = normalizeNewCard({ ...base, type: 'number', unit: 'krw', plannedValue: '60' })
    expect(r.ok).toBe(false)
  })

  it('나이: "60세" → 60', () => {
    const r = normalizeNewCard({ ...base, type: 'number', unit: 'age', plannedValue: '60세' })
    expect(r.ok && r.card.plannedValue).toBe('60')
  })

  it('시점: "2029년 6월" → 2029-06, 기본 ±6개월, 조건 허용 유지', () => {
    const r = normalizeNewCard({ ...base, type: 'date', plannedValue: '2029년 6월', allowCondition: true })
    expect(r.ok && r.card).toMatchObject({ plannedValue: '2029-06', tolerance: 6, allowCondition: true, unit: null })
  })

  it('시점: 연도 없는 값("내년")은 저장하지 않는다 — 저장 시점에 따라 값이 바뀐다', () => {
    expect(normalizeNewCard({ ...base, type: 'date', plannedValue: '내년' }).ok).toBe(false)
  })

  it('선택: 전제 값은 선택지 중 하나여야 한다', () => {
    expect(normalizeNewCard({ ...base, type: 'choice', plannedValue: '공동', options: '남편, 아내' }).ok).toBe(false)
    const r = normalizeNewCard({ ...base, type: 'choice', plannedValue: '남편', options: '남편\n아내\n둘 다' })
    expect(r.ok && r.card.options).toEqual(['남편', '아내', '둘 다'])
  })

  it('흔들리면 무너지는 것은 필수 (큐·AI 요약이 쓴다)', () => {
    expect(normalizeNewCard({ ...base, stake: ' ', type: 'text', plannedValue: '현 직장 유지' }).ok).toBe(false)
  })

  it('카드 틀 확정(10.25)의 새 주제 결혼·부채·소비를 받는다', () => {
    expect(normalizeNewCard({ ...base, category: 'wedding', type: 'text', plannedValue: '작은 결혼식' }).ok).toBe(true)
    expect(normalizeNewCard({ ...base, category: 'debt', type: 'text', plannedValue: '할부 먼저 정리' }).ok).toBe(true)
  })

  it('알 수 없는 주제·타입은 거부', () => {
    expect(normalizeNewCard({ ...base, category: 'pet', type: 'text', plannedValue: 'x' }).ok).toBe(false)
    expect(normalizeNewCard({ ...base, type: 'bool', plannedValue: 'x' }).ok).toBe(false)
  })
})

describe('showPlanned — 큐·변경 이력의 전제 값 표시', () => {
  it('금액·시점·나이를 사람이 읽는 형태로', () => {
    expect(showPlanned('number', 'krw', '650000000')).toBe('6.5억원')
    expect(showPlanned('date', null, '2029-12')).toBe('2029년 12월')
    expect(showPlanned('number', 'age', '60')).toBe('만 60세')
  })
  it('타입을 모르거나 숫자가 아니면 그대로', () => {
    expect(showPlanned(undefined, null, '650000000')).toBe('650000000')
    expect(showPlanned('number', 'krw', '—')).toBe('—')
    expect(showPlanned('text', null, '현 직장 유지')).toBe('현 직장 유지')
  })
})

describe('보조 함수', () => {
  it('splitOptions: 쉼표·줄바꿈, 빈 칸·중복 제거', () => {
    expect(splitOptions('가, 나,,가\n다')).toEqual(['가', '나', '다'])
  })
  it('newCardKey: p_ 접두사, 템플릿 key 와 겹치지 않음', () => {
    expect(newCardKey(0, 0)).toBe('p_000')
    expect(newCardKey()).toMatch(/^p_[0-9a-z]+$/)
  })
})

describe('inviteMessage — 설계사가 카톡으로 보내는 안내문', () => {
  it('링크·코드·홈 화면 추가 방법·블라인드 안내가 다 들어간다', () => {
    const m = inviteMessage({ husband: '현우', wife: '지우', code: '482913', url: 'https://x.app/c/join?code=482913' })
    expect(m.split('\n')[0]).toBe('[돈궁합] 현우 · 지우 님, 입장 안내드립니다.')
    expect(m).toContain('https://x.app/c/join?code=482913')
    expect(m).toContain('입장 코드: 482913')
    expect(m).toContain('홈 화면에 추가')
    expect(m).toContain('설계사만 봅니다')
    expect(m.indexOf('홈 화면에 추가')).toBeLessThan(m.indexOf('입장 코드'))  // 추가 먼저, 입장은 아이콘에서
  })
  it('이름이 기본값(남편/아내)뿐이면 이름 없이 인사한다', () => {
    const m = inviteMessage({ husband: '남편', wife: '아내', code: '1', url: 'u' })
    expect(m.split('\n')[0]).toBe('[돈궁합] 입장 안내드립니다.')
  })
})

import { addMonths, formatKDate, nextCheckDate } from '../cycle'
describe('정기 맞춰보기 주기 (10.23 Q10·Q11)', () => {
  it('마지막 맞춰보기 + 3개월', () => {
    const d = nextCheckDate('2026-10-23T05:00:00Z')!
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2027, 1, 23])
  })
  it('31일 → 짧은 달이면 말일', () => {
    const d = addMonths(new Date(2026, 10, 30), 3)   // 11/30 + 3개월 = 2/28
    expect([d.getMonth() + 1, d.getDate()]).toEqual([2, 28])
  })
  it('한 번도 안 했으면 날짜 없음', () => {
    expect(nextCheckDate(null)).toBeNull()
  })
  it('같은 해면 월·일만, 해가 바뀌면 연도까지', () => {
    const now = new Date(2026, 9, 23)
    expect(formatKDate(new Date(2026, 11, 5), now)).toBe('12월 5일')
    expect(formatKDate(new Date(2027, 0, 23), now)).toBe('2027년 1월 23일')
  })
})
