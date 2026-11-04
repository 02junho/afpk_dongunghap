/**
 * 폰 알림 켜기 (Web Push, 11.04). 서버는 api/push.ts.
 *  · 안드로이드 크롬 · 컴퓨터 크롬/엣지: 브라우저에서 바로 된다
 *  · 아이폰: 홈 화면에 추가한 아이콘으로 열었을 때만 된다 (iOS 16.4+). 사파리 탭에서는 PushManager 가 없다
 *  · 카톡 안 브라우저: 안 된다
 * 허락 창은 버튼을 누른 그 자리에서만 뜬다 — 화면을 열 때 자동으로 묻지 않는다.
 */
const FLAG = (kind: 'member' | 'planner') => `dongunghap.push.${kind}`

export function canPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** 이미 켰나 — 이 기기 브라우저에 구독이 있고, 이 역할(부부/설계사)로 등록한 적이 있으면 */
export async function pushOn(kind: 'member' | 'planner'): Promise<boolean> {
  if (!canPush() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return !!sub && localStorage.getItem(FLAG(kind)) === sub.endpoint
  } catch { return false }
}

export const pushBlocked = () => canPush() && Notification.permission === 'denied'

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function post(body: object) {
  const r = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `알림 서버 오류 (${r.status})`)
  return j
}

/** 버튼을 누른 자리에서 부른다. auth = 부부는 { accessToken }, 설계사는 { passcode } */
export async function turnOnPush(kind: 'member' | 'planner', auth: { accessToken?: string; passcode?: string }): Promise<void> {
  if (!canPush()) throw new Error('이 브라우저에서는 알림을 받을 수 없어요')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('알림이 허용되지 않았어요. 폰 설정에서 돈궁합 알림을 켜 주세요')
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('앱을 한 번 새로고침한 뒤 다시 눌러 주세요')
  const { publicKey } = await post({ action: 'key' })
  if (!publicKey) throw new Error('알림 설정이 아직 준비되지 않았어요')
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource })
  await post(kind === 'member'
    ? { action: 'subscribe_member', accessToken: auth.accessToken, subscription: sub.toJSON() }
    : { action: 'subscribe_planner', passcode: auth.passcode, subscription: sub.toJSON() })
  try { localStorage.setItem(FLAG(kind), sub.endpoint) } catch { /* 표시만 못 한다 */ }
}

/** 부부가 "바뀐 게 있어요"를 보낸 직후 — 설계사에게 알림을 부탁한다. 실패해도 조용히 */
export function pingPlannerNotice(accessToken: string, noticeId: string) {
  void post({ action: 'notice', accessToken, noticeId }).catch(() => {})
}
