import { describe, expect, it } from 'vitest'
import { buildExtractPrompt, parseExtractOutput } from '../prompt'

const card = (o: Record<string, unknown>) => ({
  category: 'housing', type: 'text', unit: null, label: '다음 집', question: '다음 집은 어디로 생각하세요?',
  plannedValue: '의왕 전세', options: null, stake: '지역에 따라 대출 상품이 달라짐', source: '01. 상담 내용 D6', note: '', ...o,
})

describe('재무제표 엑셀 → 질문 카드 초안 (AI 활용 3번, 10.23 Q3)', () => {
  it('출처(시트·셀)가 없는 카드는 버린다', () => {
    const { drafts, dropped } = parseExtractOutput(JSON.stringify([card({ source: '' }), card({})]))
    expect(drafts).toHaveLength(1)
    expect(dropped).toBe(1)
  })

  it('금액은 엑셀 표기 그대로 받고 앱이 원 단위로 바꾼다 ("6,700만원" → 67000000)', () => {
    const { drafts } = parseExtractOutput(JSON.stringify([card({ type: 'number', unit: 'krw', label: '남편 연소득', plannedValue: '6,700만원' })]))
    expect(drafts[0].card?.plannedValue).toBe('67000000')
  })

  it('값이 비었으면(상대 시점·서로 다른 값) 저장 못 하고 설계사가 채운다', () => {
    const { drafts } = parseExtractOutput(JSON.stringify([card({ type: 'date', plannedValue: '', note: '엑셀 원문: 6~7년 이내' })]))
    expect(drafts[0].card).toBeUndefined()
    expect(drafts[0].problem).toContain('비어')
    expect(drafts[0].note).toContain('6~7년')
  })

  it('형식이 틀린 카드도 버리지 않고 이유를 붙인다 (선택지 밖의 전제)', () => {
    const { drafts } = parseExtractOutput(JSON.stringify([card({ type: 'choice', options: ['남편', '아내'], plannedValue: '둘 다' })]))
    expect(drafts[0].card).toBeUndefined()
    expect(drafts[0].problem).toContain('선택지')
  })

  it('형태 표기가 조금 달라도 맞춘다 ("age" → 나이 카드)', () => {
    const { drafts } = parseExtractOutput(JSON.stringify([card({ category: 'retire', type: 'age', unit: null, label: '남편 은퇴 나이', plannedValue: '60' })]))
    expect(drafts[0].card).toMatchObject({ type: 'number', unit: 'age', plannedValue: '60' })
  })

  it('JSON 앞뒤에 다른 말이 붙어도 배열만 읽는다', () => {
    const { drafts } = parseExtractOutput('아래와 같습니다.\n' + JSON.stringify([card({})]) + '\n끝')
    expect(drafts[0].card?.label).toBe('다음 집')
  })

  it('프롬프트에 "계산하지 않는다"·"출처"·"추측하지 않는다"가 들어 있다', () => {
    const p = buildExtractPrompt('[01. 상담 내용 D6] 의왕 전세 3억')
    expect(p).toContain('계산')
    expect(p).toContain('source')
    expect(p).toContain('추측하지 않습니다')
    expect(p).toContain('[01. 상담 내용 D6] 의왕 전세 3억')
  })
})
