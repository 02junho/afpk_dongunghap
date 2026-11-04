/**
 * 6주 사이클 (11.04 새 방향, docs/21). api/planner · api/cycle 이 같이 쓴다. 밑줄 파일 = 주소로 열리지 않는다.
 *
 *   n주차 = 사이클 시작한 날 + 7일 × (n-1). 그 주가 되면 그 주 테마 5문항이 열린다 (rounds.week = n).
 *   "때가 됐나"는 누군가 볼 때 확인한다 (tick) — 부부 홈 · 설계사 화면 · 하루 한 번 예약 실행(vercel.json crons).
 *   답하지 않은 주의 질문은 닫지 않는다 → 다음 주에도 남아 있고, 부부 홈에 먼저 보인다 ("다음 주로 넘긴다").
 *   열린 지 4일이 지났는데 다 답하지 않은 분에게 알림을 한 번 더 보낸다 ("한 번 더 알림").
 *   설계사가 상담 요청을 보내면 사이클이 닫히고, 주기(3 · 6개월)가 지나면 다음 사이클이 저절로 시작된다.
 */
import { SLOTS, WEEKS, PER_THEME, slotsOfWeek, themeOfWeek } from '../src/data/template'
import { notify } from './_notify'

type SB = any
const DAY = 86_400_000
export const REMIND_AFTER_DAYS = 4

export const CYCLE_PATCH = 'DB 에 사이클 표가 아직 없습니다 — supabase/patch-2026-11-04-cycles.sql 을 SQL Editor 에서 한 번 실행해 주세요'
export const noCycleTable = (m: string) => /cycles|cycle_id|reminded_at|week/.test(m) && /does not exist|schema cache|Could not find/.test(m)

export interface CycleRow { id: string; couple_id: string; started_at: string; period_months: number; consult_requested_at: string | null; closed_at: string | null }

export const weekOf = (startedAt: string, now = Date.now()) => Math.max(1, Math.min(WEEKS, Math.floor((now - new Date(startedAt).getTime()) / (7 * DAY)) + 1))
export const cycleEndsAt = (startedAt: string) => new Date(new Date(startedAt).getTime() + WEEKS * 7 * DAY).toISOString()
export function nextCycleAt(startedAt: string, months: number): string {
  const d = new Date(startedAt); d.setMonth(d.getMonth() + months); return d.toISOString()
}

export async function latestCycle(sb: SB, coupleId: string): Promise<CycleRow | null> {
  const { data, error } = await sb.from('cycles').select('*').eq('couple_id', coupleId).order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(noCycleTable(error.message) ? CYCLE_PATCH : error.message)
  return data
}

/** 틀 30칸의 지금 계획 버전 (key → card_versions.id) */
export async function activeVersions(sb: SB, coupleId: string): Promise<Map<string, string>> {
  const { data } = await sb.from('active_cards').select('id, key').eq('couple_id', coupleId).in('key', SLOTS.map(s => s.key))
  return new Map((data ?? []).map((c: any) => [c.key, c.id]))
}

/** 때가 된 주의 질문을 열고, 늦은 분에게 한 번 더 알린다. 여러 번 불려도 같은 결과 (주마다 라운드 하나 — unique index) */
export async function tickCouple(sb: SB, coupleId: string, reqUrl: string, now = Date.now()): Promise<{ cycle: CycleRow | null; week: number | null; opened: number }> {
  let cyc = await latestCycle(sb, coupleId)
  if (!cyc) return { cycle: null, week: null, opened: 0 }
  // 지난 사이클이 상담 요청으로 닫혔고 주기가 지났으면 다음 사이클을 연다
  if (cyc.closed_at && now >= new Date(nextCycleAt(cyc.started_at, cyc.period_months)).getTime()) {
    const { data: n } = await sb.from('cycles').insert({ couple_id: coupleId, started_at: new Date(now).toISOString(), period_months: cyc.period_months }).select('*').single()
    if (n) cyc = n
  }
  if (!cyc || cyc.closed_at) return { cycle: cyc, week: null, opened: 0 }

  const week = weekOf(cyc.started_at, now)
  const { data: rounds } = await sb.from('rounds').select('id, week, status, opened_at, reminded_at, card_version_ids').eq('cycle_id', cyc.id)
  const have = new Set((rounds ?? []).map((r: any) => r.week))
  const versions = await activeVersions(sb, coupleId)
  const { count: cycles } = await sb.from('cycles').select('id', { count: 'exact', head: true }).eq('couple_id', coupleId)
  let opened = 0, lastOpened = 0
  for (let w = 1; w <= week; w++) {
    if (have.has(w)) continue
    const ids = slotsOfWeek(w).map(s => versions.get(s.key)).filter(Boolean) as string[]
    if (ids.length !== PER_THEME) continue   // 틀이 덜 채워졌으면 열지 않는다 (설계사 화면이 먼저 막는다)
    const kind = w === 1 && (cycles ?? 1) <= 1 ? 'baseline' : 'regular'
    const { error } = await sb.from('rounds').insert({ couple_id: coupleId, kind, card_version_ids: ids, cycle_id: cyc.id, week: w })
    if (!error) { opened++; lastOpened = w }
  }
  if (opened) await notify(reqUrl, { coupleId }, { title: '돈궁합', body: `이번 주 질문 ${PER_THEME}개가 열렸어요 · ${themeOfWeek(lastOpened).label}`, url: '/c/home', tag: 'week' })

  // 한 번 더 알림: 열린 지 4일이 지났는데 다 답하지 않은 분에게만
  const late = (rounds ?? []).filter((r: any) => r.status === 'open' && !r.reminded_at && new Date(r.opened_at).getTime() <= now - REMIND_AFTER_DAYS * DAY)
  if (late.length) {
    const [{ data: members }, { data: answers }] = await Promise.all([
      sb.from('members').select('id').eq('couple_id', coupleId),
      sb.from('answers').select('round_id, member_id').in('round_id', late.map((r: any) => r.id)),
    ])
    for (const r of late) {
      const need = (r.card_version_ids as string[]).length
      const behind = (members ?? []).filter((m: any) => (answers ?? []).filter((a: any) => a.round_id === r.id && a.member_id === m.id).length < need).map((m: any) => m.id)
      if (behind.length) await notify(reqUrl, { memberIds: behind }, { title: '돈궁합', body: '아직 답하지 않은 질문이 남아 있어요. 몇 분이면 끝나요.', url: '/c/home', tag: 'remind' })
      await sb.from('rounds').update({ reminded_at: new Date(now).toISOString() }).eq('id', r.id)
    }
  }
  return { cycle: cyc, week, opened }
}
