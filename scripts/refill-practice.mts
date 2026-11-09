/**
 * 팀원 연습 부부(이름이 "팀원 연습"으로 시작) 의 질문 틀을 지금 틀의 예시 값으로 채운다.
 * 질문 틀을 바꾼 뒤 한 번 돌린다 (11.09 목표 질문 30문항). 사이클은 시작하지 않는다 — 팀원이 직접 시작해 본다.
 * 값은 덮어쓰지 않고 새 버전으로 쌓인다 (카드 규칙 그대로). 예전 틀 칸은 남지만 앱은 지금 틀 칸만 쓴다.
 *
 *   node --env-file=.env --import tsx scripts/refill-practice.mts
 */
import { createClient } from '@supabase/supabase-js'
import plannerHandler from '../api/planner'
import { SLOTS } from '../src/data/template'

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const call = async (body: object) => (await plannerHandler(new Request('http://local/api/planner', { method: 'POST', body: JSON.stringify({ passcode: process.env.PLANNER_PASSCODE, ...body }) }))).json() as Promise<any>

const { data: cs, error } = await sb.from('couples').select('id, label').is('archived_at', null).like('label', '팀원 연습%')
if (error) throw new Error(error.message)
for (const c of cs ?? []) {
  const r = await call({ action: 'template_save', coupleId: c.id, values: Object.fromEntries(SLOTS.map(s => [s.key, s.example])), source: 'example' })
  const t = await call({ action: 'template', coupleId: c.id })
  console.log(`${c.label}: 저장 ${r.saved} · 오류 ${(r.errors ?? []).length} · 지금 틀 ${Object.keys(t.values ?? {}).length}/${SLOTS.length}칸`)
}
