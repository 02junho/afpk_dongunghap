import { describe, expect, it } from 'vitest'
import { utils } from 'xlsx'
import { readStatement, toCandidates } from '../statement'
import { namesFromFilename } from '../names'

/** 팀 재무설계 엑셀과 같은 모양 (현금흐름표 A~D, 재무상태표 F~I, 단위 만원) */
function sampleWorkbook() {
  const ws = utils.aoa_to_sheet([
    ['현금흐름표', null, null, null, null, '재무상태표'],
    ['유입 항목', '금액(만원)', '유출 항목', '금액(만원)', null, '자산 항목', '금액(만원)', '부채·순자산 항목', '금액(만원)'],
    ['근로소득', null, '저축 및 투자', null, null, '현금성자산', null, '단기부채'],
    ['남편 급여', 6700, '적금', 500, null, '은행예금', 1500, '자동차 할부잔액', 1130],
    ['사업소득', null, '주식 및 ETF', 291, null, '적금', 1500, '계', 1130],
    ['아내 프리랜서 매출', 4000, '계', 791, null, '사용자산', null, '순자산', 12870],
    ['유출 비중', null, '고정지출', null, null, '월세 보증금', 2000],
    ['저축 및 투자', 0.141, '월세', 1140, null, '총자산', 14000],
    [null, null, '보장성보험료', 357],
    ['총유입', 10700, '총유출', 10562],
  ])
  ws['B8'].z = '0.00%'; ws['B8'].w = '14.10%'
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '재무제표')
  return wb
}

describe('재무설계 엑셀 → 질문 카드 후보 (규칙, AI 안 씀 · 10.27)', () => {
  const items = readStatement(sampleWorkbook())
  const by = (label: string) => items.find(i => i.label === label)

  it('항목 | 금액(만원) 을 원 단위로 읽는다', () => {
    expect(by('남편 급여')).toMatchObject({ value: 67_000_000, cell: 'B4', table: '현금흐름표', group: '근로소득', unitNote: '만원' })
    expect(by('자동차 할부잔액')).toMatchObject({ value: 11_300_000, table: '재무상태표', group: '단기부채' })
  })

  it('계 · 총유입 · 총유출 · 총자산 · 순자산 · 비중(%) 줄은 건너뛴다', () => {
    const labels = items.map(i => i.label)
    for (const skip of ['계', '총유입', '총유출', '총자산', '순자산']) expect(labels).not.toContain(skip)
    expect(items.find(i => i.cell === 'B8')).toBeUndefined()   // 저축 및 투자 비중 14.10%
  })

  it('핵심 항목은 기본 선택, 새 항목은 고르지 않은 상태', () => {
    const cs = toCandidates(items)
    const c = (label: string) => cs.find(x => x.item.label === label)!
    expect(c('남편 급여')).toMatchObject({ pick: true, category: 'income', known: true })
    expect(c('월세')).toMatchObject({ pick: true, category: 'housing' })
    expect(c('월세 보증금')).toMatchObject({ pick: true, category: 'housing' })
    expect(c('자동차 할부잔액')).toMatchObject({ pick: true, category: 'debt' })
    expect(c('보장성보험료')).toMatchObject({ pick: true, category: 'insurance' })
    expect(c('은행예금')).toMatchObject({ pick: false, known: false })
    // 같은 "적금"이라도 현금흐름표(1년 납입)만 기본 선택, 재무상태표(잔액)는 아님
    expect(cs.filter(x => x.item.label === '적금').map(x => x.pick)).toEqual([true, false])
  })
})

describe('파일 이름 규칙: 남편이름_아내이름_재무설계.xlsx', () => {
  it('이름 두 개를 읽는다', () => {
    expect(namesFromFilename('에이피_에피케_재무설계.xlsx')).toEqual({ husband: '에이피', wife: '에피케' })
    expect(namesFromFilename('현우_지우_재무설계.XLSX')).toEqual({ husband: '현우', wife: '지우' })
  })
  it('모양이 다르면 null — 이름은 직접 입력', () => {
    expect(namesFromFilename('재무설계.xlsx')).toBeNull()
    expect(namesFromFilename('현우_지우.xlsx')).toBeNull()
    expect(namesFromFilename('현우__재무설계.xlsx')).toBeNull()
    expect(namesFromFilename('현우_지우_재무제표.xlsx')).toBeNull()
  })
})
