import type { Card, Judgment } from '../judge/index'
import { judge } from '../judge/index'

/** text 카드는 서버(/api/judge)로, 나머지는 브라우저에서 바로. 키가 브라우저에 가지 않는다. */
export async function requestJudgment(card: Card, a: string, b: string): Promise<Judgment> {
  if (card.type !== 'text') return judge(card, a, b)
  const res = await fetch('/api/judge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card, a, b }) })
  return res.json()
}
