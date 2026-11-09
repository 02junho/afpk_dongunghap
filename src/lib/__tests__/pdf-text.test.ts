import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isPdf, pdfItemsToText, pdfToText, planFileToText } from '../pdf-text'
import { parsePlanOutput } from '../../extract/plan'
import { namesFromFilename } from '../../extract/names'

// 크로미움으로 만든 한글 PDF (2쪽 · 표 하나). scripts 없이 다시 만들려면 playwright page.pdf()
const SAMPLE = readFileSync(new URL('./fixtures/plan-sample.pdf', import.meta.url))
const buf = () => SAMPLE.buffer.slice(SAMPLE.byteOffset, SAMPLE.byteOffset + SAMPLE.byteLength) as ArrayBuffer

describe('재무설계 결과 PDF → 글 (11.05)', () => {
  it('PDF 인지 파일 앞부분으로 가른다 (확장자를 믿지 않는다)', () => {
    expect(isPdf(buf())).toBe(true)
    expect(isPdf(new TextEncoder().encode('PK\u0003\u0004 word/document.xml').buffer as ArrayBuffer)).toBe(false)
  })

  it('글 조각 → 줄: 줄 끝 표시와 세로 위치로 줄을 바꾸고 공백은 하나로', () => {
    expect(pdfItemsToText([
      { str: '내 집 마련 시점:', transform: [1, 0, 0, 1, 10, 700] },
      { str: '  2032년 6월', transform: [1, 0, 0, 1, 90, 700], hasEOL: true },
      { str: '월 저축액', transform: [1, 0, 0, 1, 10, 680] },
      { str: '월 250만원', transform: [1, 0, 0, 1, 10, 660] },
    ])).toBe('내 집 마련 시점: 2032년 6월\n월 저축액\n월 250만원')
  })

  it('한글 PDF 두 쪽을 모두 읽는다', async () => {
    const { text, truncated } = await pdfToText(buf())
    expect(truncated).toBe(false)
    const flat = text.replace(/\s+/g, '')
    for (const s of ['내집마련시점:2032년6월', '부모님지원금은1억원으로합니다.', '월250만원', '만60세', '비상금은1,200만원을늘남겨둡니다.']) expect(flat).toContain(s)
  })

  it('planFileToText 는 PDF 를 PDF 로 읽고, 원문 대조(근거 문장 확인)도 Word 와 똑같이 된다', async () => {
    const { text } = await planFileToText(buf())
    const out = parsePlanOutput(JSON.stringify([
      { key: 't1_buy_year', found: '2032년', quote: '내 집 마련 시점: 2032년 6월' },
      { key: 't1_home_price', found: '1억 원', quote: '부모님 지원금은 3억 원으로 합니다.' },
    ]), text)
    expect(out.find(f => f.key === 't1_buy_year')).toMatchObject({ value: '2032', quoteInDoc: true })
    expect(out.find(f => f.key === 't1_home_price')).toMatchObject({ quoteInDoc: false })
  })

  it('파일 이름 규칙은 .pdf 도 받는다', () => {
    expect(namesFromFilename('에이피_에피케_재무설계.pdf')).toEqual({ husband: '에이피', wife: '에피케' })
  })
})
