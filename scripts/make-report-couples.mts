/**
 * 보고서 6단계에 맞춘 시연 부부 두 쌍 (11.14).
 *  ① 보고서 사례 — 이도윤 · 한서연 (입장 코드 818793, 앱설계서 2절에 적힌 코드)
 *     6주 질문을 모두 마침. 30문항 모두 계획대로 답했고, 아내만 '은퇴 후 월 생활비'를 350만 원으로 답함
 *     → 처리 대기에 그 1건만 (AI 요약 + 검토 기준). 보고서 6단계 "다른 문항은 모두 제안서와 같았지만…"과 같다.
 *  ② 직접 답해 보기 — 정우진 · 최하은. 같은 계획 값, 1주차 질문이 열려 있어 심사위원이 폰으로 답해 볼 수 있다.
 * 818793 을 쓰던 이전 시연 부부는 지우기(보관)하고 코드를 다른 번호로 바꾼다 — 기록은 그대로 남는다.
 * 판정은 배포 서버(/api/judge)로 — AI 요약까지 배포 환경 그대로. 입장 코드만 출력한다.
 *
 *   node --env-file=.env --import tsx scripts/make-report-couples.mts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import plannerHandler from '../api/planner'
import { serviceClient } from '../api/judge'
import { setProfile } from '../api/_profile'
import { SLOTS, WEEKS } from '../src/data/template'

const DEPLOYED = 'https://afpk-dongunghap.vercel.app'
const REPORT_CODE = '818793'
const PROFILE = '남편: 대기업 직장인(연 급여 6,700만 원) · 아내: 프리랜서(순사업소득 3,200만 원)'
const sb = serviceClient()!

async function planner(action: string, extra: any = {}) {
  const res = await plannerHandler(new Request('http://local/api/planner', { method: 'POST', body: JSON.stringify({ passcode: process.env.PLANNER_PASSCODE, action, ...extra }) }))
  const body = await res.json() as any
  if (res.status >= 400) throw new Error(`${action}: ${body.error ?? res.status}`)
  return body
}
const phone = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
async function join(p: SupabaseClient, code: string, role: 'husband' | 'wife') {
  const { error: e1 } = await p.auth.signInAnonymously(); if (e1) throw new Error(e1.message)
  const { data, error } = await p.rpc('join_couple', { code, want_role: role }); if (error) throw new Error(error.message)
  const { data: ms } = await p.from('members').select('id, role').eq('couple_id', data)
  return ms!.find(m => m.role === role)!.id as string
}
const plan = Object.fromEntries(SLOTS.map(s => [s.key, s.example]))

async function setUp(label: string, husband: string, wife: string) {
  const made = await planner('new_couple', { label, husband, wife })
  await planner('template_save', { coupleId: made.coupleId, values: plan, source: 'example' })
  await setProfile(sb, made.coupleId, PROFILE)
  await planner('cycle_start', { coupleId: made.coupleId, periodMonths: 6 })
  return made as { coupleId: string; code: string }
}

// ── ① 보고서 사례 ──
const report = await setUp('이도윤 · 한서연', '이도윤', '한서연')
const him = phone(), her = phone()
const ids = { husband: await join(him, report.code, 'husband'), wife: await join(her, report.code, 'wife') }
const wifeAns: Record<string, string> = { ...plan, t3_life_monthly: '3500000' }   // 보고서 6단계: 아내 고객님만 350만 원
for (let w = 1; w <= WEEKS; w++) {
  const { data: rs } = await him.from('rounds').select('id, card_version_ids').eq('couple_id', report.coupleId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
  const round = rs![0]
  const { data: cvs } = await him.from('card_versions').select('id, cards!inner(key)').in('id', round.card_version_ids)
  for (const [p, mid, ans] of [[him, ids.husband, plan], [her, ids.wife, wifeAns]] as const)
    for (const c of cvs ?? []) {
      const { error } = await p.from('answers').insert({ round_id: round.id, card_version_id: c.id, member_id: mid, text: ans[(c as any).cards.key], is_condition: false })
      if (error) throw new Error(error.message)
    }
  const j = await fetch(`${DEPLOYED}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId: round.id }) })
  console.log(`${w}주차 답 · 판정 ${j.status}`)
  if (w < WEEKS) await planner('cycle_skip_week', { coupleId: report.coupleId })
}
const q = await planner('queue', { coupleId: report.coupleId })
for (const it of q.items) if (!it.summary) await planner('summarize', { judgmentId: it.id })
console.log(`처리 대기 ${q.items.length}건: ${q.items.map((i: any) => i.label).join(', ')}`)

// ── 818793 을 새 보고서 부부로 옮긴다 ──
const { data: old } = await sb.from('couples').select('id').eq('invite_code', REPORT_CODE).maybeSingle()
if (old) {
  await planner('archive_couple', { coupleId: old.id })
  await planner('hide_couple', { coupleId: old.id })   // 같은 이름이 지운 부부 보기에 남아 헷갈리지 않게
  let spare = ''
  for (;;) {
    spare = String(100000 + Math.floor(Math.random() * 900000))
    const { data: hit } = await sb.from('couples').select('id').eq('invite_code', spare).maybeSingle()
    if (!hit) break
  }
  const { error: e1 } = await sb.from('couples').update({ invite_code: spare }).eq('id', old.id); if (e1) throw new Error(e1.message)
}
const { error: e2 } = await sb.from('couples').update({ invite_code: REPORT_CODE }).eq('id', report.coupleId); if (e2) throw new Error(e2.message)
console.log(`보고서 사례 이도윤 · 한서연 — 입장 코드 ${REPORT_CODE}`)

// ── ② 직접 답해 보기 ──
const tryout = await setUp('정우진 · 최하은', '정우진', '최하은')
console.log(`직접 답해 보기 정우진 · 최하은 — 입장 코드 ${tryout.code}`)
