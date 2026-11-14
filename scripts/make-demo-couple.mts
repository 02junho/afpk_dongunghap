/**
 * 심사위원이 써 볼 시연 부부를 실제 DB에 만든다 (11.14).
 *  1) 부부 등록 → 질문 틀 30칸을 가상고객 예시 값으로 채움 → 사이클 시작(1주차 열림)
 *  2) 1주차는 미리 답해 둔다: 남편은 계획과 같게, 아내는 2칸 다르고 1칸은 말로 적기 → 판정(배포 서버) → 처리 대기에 3건
 *  3) 다음 주로 넘겨 2주차를 열어 둔다 → 심사위원이 부부 코드로 들어와 2주차를 직접 답해 볼 수 있다
 * 입장 코드만 출력한다. 설계사 코드는 출력하지 않는다.
 *
 *   node --env-file=.env --import tsx scripts/make-demo-couple.mts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import plannerHandler from '../api/planner'
import { SLOTS } from '../src/data/template'
import { OTHER_PREFIX } from '../src/judge/index'

const URL_ = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const DEPLOYED = 'https://afpk-dongunghap.vercel.app'
const HUSBAND = '이도윤', WIFE = '한서연'

async function planner(action: string, extra: any = {}) {
  const res = await plannerHandler(new Request('http://local/api/planner', { method: 'POST', body: JSON.stringify({ passcode: process.env.PLANNER_PASSCODE, action, ...extra }) }))
  const body = await res.json() as any
  if (res.status >= 400) throw new Error(`${action}: ${body.error ?? res.status}`)
  return body
}
const phone = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
async function join(p: SupabaseClient, code: string, role: 'husband' | 'wife') {
  const { error: e1 } = await p.auth.signInAnonymously(); if (e1) throw new Error(e1.message)
  const { data, error } = await p.rpc('join_couple', { code, want_role: role }); if (error) throw new Error(error.message)
  const { data: ms } = await p.from('members').select('id, role').eq('couple_id', data)
  return ms!.find(m => m.role === role)!.id as string
}

const made = await planner('new_couple', { label: `${HUSBAND} · ${WIFE}`, husband: HUSBAND, wife: WIFE })
const coupleId = made.coupleId as string
const saved = await planner('template_save', { coupleId, values: Object.fromEntries(SLOTS.map(s => [s.key, s.example])), source: 'example' })
console.log(`질문 틀 저장 ${saved.saved}칸`)
await planner('cycle_start', { coupleId, periodMonths: 6 })

const him = phone(), her = phone()
const himId = await join(him, made.code, 'husband')
const herId = await join(her, made.code, 'wife')
const { data: rs } = await him.from('rounds').select('id, card_version_ids').eq('couple_id', coupleId).eq('status', 'open').limit(1)
const round = rs![0]
const { data: cvs } = await him.from('card_versions').select('id, cards!inner(key)').in('id', round.card_version_ids)
const cards = (cvs ?? []).map((c: any) => ({ id: c.id as string, key: c.cards.key as string }))
const plan = Object.fromEntries(SLOTS.map(s => [s.key, s.example]))
const wifeAns: Record<string, string> = {
  ...plan,
  t1_home_price: '550000000',                                        // 계획 4억 8천 → 5억 5천
  t1_buy_year: '2030',                                               // 계획 2032 → 2030
  t1_buy_way: OTHER_PREFIX + '청약도 넣어 보고, 안 되면 바로 기존 집을 사고 싶어요', // 말로 적기 → AI
}
for (const [p, mid, ans] of [[him, himId, plan], [her, herId, wifeAns]] as const) {
  for (const c of cards) {
    const { error } = await p.from('answers').insert({ round_id: round.id, card_version_id: c.id, member_id: mid, text: ans[c.key], is_condition: false })
    if (error) throw new Error(`${c.key}: ${error.message}`)
  }
}
const j = await fetch(`${DEPLOYED}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId: round.id }) })
console.log(`판정 ${j.status}`)
const q = await planner('queue', { coupleId })
console.log(`처리 대기 ${q.items?.length ?? 0}건`)
// 요약을 미리 만들어 둔다 (설계사 화면에서 바로 보이게)
for (const it of q.items ?? []) { try { await planner('summarize', { judgmentId: it.id }) } catch (e) { console.log(`요약 실패 ${it.label}: ${(e as Error).message}`) } }
const sk = await planner('cycle_skip_week', { coupleId })
console.log(`다음 주로: ${sk.week}주차`)
console.log(`\n${HUSBAND} · ${WIFE} — 부부 입장 코드 ${made.code}`)
