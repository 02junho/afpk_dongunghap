/**
 * 실 DB 종단 테스트 — 폰 두 대(익명 로그인 + RLS)와 설계사 API 를 실제 경로로 돌린다.
 *
 *   npm run e2e                     # 설계사 API·판정 모두 로컬 핸들러 (.env 의 키로)
 *   npm run e2e -- --deployed-judge # 판정만 배포 서버(/api/judge)로 — 배포 env(LLM 키·요약 플래그) 확인용
 *
 * 11.04 새 방향: 질문 틀 30칸 → 6주 사이클 → 매주 5문항 → 판정 → 처리 대기 "확인함" → 사이클 정리 → 상담 요청.
 * 매번 새 테스트 부부("E2E 자동테스트 …")를 하나 만들고, 끝나면 지우기(보관)로 정리한다.
 * 키 값은 출력하지 않는다. LLM 판별 결과는 "참고(soft)"로만 본다 — 실패해도 전체 실패로 치지 않는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import plannerHandler from '../api/planner'
import judgeHandler from '../api/judge'

const URL_ = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const PASS = process.env.PLANNER_PASSCODE || 'dev'
process.env.PLANNER_PASSCODE = PASS
const DEPLOYED = 'https://afpk-dongunghap.vercel.app'
const useDeployedJudge = process.argv.includes('--deployed-judge')
if (!URL_ || !ANON || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('✗ .env 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }

type Check = { area: string; name: string; ok: boolean; detail?: string; soft?: boolean }
const checks: Check[] = []
let area = ''
function check(name: string, ok: boolean, detail = '', soft = false) {
  checks.push({ area, name, ok, detail, soft })
  console.log(`${ok ? '✓' : soft ? '△' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
function section(s: string) { area = s; console.log(`\n── ${s}`) }

async function planner(action: string, extra: any = {}, pass = PASS) {
  const res = await plannerHandler(new Request('http://local/api/planner', { method: 'POST', body: JSON.stringify({ passcode: pass, action, ...extra }) }))
  return { status: res.status, body: await res.json() as any }
}
async function judgeRound(roundId: string) {
  if (useDeployedJudge) {
    const res = await fetch(`${DEPLOYED}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId }) })
    return { status: res.status, body: await res.json() as any }
  }
  const res = await judgeHandler(new Request('http://local/api/judge', { method: 'POST', body: JSON.stringify({ roundId }) }))
  return { status: res.status, body: await res.json() as any }
}

/** 폰 한 대 = 독립된 익명 세션 */
function phone(): SupabaseClient {
  return createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
}
async function join(p: SupabaseClient, code: string, role: 'husband' | 'wife') {
  const { data: s } = await p.auth.getSession()
  if (!s.session) { const { error } = await p.auth.signInAnonymously(); if (error) throw new Error(`익명 로그인: ${error.message}`) }
  const { data, error } = await p.rpc('join_couple', { code, want_role: role })
  if (error) return { error: error.message }
  const { data: ms } = await p.from('members').select('id, role').eq('couple_id', data)
  return { coupleId: data as string, memberId: ms?.find(m => m.role === role)?.id as string }
}
async function openRound(p: SupabaseClient, coupleId: string) {
  const { data } = await p.from('rounds').select('id, kind, week, card_version_ids').eq('couple_id', coupleId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
  const r = data?.[0]
  if (!r) return null
  const { data: cvs } = await p.from('card_versions').select('id, label, planned_value, cards!inner(key)').in('id', r.card_version_ids)
  const byId = new Map((cvs ?? []).map((c: any) => [c.id, c]))
  return { id: r.id as string, kind: r.kind as string, week: r.week as number | null, cards: (r.card_version_ids as string[]).map(id => byId.get(id)).filter(Boolean).map((c: any) => ({ id: c.id, key: c.cards.key, label: c.label, planned: c.planned_value })) }
}
async function answer(p: SupabaseClient, roundId: string, memberId: string, byKey: Record<string, string>, cards: { id: string; key: string }[]) {
  for (const c of cards) {
    const text = byKey[c.key]
    if (!text) continue
    const { error } = await p.from('answers').insert({ round_id: roundId, card_version_id: c.id, member_id: memberId, text, is_condition: false })
    if (error) throw new Error(`답 저장 실패(${c.key}): ${error.message}`)
  }
}

import { SLOTS, slotsOfWeek } from '../src/data/template'

const t0 = Date.now()
const stamp = new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const same = (cards: { key: string; planned: string }[]) => Object.fromEntries(cards.map(c => [c.key, c.planned]))

// ───────────────────────────────────────────────────────────────────
section('설계사 API 기본')
{
  const r = await planner('couples', {}, 'wrong-passcode')
  check('틀린 설계사 코드는 401', r.status === 401, `status ${r.status}`)
}
const created = await planner('new_couple', { label: `E2E 자동테스트 (${stamp})`, husband: '테스트남', wife: '테스트여' })
const coupleId: string = created.body.coupleId, code: string = created.body.code
check('새 부부 등록 + 코드 발급', created.status === 200 && /^\d{6}$/.test(code ?? ''), code)

try {
  // ─────────────────────────────────────────────────────────────────
  section('질문 틀 30칸')
  {
    const early = await planner('cycle_start', { coupleId })
    check('틀이 비어 있으면 사이클을 시작할 수 없음', early.status === 400, early.body.error)
    const bad = await planner('template_save', { coupleId, values: { t1_buy_when: '6~7년 안', t1_next_deposit: '3억' }, source: 'manual' })
    check('상대 시점은 저장 안 됨 · 금액은 규칙으로 원 단위', bad.body.errors?.length === 1 && bad.body.saved === 1, JSON.stringify(bad.body.errors))
    const all = await planner('template_save', { coupleId, values: Object.fromEntries(SLOTS.map(s => [s.key, s.example])), source: 'example' })
    check('예시 값으로 30칸 저장', all.status === 200 && all.body.saved === 29, `saved ${all.body.saved} (보증금은 같은 값이라 건너뜀)`)
    const t = await planner('template', { coupleId })
    check('30칸 모두 v1', Object.keys(t.body.values).length === 30 && Object.values(t.body.values).every((v: any) => v.version === 1))
    const again = await planner('template_save', { coupleId, values: { t1_next_deposit: '3억 2천만' }, source: 'manual' })
    const t2 = await planner('template', { coupleId })
    check('값을 바꾸면 새 버전 (덮어쓰지 않음)', again.body.saved === 1 && t2.body.values.t1_next_deposit.version === 2 && t2.body.values.t1_next_deposit.planned === '320000000')
  }

  // ─────────────────────────────────────────────────────────────────
  section('사이클 시작 · 1주차')
  const him = phone(), her = phone()
  const h = await join(him, code, 'husband'), w = await join(her, code, 'wife')
  check('두 폰 입장', !('error' in h) && !('error' in w))
  const st = await planner('cycle_start', { coupleId, periodMonths: 3 })
  check('사이클 시작 → 1주차가 열림', st.status === 200 && st.body.week === 1 && st.body.opened === 1, JSON.stringify(st.body))
  const dup = await planner('cycle_start', { coupleId })
  check('진행 중이면 또 시작 못 함', dup.status === 400, dup.body.error)
  const r1 = await openRound(him, coupleId)
  check('남편 폰에 1주차 주택 5문항 (틀 순서)', r1?.week === 1 && r1.cards.length === 5 && r1.cards.map(c => c.key).join() === slotsOfWeek(1).map(s => s.key).join(), r1?.cards.map(c => c.label).join(' · '))

  // ─────────────────────────────────────────────────────────────────
  section('따로 답하기 — 블라인드')
  await answer(him, r1!.id, (h as any).memberId, same(r1!.cards), r1!.cards)
  const { data: prog } = await her.rpc('round_progress', { rid: r1!.id })
  check('아내 폰은 진행 수만 봄', JSON.stringify(prog).includes('"answered":5'), JSON.stringify(prog))
  const { data: peek } = await her.from('answers').select('*').eq('round_id', r1!.id)
  check('아내 폰은 남편 답 내용을 못 읽음', (peek ?? []).length === 0, `${(peek ?? []).length}행`)
  // 아내: 내 집 마련 시점만 다른 후보(2034년 6월), 부모님 지원금은 "기타"에 값만 적음(1억 = 계획 그대로 → 규칙이 읽어 🟢)
  await answer(her, r1!.id, (w as any).memberId, { ...same(r1!.cards), t1_buy_when: '2034-06', t1_family_support: '기타: 1억' }, r1!.cards)
  const j1 = await judgeRound(r1!.id)
  check('판정', j1.status === 200 && j1.body.judged === 5, JSON.stringify(j1.body))
  const { data: jj } = await him.from('judgments').select('id')
  check('부부 폰은 판정을 못 읽음', (jj ?? []).length === 0)

  // ─────────────────────────────────────────────────────────────────
  section('처리 대기 · 확인함 · 사이클 정리')
  const q = await planner('queue', { coupleId })
  const hit = q.body.items.find((i: any) => i.key === 't1_buy_when')
  check('내 집 마련 시점만 🔴 계획과 다름 (기타에 값만 적은 지원금은 🟢)', q.body.items.length === 1 && hit?.verdict === 'red' && !hit?.redKind, q.body.items.map((i: any) => `${i.key}:${i.verdict}/${i.redKind}`).join())
  const rs = await planner('resolve', { coupleId, judgmentId: hit.id, resolution: 'consult', note: '아내분 이직 계획 확인' })
  check('확인함', rs.status === 200)
  const q2 = await planner('queue', { coupleId })
  check('확인한 건은 처리 대기에서 빠짐', q2.body.items.length === 0)
  const c1 = await planner('cycle', { coupleId })
  const rv = c1.body.review?.[0]
  check('사이클 정리에 ✓ 와 메모로 남음', c1.body.review.length === 1 && rv.resolution === 'consult' && rv.note === '아내분 이직 계획 확인' && rv.week === 1)
  check('사이클 정리: 1주차 끝남 · 2주차 아직', c1.body.weeks[0].status === 'judged' && !c1.body.weeks[1].roundId)

  // ─────────────────────────────────────────────────────────────────
  section('다음 주 · 답 안 하면 남고 · 한 번 더 알림')
  const sk = await planner('cycle_skip_week', { coupleId })
  check('다음 주로 넘기기 → 2주차 출산/육아 열림', sk.status === 200 && sk.body.week === 2 && sk.body.opened === 1, JSON.stringify(sk.body))
  const r2 = await openRound(her, coupleId)
  await answer(him, r2!.id, (h as any).memberId, same(r2!.cards), r2!.cards)   // 남편만 답하고, 아내는 안 함
  const sk2 = await planner('cycle_skip_week', { coupleId })
  check('3주차 노후 열림', sk2.body.week === 3 && sk2.body.opened === 1)
  const { data: openRs } = await her.from('rounds').select('week, reminded_at').eq('couple_id', coupleId).eq('status', 'open').order('week')
  check('2주차는 닫히지 않고 남아 있음 (다음 주로 넘어감)', (openRs ?? []).map((r: any) => r.week).join() === '2,3', JSON.stringify(openRs))
  check('열린 지 4일 지난 2주차에 한 번 더 알림 표시', !!(openRs ?? []).find((r: any) => r.week === 2)?.reminded_at)
  const c2 = await planner('cycle', { coupleId })
  check('사이클 정리: 2주차 남편 5/5 · 아내 0/5', c2.body.weeks[1].husband === 5 && c2.body.weeks[1].wife === 0)

  // ─────────────────────────────────────────────────────────────────
  section('상담 요청 · 다음 사이클')
  const cr = await planner('consult_request', { coupleId })
  check('상담 요청 → 사이클 닫힘', cr.status === 200 && !!cr.body.nextAt)
  const { data: after } = await her.from('rounds').select('id').eq('couple_id', coupleId).eq('status', 'open')
  check('남은 질문도 닫힘', (after ?? []).length === 0)
  const c3 = await planner('cycle', { coupleId })
  const months = (new Date(c3.body.cycle.nextAt).getTime() - new Date(c3.body.cycle.startedAt).getTime()) / 86_400_000
  check('다음 사이클 = 시작일 + 3개월', c3.body.cycle.closedAt && months > 88 && months < 93, `${months.toFixed(0)}일`)
  const list = await planner('couples')
  check('부부 목록 상태: 상담 요청함', /상담 요청함/.test(list.body.items.find((c: any) => c.id === coupleId)?.state ?? ''), list.body.items.find((c: any) => c.id === coupleId)?.state)
} finally {
  const a = await planner('archive_couple', { coupleId })
  console.log(`\n· 테스트 부부 지움 (${a.status === 200 ? 'ok' : a.body.error})`)
}

// ───────────────────────────────────────────────────────────────────
const hard = checks.filter(c => !c.soft)
const fail = hard.filter(c => !c.ok), softFail = checks.filter(c => c.soft && !c.ok)
console.log(`\n결과: 필수 ${hard.length - fail.length}/${hard.length} 통과 · 참고(LLM) ${checks.filter(c => c.soft).length - softFail.length}/${checks.filter(c => c.soft).length} · ${((Date.now() - t0) / 1000).toFixed(0)}초`)
console.log(`테스트 부부: E2E 자동테스트 (${stamp}) · 입장 코드 ${code}`)
if (process.argv.includes('--md')) {
  console.log('\n| 영역 | 확인 | 결과 | 메모 |\n|---|---|---|---|')
  for (const c of checks) console.log(`| ${c.area} | ${c.name} | ${c.ok ? '✅' : c.soft ? '△' : '❌'} | ${(c.detail ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`)
}
process.exit(fail.length ? 1 : 0)
