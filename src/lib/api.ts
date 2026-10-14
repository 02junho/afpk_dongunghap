import type { Card, Judgment, Verdict } from '../judge/index'
import { judge } from '../judge/index'

/**
 * text 카드는 서버(/api/judge)로, 나머지는 브라우저에서 바로. 키가 브라우저에 가지 않는다.
 *
 * ⚠ 2주차에 **판정 전체를 서버로 옮긴다.** 지금은 브라우저가 두 답변을 모두 쥐고 있어야
 * 결정적 비교를 할 수 있는데, 그러면 '상대 답변은 둘 다 제출한 뒤에만 보인다'를
 * DB로 보장할 수 없다 (supabase/rls.sql 머리말). 서버 판정으로 바꾸면 부부에게는
 * answers select 를 아예 닫고 judgments 만 열 수 있다.
 */
export async function requestJudgment(
  card: Card,
  a: string,
  b: string,
  previousVerdict?: Verdict,
): Promise<Judgment> {
  if (card.type !== 'text') return judge(card, a, b, undefined, { previousVerdict })
  const res = await fetch('/api/judge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ card, a, b, previousVerdict }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // 서버 설정 실패를 🟢으로 둔갑시키지 않는다. 사람이 봐야 한다.
    return {
      verdict: 'yellow',
      aVsPlan: 'unparsed',
      bVsPlan: 'unparsed',
      abAgree: false,
      reason: `판정 서버 응답 ${res.status}${detail ? ` · ${detail.slice(0, 80)}` : ''}`,
      method: 'llm',
      needsReview: true,
    }
  }
  return res.json()
}

/** 🔴·확인 필요 건의 설계사용 3줄 요약. 꺼져 있으면 null. */
export async function requestSummary(card: Card, a: string, b: string, judgment: Judgment): Promise<string | null> {
  const res = await fetch('/api/judge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'summary', card, a, b, judgment }),
  })
  if (!res.ok) return null
  const { summary } = (await res.json()) as { summary?: string }
  return summary ?? null
}
