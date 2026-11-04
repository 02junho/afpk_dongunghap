/**
 * Word(.docx) → 글 (11.04). 라이브러리 없이 브라우저 · Node 18+ 에서 돈다.
 * .docx 는 zip 이고 본문은 word/document.xml 이다. 압축은 deflate → DecompressionStream('deflate-raw').
 * 문단은 줄바꿈, 표 칸은 " | " 로 이어 붙인다 — AI 와 설계사가 "원문"으로 읽는 글이다.
 * 파일은 어디에도 저장하지 않는다. 글만 서버로 간다 (AI 가 계획 값을 찾을 때).
 */
export const MAX_DOC_TEXT = 60_000

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds))
  return new Uint8Array(await out.arrayBuffer())
}

/** zip 안의 파일 하나를 꺼낸다 (중앙 디렉터리 기준) */
export async function unzipEntry(buf: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf)
  // 끝에서 중앙 디렉터리 끝 표시(EOCD, 0x06054b50)를 찾는다
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Word 파일(.docx)이 아닙니다')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true)
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const fname = dec.decode(u8.subarray(p + 46, p + 46 + nlen))
    if (fname === name) {
      const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true)
      const start = local + 30 + lnlen + lxlen
      const raw = u8.subarray(start, start + csize)
      if (method === 0) return raw
      if (method === 8) return inflateRaw(raw)
      throw new Error('이 Word 파일의 압축 방식을 읽지 못했습니다')
    }
    p += 46 + nlen + xlen + clen
  }
  return null
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** document.xml → 글. 문단 = 줄, 표 = 칸 " | " · 줄 바꿈 */
export function documentXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .split('\n').map(l => l.replace(/\s*\|\s*$/, '').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
}

export async function docxToText(buf: ArrayBuffer): Promise<{ text: string; truncated: boolean }> {
  const xml = await unzipEntry(buf, 'word/document.xml')
  if (!xml) throw new Error('Word 본문(word/document.xml)을 찾지 못했습니다')
  const text = documentXmlToText(new TextDecoder().decode(xml))
  return { text: text.slice(0, MAX_DOC_TEXT), truncated: text.length > MAX_DOC_TEXT }
}
