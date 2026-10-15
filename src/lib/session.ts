/**
 * 부부 쪽 세션. sessionStorage 한 칸.
 * live=false 면 Supabase 없이 로컬 state 로 도는 1주차 데모 경로다 (env 없을 때, 스크린샷용).
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
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      const m = JSON.parse(raw)
      return { role: 'husband', code: '', live: false, names: DEMO_NAMES, ...m }
    }
  } catch { /* 무시 */ }
  return { role: 'husband', code: '', live: false, names: DEMO_NAMES }
}

export function saveMe(m: Me) {
  sessionStorage.setItem(KEY, JSON.stringify(m))
}

/** 내 이름 / 상대 이름 */
export const nameOf = (me: Me, role: Role) => me.names[role] ?? DEMO_NAMES[role]
export const partnerRole = (r: Role): Role => (r === 'husband' ? 'wife' : 'husband')
