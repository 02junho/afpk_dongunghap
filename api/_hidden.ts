/**
 * 시험용으로 만들었다 지운 부부를 "지운 부부 보기"에서도 숨긴다 (11.16 — 1234 · 에피케 · E2E 같은 이름이 심사 화면에 보이지 않게).
 * DB 기록은 그대로 둔다 (답 · 카드는 지울 수 없다, 이력 보존). 표시만 빠진다.
 *
 * 저장 자리: plan_documents 의 version=-1 행 (storage_path = 'hidden:' + 이유). 부부 기본 정보(api/_profile.ts, version=0)와 같은 방식 —
 * DB 구조를 바꾸지 않는다. 설계사(service role)만 읽고 쓴다. 되돌리려면 그 행을 지우면 된다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const PREFIX = 'hidden:'

export async function hiddenCoupleIds(sb: SupabaseClient): Promise<Set<string>> {
  const { data } = await sb.from('plan_documents').select('couple_id').eq('version', -1).like('storage_path', `${PREFIX}%`)
  return new Set((data ?? []).map(r => r.couple_id as string))
}

/** 지운(보관한) 부부만 숨길 수 있다 — 쓰는 중인 부부가 실수로 사라지지 않게 */
export async function hideCouple(sb: SupabaseClient, coupleId: string, reason = 'test'): Promise<void> {
  const { data: c } = await sb.from('couples').select('archived_at').eq('id', coupleId).maybeSingle()
  if (!c) throw new Error('부부를 찾을 수 없습니다')
  if (!c.archived_at) throw new Error('지운 부부만 숨길 수 있습니다')
  if ((await hiddenCoupleIds(sb)).has(coupleId)) return
  const { error } = await sb.from('plan_documents').insert({ couple_id: coupleId, version: -1, storage_path: PREFIX + reason })
  if (error) throw new Error(`숨기기 실패: ${error.message}`)
}
