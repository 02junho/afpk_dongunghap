import type { Card } from '../judge/index'
import { NON_VALUE, slotByKey } from '../data/template'

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
    // "해당 없음" · "아직 모름"은 숫자로 바꾸지 않는다 (11.05)
    plannedValue: c.type === 'number' && !NON_VALUE.includes(String(cv.planned_value)) ? Number(cv.planned_value) : cv.planned_value,
    tolerance: cv.tolerance == null ? undefined : Number(cv.tolerance),
    // 질문 틀 칸이면 틀의 보기를 쓴다 — 보기 · 값이 아닌 답 후보("아직 모름")를 늘려도 예전 버전 카드가 같이 따라온다 (11.05)
    options: slotByKey(c.key)?.options ?? cv.options ?? undefined,
    stake: cv.stake,
    allowCondition: !!cv.allow_condition,
  }
}
