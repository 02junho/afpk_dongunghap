import { describe, expect, it } from 'vitest'
import { normalizeNewCard, newCardKey, splitOptions } from '../card-form'
import { showPlanned } from '../../data/demo'

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

  it('알 수 없는 주제·타입은 거부', () => {
    expect(normalizeNewCard({ ...base, category: 'wedding', type: 'text', plannedValue: 'x' }).ok).toBe(false)
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
