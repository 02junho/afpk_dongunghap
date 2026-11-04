/**
 * 부부 화면이 쓰는 Supabase 접근. 전부 RLS 아래에서 돈다 (publishable 키 + 익명 로그인).
 * 부부는 answers 를 자기 것만 쓰고, judgments 는 아예 읽지 못한다 (rls.sql).
 * supabase 가 null(env 없음)이면 호출하지 않는다 — 화면은 live 플래그로 분기한다.
 */
import { supabase } from './supabase'
import type { Card } from '../judge/index'
import type { Role } from './session'
import { rowToCard } from './cards'

export const isLive = () => supabase !== null

function sb() {
  if (!supabase) throw new Error('Supabase env 가 없습니다')
  return supabase
}

/** 익명 로그인 → join_couple RPC. 같은 기기에서 역할을 바꾸면 이전 역할의 연결은 풀린다 (RPC 가 처리). */
export async function joinCouple(code: string, role: Role) {
  const s = sb()
  const { data: sess } = await s.auth.getSession()
  if (!sess.session) {
    const { error } = await s.auth.signInAnonymously()
    if (error) throw new Error(`연결하지 못했어요. 잠시 뒤 다시 해 주세요 (${error.message})`)
  }
  let { data: coupleId, error } = await s.rpc('join_couple', { code, want_role: role })
  // 이 기기(uid)가 이미 다른 역할/커플에 묶여 있으면 — 새 익명 uid 로 갈아타고 한 번 더.
  // (DB 의 join_couple 이 재연결 패치 전이어도 같은 폰으로 여러 커플을 시연할 수 있게)
  if (error && /members_auth_user_id_key|이미 다른 기기/.test(error.message)) {
    await s.auth.signOut()
    const { error: e } = await s.auth.signInAnonymously()
    if (e) throw new Error(`연결하지 못했어요. 잠시 뒤 다시 해 주세요 (${e.message})`)
    ;({ data: coupleId, error } = await s.rpc('join_couple', { code, want_role: role }))
  }
  if (error) throw new Error(error.message)
  const { data: members, error: e2 } = await s.from('members').select('id, role, display_name').eq('couple_id', coupleId)
  if (e2) throw new Error(e2.message)
  const mine = members?.find(m => m.role === role)
  if (!mine) throw new Error('남편 · 아내 정보를 찾지 못했어요. 다시 입장해 주세요')
  const names = { husband: '남편', wife: '아내' } as Record<Role, string>
  for (const m of members ?? []) if (m.display_name) names[m.role as Role] = m.display_name
  return { coupleId: coupleId as string, memberId: mine.id as string, names }
}

export { rowToCard } from './cards'

export interface OpenRound {
  id: string
  kind: string
  /** 6주 사이클의 몇 주차 (11.04). 예전 라운드는 null */
  week: number | null
  /** 라운드가 묻는 순서대로 */
  cards: { versionId: string; card: Card }[]
}

/** 라운드의 카드들을 묻는 순서대로 */
async function roundCards(ids: string[]): Promise<{ versionId: string; card: Card }[]> {
  const { data: cvs, error } = await sb().from('card_versions').select('*, cards!inner(key, type, category, unit)').in('id', ids)
  if (error) throw new Error(error.message)
  const byId = new Map((cvs ?? []).map(cv => [cv.id, cv]))
  return ids.filter(id => byId.has(id)).map(id => { const cv = byId.get(id)!; return { versionId: id, card: rowToCard(cv, cv.cards) } })
}

