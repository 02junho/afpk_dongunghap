// 엑셀 라이브러리 없이 쓰는 작은 도우미 — 부부 목록 화면 번들에 엑셀 라이브러리가 딸려 오지 않게 따로 둔다

/**
 * 파일 이름 규칙: 남편이름_아내이름_재무설계.xlsx (10.27 사용자 결정).
 * 맞지 않으면 null — 이름은 직접 입력받는다.
 */
export function namesFromFilename(name: string): { husband: string; wife: string } | null {
  const base = name.replace(/\.(xlsx|xls)$/i, '').normalize('NFC').trim()
  const parts = base.split('_').map(s => s.trim())
  if (parts.length !== 3 || parts[2] !== '재무설계') return null
  const [husband, wife] = parts
  if (!husband || !wife || husband.length > 20 || wife.length > 20) return null
  return { husband, wife }
}
