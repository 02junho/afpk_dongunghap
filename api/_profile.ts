/**
 * 부부 기본 정보 한 줄 (11.14 팀 요청 — AI 요약이 재무설계 결과에 이미 있는 사실을 되묻지 않게).
 * 재무설계 결과에서 AI 가 찾고(근거 문장과 함께) 설계사가 확인해 저장한다. 요약할 때만 함께 보낸다.
 * 부부 화면에는 나오지 않는다.
 *
 * 저장 자리: plan_documents 표의 version=0 행 (storage_path = 'profile:' + 글). 이 표는 원래 참고 문서용이고
 * 앱이 다른 용도로 읽지 않아서, DB 구조를 바꾸지 않고 쓴다. 설계사(service role)만 읽고 쓴다 (RLS: docs_planner_all).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const PREFIX = 'profile:'
export const PROFILE_MAX = 200

export async function getProfile(sb: SupabaseClient, coupleId: string): Promise<string> {
  const { data } = await sb.from('plan_documents').select('storage_path').eq('couple_id', coupleId).eq('version', 0)
    .like('storage_path', `${PREFIX}%`).order('created_at', { ascending: false }).limit(1)
  return data?.[0]?.storage_path?.slice(PREFIX.length) ?? ''
}

export async function setProfile(sb: SupabaseClient, coupleId: string, text: string): Promise<void> {
  const t = text.trim().slice(0, PROFILE_MAX)
  await sb.from('plan_documents').delete().eq('couple_id', coupleId).eq('version', 0).like('storage_path', `${PREFIX}%`)
  if (t) {
    const { error } = await sb.from('plan_documents').insert({ couple_id: coupleId, version: 0, storage_path: PREFIX + t })
    if (error) throw new Error(`부부 기본 정보 저장 실패: ${error.message}`)
  }
}
