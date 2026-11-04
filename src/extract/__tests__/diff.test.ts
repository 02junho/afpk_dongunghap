import { describe, expect, it } from 'vitest'
import { matchCandidates, sheetKey, type ExistingCard } from '../diff'

/** 엑셀 다시 읽기 — 이미 있는 카드와 맞춰 보기 (11.04). 같은 엑셀을 다시 올려도 두 벌이 되지 않아야 한다 */
const row = (table: string, label: string, value: number, cardLabel = label) => ({ item: { table, label, value }, label: cardLabel })
const card = (o: Partial<ExistingCard> & Pick<ExistingCard, 'cardId' | 'key' | 'label'>): ExistingCard => ({ type: 'number', plannedValue: 0, ...o })

describe('엑셀 다시 읽기: 바뀐 것만', () => {
  const salary = row('현금흐름표', '남편 급여', 72_000_000, '남편 연 급여(세전)')

  it('엑셀로 만든 카드는 엑셀 자리(key)로 찾는다 — 같으면 그대로, 다르면 바뀜', () => {
    const ex = [card({ cardId: 'c1', key: sheetKey(salary), label: '남편 연 급여(세전)', plannedValue: 67_000_000 })]
    expect(matchCandidates([salary], ex)).toEqual([{ status: 'changed', existing: ex[0] }])
    expect(matchCandidates([row('현금흐름표', '남편 급여', 67_000_000)], ex)[0].status).toBe('same')
  })

  it('카드 이름을 고쳐 저장했어도 key 로 찾는다', () => {
    const ex = [card({ cardId: 'c1', key: sheetKey(salary), label: '남편 연봉', plannedValue: 72_000_000 })]
    expect(matchCandidates([salary], ex)[0].status).toBe('same')
  })

  it('같은 이름이라도 표가 다르면 다른 카드 — 현금흐름표 적금(1년 납입) ≠ 재무상태표 적금(잔액)', () => {
    const flow = row('현금흐름표', '적금', 5_000_000, '적금 (1년)')
    const bal = row('재무상태표', '적금', 15_000_000)
    const ex = [card({ cardId: 'c1', key: sheetKey(flow), label: '적금 (1년)', plannedValue: 5_000_000 })]
    expect(matchCandidates([flow, bal], ex).map(m => m.status)).toEqual(['same', 'new'])
  })

  it('예전에 만든 카드(무작위 key)는 이름이 같고 하나뿐일 때만 같은 카드로 본다', () => {
    const old = [card({ cardId: 'c1', key: 'p_abc', label: '남편 연 급여(세전)', plannedValue: 67_000_000 })]
    expect(matchCandidates([salary], old)[0]).toMatchObject({ status: 'changed', existing: { cardId: 'c1' } })
    const twin = [...old, card({ cardId: 'c2', key: 'p_def', label: '남편 연 급여(세전)', plannedValue: 67_000_000 })]
    expect(matchCandidates([salary], twin)[0].status).toBe('new')   // 어느 쪽인지 모르면 추측하지 않는다
  })

  it('카드 하나는 엑셀 한 줄에만 맞춘다', () => {
    const old = [card({ cardId: 'c1', key: 'p_abc', label: '보증금', plannedValue: 20_000_000 })]
    const a = row('재무상태표', '월세 보증금', 20_000_000, '보증금')
    const b = row('재무상태표', '전세 보증금', 30_000_000, '보증금')
    expect(matchCandidates([a, b], old).map(m => m.status)).toEqual(['same', 'new'])
  })

  it('서술형 카드와는 이름이 같아도 맞추지 않는다 (엑셀 금액은 금액 카드에만)', () => {
    const ex = [card({ cardId: 'c1', key: 'p_abc', label: '보증금', type: 'text', plannedValue: '2천만' })]
    expect(matchCandidates([row('재무상태표', '월세 보증금', 20_000_000, '보증금')], ex)[0].status).toBe('new')
  })
})
