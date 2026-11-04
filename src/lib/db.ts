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
    if (error) throw new Error(`익명 로그인 실패: ${error.message}`)
  }
  let { data: coupleId, error } = await s.rpc('join_couple', { code, want_role: role })
  // 이 기기(uid)가 이미 다른 역할/커플에 묶여 있으면 — 새 익명 uid 로 갈아타고 한 번 더.
  // (DB 의 join_couple 이 재연결 패치 전이어도 같은 폰으로 여러 커플을 시연할 수 있게)
  if (error && /members_auth_user_id_key|이미 다른 기기/.test(error.message)) {
    await s.auth.signOut()
    const { error: e } = await s.auth.signInAnonymously()
    if (e) throw new Error(`익명 로그인 실패: ${e.message}`)
    ;({ data: coupleId, error } = await s.rpc('join_couple', { code, want_role: role }))
  }
  if (error) throw new Error(error.message)
  const { data: members, error: e2 } = await s.from('members').select('id, role, display_name').eq('couple_id', coupleId)
  if (e2) throw new Error(e2.message)
  const mine = members?.find(m => m.role === role)
  if (!mine) throw new Error('역할을 찾지 못했습니다')
  const names = { husband: '남편', wife: '아내' } as Record<Role, string>
  for (const m of members ?? []) if (m.display_name) names[m.role as Role] = m.display_name
  return { coupleId: coupleId as string, memberId: mine.id as string, names }
}

export { rowToCard } from './cards'

export interface OpenRound {
  id: string
  kind: string
  /** 라운드가 묻는 순서대로 */
  cards: { versionId: string; card: Card }[]
}

/** 내 커플의 열린 라운드 하나 (없으면 null) */
export async function loadOpenRound(coupleId: string): Promise<OpenRound | null> {
  const s = sb()
  const { data: rounds, error } = await s
    .from('rounds').select('id, kind, card_version_ids')
    .eq('couple_id', coupleId).eq('status', 'open')
    .order('opened_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const r = rounds?.[0]
  if (!r) return null
  const ids: string[] = r.card_version_ids
  const { data: cvs, error: e2 } = await s.from('card_versions').select('*, cards!inner(key, type, category, unit)').in('id', ids)
  if (e2) throw new Error(e2.message)
  const byId = new Map((cvs ?? []).map(cv => [cv.id, cv]))
  return {
    id: r.id,
    kind: r.kind,
    cards: ids.filter(id => byId.has(id)).map(id => {
      const cv = byId.get(id)!
      return { versionId: id, card: rowToCard(cv, cv.cards) }
    }),
  }
}

/** 라운드 하나의 종류·문항 수 (판정이 끝난 라운드도). 대기·전달 화면 문구용 */
export async function loadRoundInfo(roundId: string): Promise<{ kind: string; count: number; status: string } | null> {
  const { data, error } = await sb().from('rounds').select('kind, status, card_version_ids').eq('id', roundId).maybeSingle()
  if (error || !data) return null
  return { kind: data.kind, status: data.status, count: (data.card_version_ids as string[]).length }
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

const NOTICE_PATCH_HINT = '아직 이 기능을 쓸 수 없어요. 설계사님께 알려 주세요 (DB 패치 필요)'

/**
 * "바뀐 게 있어요" (11.04) — 맞춰보기를 기다리지 않고 먼저 알린다. 설계사 처리 대기로만 간다.
 * 배우자는 못 본다 (RLS: 자기 것만 넣고 자기 것만 읽는다). 판정하지 않는다.
 */
export async function submitNotice(coupleId: string, memberId: string, versionId: string, text: string, isCondition: boolean) {
  const { error } = await sb().from('change_notices').insert({ couple_id: coupleId, member_id: memberId, card_version_id: versionId, text, is_condition: isCondition })
  if (error) throw new Error(/change_notices/.test(error.message) ? NOTICE_PATCH_HINT : error.message)
}

/** 내가 알렸고 설계사가 아직 처리하지 않은 카드 버전들 — [내 설계]에 "전달됨" 표시 */
export async function myOpenNotices(memberId: string): Promise<Set<string>> {
  const { data, error } = await sb().from('change_notices').select('card_version_id').eq('member_id', memberId).is('resolved_at', null)
  if (error) return new Set()   // 패치 전이면 표가 없다 — 표시만 안 한다
  return new Set((data ?? []).map(n => n.card_version_id as string))
}
