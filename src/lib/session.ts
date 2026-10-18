/**
 * 부부 쪽 세션.
 * - live(실제 부부): localStorage — 앱을 닫았다 열어도 이 폰이 누구인지 기억한다.
 *   예전엔 sessionStorage 라 홈 화면 앱을 다시 열면 세션이 사라지고 데모 부부 화면이 떴다 (10.18 발견).
 *   Supabase 익명 로그인도 localStorage 에 남으므로 둘이 같이 유지된다.
 * - live=false(1주차 데모, env 없을 때·스크린샷): sessionStorage — 탭을 닫으면 처음부터.
 */
export type Role = 'husband' | 'wife'

export interface Me {
  role: Role
  code: string
  live: boolean
  coupleId?: string
  memberId?: string
  /** 화면에 쓰는 이름. live 면 members.display_name, 아니면 데모 이름 */
  names: Record<Role, string>
}

const KEY = 'me'
const DEMO_NAMES: Record<Role, string> = { husband: '현우', wife: '지우' }

export function loadMe(): Me {
  try {
    const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY)
    if (raw) {
      const m = JSON.parse(raw)
      return { role: 'husband', code: '', live: false, names: DEMO_NAMES, ...m }
    }
  } catch { /* 무시 */ }
  return { role: 'husband', code: '', live: false, names: DEMO_NAMES }
}

export function saveMe(m: Me) {
  try {
    const store = m.live ? localStorage : sessionStorage
    store.setItem(KEY, JSON.stringify(m))
    ;(m.live ? sessionStorage : localStorage).removeItem(KEY)
  } catch { /* 저장 불가(사파리 개인정보 보호 모드 등) — 이번 탭에서만 동작 */ }
}

/** "다시 입장하기" — 이 폰의 입장 정보를 지운다. 같은 코드로 다시 들어오면 서버가 이 기기로 다시 연결한다 */
export function clearMe() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY) } catch { /* 무시 */ }
}

/** 내 이름 / 상대 이름 */
export const nameOf = (me: Me, role: Role) => me.names[role] ?? DEMO_NAMES[role]
export const partnerRole = (r: Role): Role => (r === 'husband' ? 'wife' : 'husband')
