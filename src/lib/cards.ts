import type { Card } from '../judge/index'

/**
 * DB 행(card_versions + cards) → Card. 순수 함수 — 브라우저와 edge 양쪽에서 쓴다.
 * (supabase 클라이언트를 import 하는 db.ts 와 분리해 둔다: edge 런타임엔 import.meta.env 가 없다)
 */
export function rowToCard(cv: any, c: any): Card {
  return {
    key: c.key,
    type: c.type,
    category: c.category,
    unit: c.unit ?? undefined,
    label: cv.label,
    question: cv.question,
    plannedValue: c.type === 'number' ? Number(cv.planned_value) : cv.planned_value,
    tolerance: cv.tolerance == null ? undefined : Number(cv.tolerance),
    options: cv.options ?? undefined,
    stake: cv.stake,
    allowCondition: !!cv.allow_condition,
  }
}
