/**
 * edge 함수(planner · judge)에서 폰 알림을 부탁하는 작은 도우미 (11.04).
 * 알림을 실제로 보내는 건 Node 함수 api/push.ts 다 — edge 에서는 web-push 를 못 쓴다.
 * 밑줄로 시작하는 파일이라 Vercel 이 주소(/api/_notify)로 열지 않는다.
 *
 * 실패해도 본래 일(질문 보내기 · 판정)은 그대로 끝나야 한다 → 오류를 삼키고, 3초 넘게 기다리지 않는다.
 */
export interface PushMsg { title: string; body: string; url: string; tag?: string }

export async function notify(reqUrl: string, to: { coupleId?: string; memberIds?: string[]; planner?: boolean }, msg: PushMsg): Promise<void> {
  const secret = process.env.PUSH_SECRET
  if (!secret || !process.env.VAPID_PUBLIC_KEY) return
  let origin: string
  try { origin = process.env.PUSH_BASE_URL || new URL(reqUrl).origin } catch { return }
  if (!/^https?:\/\/[^/]+$/.test(origin) || origin === 'http://x' || origin === 'http://local') return   // 스크립트에서 핸들러를 직접 부른 경우
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${origin}/api/push`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-push-secret': secret },
      body: JSON.stringify({ action: 'send', ...to, msg }),
    })
  } catch { /* 알림은 덤이다 */ }
  finally { clearTimeout(t) }
}
