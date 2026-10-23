/**
 * 정기 맞춰보기 주기 (10.23 팀 결정 Q10·Q11).
 * 예전엔 "11월 둘째 주쯤"이 고정 문구였다. 이제 마지막 맞춰보기 날짜 + 주기로 다음 날짜를 계산해 보여준다.
 * 주기는 우선 모든 부부 3개월. 부부마다 바꾸려면 couples 에 칸을 하나 두면 된다 (공모전 후).
 * 다음 맞춰보기를 실제로 여는 건 설계사다 — 앱이 자동으로 열지는 않는다.
 */
export const CHECK_MONTHS = 3

/** 기준 날짜에서 n개월 뒤. 31일 → 짧은 달이면 그 달 말일로 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(from.getDate(), last))
  return d
}

/** 다음 맞춰보기 예정일. 기준이 없으면(한 번도 안 했으면) null */
export function nextCheckDate(lastIso: string | null | undefined, months = CHECK_MONTHS): Date | null {
  if (!lastIso) return null
  const t = new Date(lastIso)
  return Number.isNaN(t.getTime()) ? null : addMonths(t, months)
}

/** "1월 23일" — 해가 바뀌면 "2027년 1월 23일" */
export function formatKDate(d: Date, now = new Date()): string {
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}년 ${md}`
}
