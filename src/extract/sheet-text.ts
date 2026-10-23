import { read, utils } from 'xlsx'

/**
 * 재무제표 엑셀 → AI 가 읽을 글 (10.23 팀 결정 Q3). 브라우저에서만 돈다 — 엑셀 파일 자체는 서버로 가지 않는다.
 * 줄마다 [시트명 셀] 을 붙여, AI 가 카드마다 출처를 댈 수 있게 한다 (출처 없는 카드는 버린다).
 *
 * 예: [01. 상담 내용 D6] 현재 안양에서 월세(보증금 3,000만 원, 월 70만 원)로 지내는 두 분은 …
 */
export const MAX_SHEET_TEXT = 60_000

export interface SheetText { text: string; sheets: string[]; cells: number; truncated: boolean }

export function workbookToText(data: ArrayBuffer): SheetText {
  const wb = read(data, { type: 'array', cellFormula: false, cellHTML: false })
  const lines: string[] = []
  let cells = 0
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws['!ref']) continue
    const range = utils.decode_range(ws['!ref'])
    lines.push(`## ${name}`)
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = utils.encode_cell({ r, c })
        const cell = ws[addr]
        if (!cell || cell.v == null) continue
        const v = String(cell.w ?? cell.v).replace(/\s+/g, ' ').trim()
        if (!v) continue
        lines.push(`[${name} ${addr}] ${v}`)
        cells++
      }
    }
  }
  let text = lines.join('\n')
  const truncated = text.length > MAX_SHEET_TEXT
  if (truncated) text = text.slice(0, MAX_SHEET_TEXT)
  return { text, sheets: wb.SheetNames, cells, truncated }
}
