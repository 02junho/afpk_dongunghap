/**
 * 재무설계 결과 Word 파일 이름 → 두 분 이름 (11.04). 라이브러리 없이 — 부부 목록 화면에서 쓴다.
 * 규칙: 남편이름_아내이름_재무설계.docx (재무설계결과 · 재무설계안도 받는다). 맞지 않으면 null — 이름은 직접 입력.
 */
const SUFFIX = new Set(['재무설계', '재무설계결과', '재무설계안'])

export function namesFromFilename(name: string): { husband: string; wife: string } | null {
  const base = name.replace(/\.docx$/i, '').normalize('NFC').trim()
  const parts = base.split('_').map(s => s.trim())
  if (parts.length !== 3 || !SUFFIX.has(parts[2])) return null
  const [husband, wife] = parts
  if (!husband || !wife || husband.length > 20 || wife.length > 20) return null
  return { husband, wife }
}
