// 엑셀 라이브러리 없이 쓰는 작은 도우미 — 부부 목록 화면 번들에 엑셀 라이브러리가 딸려 오지 않게 따로 둔다

/** 올리는 엑셀 두 칸 (10.27): 재무제표(자산·부채) / 현금흐름표(1년 들어오고 나가는 돈). 한 파일에 둘 다 있어도 된다 */
export type SheetKind = 'statement' | 'cashflow'

export const KIND_LABEL: Record<SheetKind, string> = { statement: '재무제표', cashflow: '현금흐름표' }

/** 파일 이름 끝말 → 어느 칸 파일인가. 재무설계 = 두 표가 한 파일에 (처음 받은 양식) */
const SUFFIX: Record<string, SheetKind> = { 재무설계: 'statement', 재무제표: 'statement', 재무상태표: 'statement', 현금흐름표: 'cashflow' }

/**
 * 파일 이름 규칙: 남편이름_아내이름_재무제표.xlsx · 남편이름_아내이름_현금흐름표.xlsx
 * (두 표가 한 파일이면 남편이름_아내이름_재무설계.xlsx — 10.27 사용자 결정)
 * 맞지 않으면 null — 이름은 직접 입력받는다.
 */
export function namesFromFilename(name: string): { husband: string; wife: string; kind: SheetKind } | null {
  const base = name.replace(/\.(xlsx|xls)$/i, '').normalize('NFC').trim()
  const parts = base.split('_').map(s => s.trim())
  if (parts.length !== 3 || !(parts[2] in SUFFIX)) return null
  const [husband, wife] = parts
  if (!husband || !wife || husband.length > 20 || wife.length > 20) return null
  return { husband, wife, kind: SUFFIX[parts[2]] }
}
