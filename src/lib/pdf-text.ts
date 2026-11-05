/**
 * PDF → 글 (11.05). 재무설계 결과가 Word 일지 PDF 일지 아직 정해지지 않아 둘 다 받는다.
 * 글자 꺼내기는 pdfjs-dist(Mozilla, 6.4.299 고정 · legacy 빌드)가 한다 — 브라우저에서만 돌고, 파일은 어디에도 저장하지 않는다.
 * 글만 서버로 간다 (AI 가 계획 값을 찾을 때). docx-text 와 같은 모양 { text, truncated } 을 돌려준다.
 *
 * 줄 만들기: pdfjs 가 주는 글 조각(item)을 순서대로 잇고, 조각에 줄 끝(hasEOL) 표시가 있거나
 * 세로 위치가 바뀌면 줄을 바꾼다. 원문 대조(src/extract/plan.ts)는 띄어쓰기를 무시하므로 칸 사이 공백은 하나로만.
 * 스캔한 PDF(그림)는 글자가 없다 → 빈 글 → 화면에서 "글을 읽지 못했습니다".
 */
import { MAX_DOC_TEXT } from './docx-text'

export interface PdfTextItem { str: string; hasEOL?: boolean; transform?: number[] }

/** 한 쪽의 글 조각 → 줄 글. 테스트하려고 따로 뺐다 */
export function pdfItemsToText(items: PdfTextItem[]): string {
  const lines: string[] = []
  let cur = ''
  let y: number | null = null
  for (const it of items) {
    const iy = it.transform?.[5] ?? null
    // 같은 줄인데 세로 위치가 크게 바뀌면(다음 줄) 줄을 바꾼다
    if (cur && y !== null && iy !== null && Math.abs(iy - y) > 2) { lines.push(cur); cur = '' }
    cur += it.str
    if (iy !== null && it.str) y = iy
    if (it.hasEOL) { lines.push(cur); cur = ''; y = null }
  }
  if (cur) lines.push(cur)
  return lines.map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n')
}

export const isPdf = (buf: ArrayBuffer) => {
  const h = new Uint8Array(buf.slice(0, 1024))
  // "%PDF-" 가 앞쪽 1KB 안에 있으면 PDF (앞에 쓰레기 바이트가 붙은 파일도 있다)
  for (let i = 0; i + 4 < h.length; i++) if (h[i] === 0x25 && h[i + 1] === 0x50 && h[i + 2] === 0x44 && h[i + 3] === 0x46 && h[i + 4] === 0x2d) return true
  return false
}

export async function pdfToText(buf: ArrayBuffer): Promise<{ text: string; truncated: boolean }> {
  const inBrowser = typeof window !== 'undefined'
  // legacy 빌드: 예전 사파리(아이패드) · Node 에도 없는 최신 기능(Uint8Array.toHex 등)을 채워 넣은 빌드
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (inBrowser && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: src } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = src
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf.slice(0)),
    // 한글 글꼴 표(CMap). 브라우저는 public/pdfjs-cmaps (한국어 것만 복사), 테스트(Node)는 패키지 폴더
    cMapUrl: inBrowser ? '/pdfjs-cmaps/' : new URL('../../node_modules/pdfjs-dist/cmaps/', import.meta.url).pathname,
    cMapPacked: true,
    disableFontFace: true,
    useSystemFonts: false,
  })
  try {
    const doc = await task.promise
    const pages: string[] = []
    let len = 0
    for (let i = 1; i <= doc.numPages && len <= MAX_DOC_TEXT; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const t = pdfItemsToText(tc.items.flatMap(x => 'str' in x ? [{ str: x.str, hasEOL: x.hasEOL, transform: x.transform }] : []))
      pages.push(t); len += t.length + 1
    }
    const text = pages.filter(Boolean).join('\n')
    return { text: text.slice(0, MAX_DOC_TEXT), truncated: text.length > MAX_DOC_TEXT }
  } finally {
    await task.destroy()
  }
}

/** 재무설계 결과 파일(Word · PDF) → 글. 확장자가 아니라 파일 앞부분으로 가른다 */
export async function planFileToText(buf: ArrayBuffer): Promise<{ text: string; truncated: boolean }> {
  if (isPdf(buf)) return pdfToText(buf)
  const { docxToText } = await import('./docx-text')
  return docxToText(buf)
}
