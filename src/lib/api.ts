import type { Card, Judgment, Verdict } from '../judge/index'
import { judge } from '../judge/index'

/**
 * 서버(/api/*) 호출. 키는 전부 서버에 있다.
 *
 * live(2주차): 판정은 서버가 라운드 단위로 한다 (triggerJudge). 브라우저는 판정 결과를 받지 않는다.
 * 데모(1주차): 한 기기에서 카드 1장씩 판정한다 (requestJudgment). ALLOW_DEMO_JUDGE=1 일 때만.
 */

/** 라운드 판정을 서버에 요청한다. 양쪽이 다 답하지 않았으면 서버가 pending 으로 돌려준다. 멱등. */
export async function triggerJudge(roundId: string): Promise<{ ok: boolean; judged?: number; pending?: boolean; already?: boolean; error?: string }> {
  const res = await fetch('/api/judge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` }
  return { ok: true, ...data }
}

/** 1주차 데모 경로. text 카드는 서버, 나머지는 브라우저. */
export async function requestJudgment(card: Card, a: string, b: string, previousVerdict?: Verdict): Promise<Judgment> {
  if (card.type !== 'text') return judge(card, a, b, undefined, { previousVerdict })
  const res = await fetch('/api/judge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ card, a, b, previousVerdict }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return {
      verdict: 'yellow', aVsPlan: 'unparsed', bVsPlan: 'unparsed', abAgree: false,
      reason: `판정 서버 응답 ${res.status}${detail ? ` · ${detail.slice(0, 80)}` : ''}`,
      method: 'llm', needsReview: true,
    }
  }
  return res.json()
}

/** 🔴·확인 필요 건의 설계사용 3줄 요약. 꺼져 있으면 null. */
export async function requestSummary(card: Card, a: string, b: string, judgment: Judgment): Promise<string | null> {
  const res = await fetch('/api/judge', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'summary', card, a, b, judgment }),
  })
  if (!res.ok) return null
  const { summary } = (await res.json()) as { summary?: string }
  return summary ?? null
}

/**
 * 설계사 콘솔 API. passcode 는 localStorage — 설계사 노트북에서 탭을 새로 열어도 다시 묻지 않는다.
 * (sessionStorage 는 탭마다 따로라 "새 탭 = 코드 재입력"이 됐다.) 레일의 "코드 잠그기"로 지운다.
 */
export const PLANNER_PASS_KEY = 'planner:passcode'

export async function plannerApi<T = any>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const passcode = localStorage.getItem(PLANNER_PASS_KEY) ?? ''
  const res = await fetch('/api/planner', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode, action, ...params }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}
