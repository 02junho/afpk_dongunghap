/**
 * 설계사 콘솔의 1주차 데모 상태. 2주차에 Supabase 로 교체한다.
 * 여기 모양을 스키마와 맞춰 둔다 (couples / card_versions / planner_queue).
 */
export interface DemoCouple {
  id: string
  label: string
  inviteCode: string
  cardCount: number
  openRed: number
}

const KEY = 'planner:couples'
const SELECTED = 'planner:selected'

const DEFAULTS: DemoCouple[] = [
  { id: 'c1', label: '김현우·박지우', inviteCode: '482913', cardCount: 10, openRed: 2 },
]

export function listCouples(): DemoCouple[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DemoCouple[]) : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function addCouple(label: string): DemoCouple {
  const c: DemoCouple = { id: `c${Date.now()}`, label, inviteCode: newInviteCode(), cardCount: 0, openRed: 0 }
  const all = [...listCouples(), c]
  sessionStorage.setItem(KEY, JSON.stringify(all))
  return c
}

/** 6자리 숫자 코드. 실제로는 couples.invite_code unique 제약이 최종 판정자다. */
export function newInviteCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000 + 100_000
  return String(n)
}

export function selectCouple(id: string) {
  sessionStorage.setItem(SELECTED, id)
}

export function selectedCouple(): DemoCouple {
  const id = sessionStorage.getItem(SELECTED)
  const all = listCouples()
  return all.find(c => c.id === id) ?? all[0]
}
