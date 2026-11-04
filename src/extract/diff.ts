/**
 * 엑셀 다시 읽기 (11.04) — 올린 엑셀의 항목을 이미 있는 질문 카드와 맞춰 본다.
 * 같은 엑셀을 다시 올리면 카드가 두 벌 생기던 문제(10.27)를 없애고, 고친 숫자만 골라 반영하게 한다.
 *
 *   · 엑셀로 만든 카드는 key 에 엑셀 자리(표 · 항목 이름)를 담는다 → 다시 읽으면 key 로 찾는다
 *   · 그 전에 만든 카드(key 가 p_… 무작위)는 카드 이름이 같고, 그 이름이 하나뿐일 때만 같은 카드로 본다
 *   · 금액이 같으면 "그대로", 다르면 "바뀜". 바뀐 것도 설계사가 확인해야 반영된다 (새 버전, 덮어쓰지 않음)
 *
 * 계산하지 않는다. 엑셀 칸 값과 카드에 저장된 값을 그대로 비교할 뿐이다.
 */

export interface ExistingCard {
  cardId: string
  key: string
  label: string
  type: string
  plannedValue: number | string
  /** 지금 열린 맞춰보기가 이 카드를 묻는 중 — 끝나기 전에는 값을 바꾸지 않는다 */
  inOpenRound?: boolean
}

export type MatchStatus = 'new' | 'same' | 'changed'

export interface Matched {
  status: MatchStatus
  existing?: ExistingCard
}

/** 엑셀 한 줄 (statement.ts 의 StatementItem 중 비교에 쓰는 것) + 규칙이 붙인 카드 이름 */
export interface SheetRow {
  item: { table: string; label: string; value: number }
  label: string
}

/** 엑셀 자리로 만든 카드 key. 같은 표의 같은 항목 이름이면 같은 key */
export function sheetKey(c: Pick<SheetRow, 'item'>): string {
  return `xl:${c.item.table}|${c.item.label}`.slice(0, 120)
}

export function matchCandidates(cands: SheetRow[], existing: ExistingCard[]): Matched[] {
  const byKey = new Map(existing.map(e => [e.key, e]))
  const labelCount = new Map<string, number>()
  for (const e of existing) labelCount.set(e.label, (labelCount.get(e.label) ?? 0) + 1)
  const used = new Set<string>()

  return cands.map(c => {
    let e = byKey.get(sheetKey(c))
    if (!e && labelCount.get(c.label) === 1) {
      const byLabel = existing.find(x => x.label === c.label && x.type === 'number' && !x.key.startsWith('xl:'))
      if (byLabel && !used.has(byLabel.cardId)) e = byLabel
    }
    if (!e || used.has(e.cardId)) return { status: 'new' }
    used.add(e.cardId)
    return { status: Number(e.plannedValue) === c.item.value ? 'same' : 'changed', existing: e }
  })
}