/** 열린 라운드들 — 오래된 것부터 (지난주에 못 다 한 질문이 먼저, 11.04) */
async function openRoundRows(coupleId: string) {
  const { data, error } = await sb().from('rounds').select('id, kind, week, card_version_ids')
    .eq('couple_id', coupleId).eq('status', 'open').order('opened_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** 내 커플의 열린 라운드 하나 — 가장 오래된 것 (없으면 null) */
export async function loadOpenRound(coupleId: string): Promise<OpenRound | null> {
  const r = (await openRoundRows(coupleId))[0]
  if (!r) return null
  return { id: r.id, kind: r.kind, week: r.week ?? null, cards: await roundCards(r.card_version_ids) }
}

/**
 * 내가 아직 답할 게 남은 라운드 (오래된 것부터). 다 답했으면 round = null 이고,
 * 배우자를 기다리는 라운드가 있으면 waitingId. openCount = 열린 라운드 수 (2 이상이면 지난주 질문이 남아 있다)
 */
export async function loadMyNextRound(coupleId: string, memberId: string): Promise<{ round: OpenRound | null; waitingId: string | null; openCount: number }> {
  const rows = await openRoundRows(coupleId)
  for (const r of rows) {
    const done = await myAnswered(r.id, memberId)
    if ((r.card_version_ids as string[]).some(id => !done.has(id)))
      return { round: { id: r.id, kind: r.kind, week: r.week ?? null, cards: await roundCards(r.card_version_ids) }, waitingId: null, openCount: rows.length }
  }
  return { round: null, waitingId: rows[0]?.id ?? null, openCount: rows.length }
}

/** 이번 주 질문이 열릴 때가 됐나 서버에 확인 (6주 사이클, api/cycle). 실패해도 화면은 그대로 */
export async function tickCycle(): Promise<void> {
  const token = await myAccessToken()
  if (!token) return
  await fetch('/api/cycle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: token }) }).catch(() => {})
}

/** 라운드 하나의 종류·문항 수 (판정이 끝난 라운드도). 대기·전달 화면 문구용 */
export async function loadRoundInfo(roundId: string): Promise<{ kind: string; count: number; status: string; week: number | null } | null> {
  const { data, error } = await sb().from('rounds').select('kind, status, week, card_version_ids').eq('id', roundId).maybeSingle()
  if (error || !data) return null
  return { kind: data.kind, status: data.status, week: data.week ?? null, count: (data.card_version_ids as string[]).length }
}

/** 내가 이 라운드에 이미 답한 카드 버전 id 들 (이어서 답하기) */
export async function myAnswered(roundId: string, memberId: string): Promise<Set<string>> {
  const { data, error } = await sb().from('answers').select('card_version_id').eq('round_id', roundId).eq('member_id', memberId)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map(a => a.card_version_id))
}

export async function submitAnswer(roundId: string, versionId: string, memberId: string, text: string, isCondition: boolean) {
  const { error } = await sb().from('answers').insert({ round_id: roundId, card_version_id: versionId, member_id: memberId, text, is_condition: isCondition })
  if (error) throw new Error(error.message)
}

/** 역할별 답한 문항 수. 내용은 오지 않는다 (round_progress RPC). */
export async function roundProgress(roundId: string): Promise<Record<Role, number>> {
  const { data, error } = await sb().rpc('round_progress', { rid: roundId })
  if (error) throw new Error(error.message)
  const out: Record<Role, number> = { husband: 0, wife: 0 }
  for (const row of data ?? []) out[row.role as Role] = row.answered
  return out
}

/** 마지막으로 판정까지 끝난 맞춰보기 시각 — 다음 맞춰보기 날짜 계산용 (lib/cycle.ts). 없으면 null */
export async function loadLastCheckAt(coupleId: string): Promise<string | null> {
  const { data, error } = await sb().from('rounds').select('judged_at')
    .eq('couple_id', coupleId).eq('status', 'judged').not('judged_at', 'is', null)
    .order('judged_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0]?.judged_at ?? null
}

/** 두 분 이름 (설계사가 '이름 고치기'로 바꿀 수 있다). 홈을 열 때마다 다시 읽는다 */
export async function loadNames(coupleId: string): Promise<Partial<Record<Role, string>>> {
  const { data, error } = await sb().from('members').select('role, display_name').eq('couple_id', coupleId)
  if (error) throw new Error(error.message)
  const out: Partial<Record<Role, string>> = {}
  for (const m of data ?? []) if (m.display_name) out[m.role as Role] = m.display_name
  return out
}

/** [내 설계] 탭 — 활성 전제 */
export async function loadActiveCards(coupleId: string): Promise<Card[]> {
  return (await loadActiveCardRows(coupleId)).map(r => r.card)
}

/** 활성 전제 + 그 버전 id ("바뀐 게 있어요"가 어느 계획을 보고 알렸는지 남긴다) */
export async function loadActiveCardRows(coupleId: string): Promise<{ versionId: string; card: Card }[]> {
  const { data, error } = await sb().from('active_cards').select('*').eq('couple_id', coupleId)
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => ({ versionId: row.id as string, card: rowToCard(row, row) }))
}

/** 이 폰의 로그인 토큰 — 알림 서버가 "누구 폰인지" 확인하는 데만 쓴다 */
export async function myAccessToken(): Promise<string | null> {
  const { data } = await sb().auth.getSession()
  return data.session?.access_token ?? null
}

