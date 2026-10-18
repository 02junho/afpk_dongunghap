/**
 * 실 DB 종단 테스트 — 폰 두 대(익명 로그인 + RLS)와 설계사 API 를 실제 경로로 돌린다.
 *
 *   npm run e2e                     # 설계사 API·판정 모두 로컬 핸들러 (.env 의 키로)
 *   npm run e2e -- --deployed-judge # 판정만 배포 서버(/api/judge)로 — 배포 env(LLM 키·요약 플래그) 확인용
 *
 * 매번 새 테스트 부부("E2E 자동테스트 …")를 하나 만든다. 부부는 지울 수 없으니(이력 보존) 목록에 남는다.
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
  const { data } = await p.from('rounds').select('id, kind, card_version_ids').eq('couple_id', coupleId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
  const r = data?.[0]
  if (!r) return null
  const { data: cvs } = await p.from('card_versions').select('id, label, planned_value, cards!inner(key)').in('id', r.card_version_ids)
  return { id: r.id as string, kind: r.kind as string, cards: (cvs ?? []).map((c: any) => ({ id: c.id, key: c.cards.key, label: c.label })) }
}
async function answer(p: SupabaseClient, roundId: string, memberId: string, byKey: Record<string, string>, cards: { id: string; key: string }[]) {
  for (const c of cards) {
    const text = byKey[c.key]
    if (!text) continue
    const { error } = await p.from('answers').insert({ round_id: roundId, card_version_id: c.id, member_id: memberId, text, is_condition: false })
    if (error) throw new Error(`답 저장 실패(${c.key}): ${error.message}`)
  }
}

const t0 = Date.now()
const stamp = new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

// ───────────────────────────────────────────────────────────────────
section('설계사 API 기본')
{
  const r = await planner('couples', {}, 'wrong-passcode')
  check('틀린 설계사 코드는 401', r.status === 401, `status ${r.status}`)
}
const created = await planner('new_couple', { label: `E2E 자동테스트 (${stamp})`, husband: '테스트남', wife: '테스트여' })
check('새 부부 등록 + 코드 발급', created.status === 200 && /^\d{6}$/.test(created.body.code ?? ''), `code ${created.body.code ? '발급됨' : created.body.error}`)
const coupleId: string = created.body.coupleId
const code: string = created.body.code
{
  const { body } = await planner('cards', { coupleId })
  const cards = body.cards ?? []
  check('새 부부 카드 10장 v1 활성', cards.length === 10 && cards.every((c: any) => c.version === 1 && !c.pending), `${cards.length}장`)
  const { body: rb } = await planner('rounds', { coupleId })
  const open = (rb.rounds ?? []).filter((r: any) => r.status === 'open')
  check('0회차 3문항 자동으로 열림', open.length === 1 && open[0].kind === 'baseline' && open[0].card_version_ids.length === 3)
}

// ───────────────────────────────────────────────────────────────────
section('입장 (부부 폰)')
const him = phone(), her = phone(), stranger = phone()
{
  await stranger.auth.signInAnonymously()
  const bad = await stranger.rpc('join_couple', { code: '000000', want_role: 'husband' })
  check('틀린 입장 코드는 거부', !!bad.error, bad.error?.message.slice(0, 40))
}
const H = await join(him, code, 'husband')
const W = await join(her, code, 'wife')
check('남편 폰 입장', !('error' in H), (H as any).error)
check('아내 폰 입장', !('error' in W), (W as any).error)
const h = H as { coupleId: string; memberId: string }, w = W as { coupleId: string; memberId: string }

{
  const { data } = await stranger.from('rounds').select('id').eq('couple_id', coupleId)
  const { data: c2 } = await stranger.from('card_versions').select('id').limit(5)
  check('입장 안 한 기기는 라운드·카드를 못 읽음', (data ?? []).length === 0 && (c2 ?? []).length === 0)
}

// ───────────────────────────────────────────────────────────────────
section('0회차 — 블라인드')
const base = await openRound(him, h.coupleId)
check('남편 폰에 0회차 3문항', base?.kind === 'baseline' && base.cards.length === 3)
const baseAnswers = {
  husband: { home_when: '2029-06', raise_plan: '저 내년에 이직해요', family_help: '1.5억 정도 해주신다고 했어요' },
  wife: { home_when: '2029-03', raise_plan: '남편 이직 준비 중이에요', family_help: '그건 빌리는 거예요, 주시는 게 아니라' },
}
await answer(him, base!.id, h.memberId, baseAnswers.husband, base!.cards)
{
  const { data: prog } = await her.rpc('round_progress', { rid: base!.id })
  const hp = (prog ?? []).find((r: any) => r.role === 'husband')
  check('아내 폰은 진행 수만 봄 (남편 3/3)', hp?.answered === 3 && !Object.keys(hp).some(k => k.includes('text')), JSON.stringify(prog))
  const { data: peek } = await her.from('answers').select('text, member_id').eq('round_id', base!.id)
  check('아내 폰은 남편 답 내용을 못 읽음', (peek ?? []).every((a: any) => a.member_id === w.memberId), `${(peek ?? []).length}행 보임`)
  const forge = await her.from('answers').insert({ round_id: base!.id, card_version_id: base!.cards[0].id, member_id: h.memberId, text: '위조', is_condition: false })
  check('아내 폰이 남편 이름으로 답 못 넣음', !!forge.error)
}
await answer(her, base!.id, w.memberId, baseAnswers.wife, base!.cards)
{
  const { data: mine } = await her.from('answers').select('id, text').eq('round_id', base!.id).eq('member_id', w.memberId)
  const upd = await her.from('answers').update({ text: '고침' }).eq('id', mine?.[0]?.id ?? '')
  const { data: after } = await her.from('answers').select('text').eq('id', mine?.[0]?.id ?? '').maybeSingle()
  check('제출한 답은 고칠 수 없음 (이력 보존)', !!upd.error || after?.text !== '고침', upd.error?.message.slice(0, 40) ?? '변경 안 됨')
}
const j0 = await judgeRound(base!.id)
check(`판정 요청 (${useDeployedJudge ? '배포 서버' : '로컬'})`, j0.status === 200 && j0.body.judged === 3, `judged ${j0.body.judged ?? j0.body.error}, 요약 ${j0.body.summarized ?? '-'}`)
{
  const { data: js } = await her.from('judgments').select('*').limit(5)
  const { data: q } = await her.from('planner_queue').select('*').limit(5)
  const { data: hist } = await her.from('card_verdict_history').select('*').limit(5)
  check('부부 폰은 판정·큐를 전혀 못 읽음', (js ?? []).length === 0 && (q ?? []).length === 0 && (hist ?? []).length === 0)
  const r = await openRound(her, w.coupleId)
  check('판정 뒤 부부 폰엔 열린 라운드 없음', r === null)
}

// ───────────────────────────────────────────────────────────────────
section('설계사 큐')
const q0 = (await planner('queue', { coupleId })).body.items ?? []
const byKey = (k: string) => q0.find((i: any) => i.key === k)
check('큐에 🔴 건이 올라옴', q0.length >= 1, q0.map((i: any) => `${i.key}:${i.verdict}${i.redKind ? `/${i.redKind}` : ''}`).join(', '))
check('집 시점(3개월 차이, 허용 ±6) 은 큐에 없음 — 🟢', !byKey('home_when'))
{
  // 새 부부는 데모 부부의 "현재" 카드를 복사한다 — 데모에서 먼저 묻기로 값이 바뀌었으면 기대값도 달라진다
  const plan = String((await planner('cards', { coupleId })).body.cards.find((c: any) => c.key === 'raise_plan')?.planned_value ?? '')
  if (plan.includes('유지')) check('승진·이직: 둘 다 이직 → 🔴 전제 폐기', byKey('raise_plan')?.redKind === 'plan_stale', byKey('raise_plan')?.reason?.slice(0, 50), true)
  else check('승진·이직: 전제가 이미 "이직"이라 🔴 아님 (큐에 없음)', !byKey('raise_plan') || byKey('raise_plan').redKind !== 'plan_stale', `전제: ${plan.slice(0, 24)}…`, true)
}
check('양가 지원: 증여 vs 차용 → 🔴 부부 불일치', byKey('family_help')?.redKind === 'couple_conflict', byKey('family_help')?.reason?.slice(0, 50), true)
const withSummary = q0.filter((i: any) => i.summary)
check('🔴 건에 AI 3줄 요약', withSummary.length === q0.length && withSummary.every((i: any) => i.summary.split('\n').length === 3),
  `${withSummary.length}/${q0.length}건`, true)
{
  const it = byKey('family_help') ?? q0[0]
  const r = await planner('resolve', { coupleId, judgmentId: it.id, resolution: 'consult', note: 'E2E: 상담 때 다룸' })
  const left = (await planner('queue', { coupleId })).body.items ?? []
  check('"상담 때 다루기" → 큐에서 빠짐', r.status === 200 && !left.some((i: any) => i.id === it.id))
  const again = await planner('resolve', { coupleId, judgmentId: it.id, resolution: 'consult' })
  const still = (await planner('queue', { coupleId })).body.items ?? []
  check('이미 닫은 건을 다시 닫아도 문제 없음', again.status === 200 && still.length === left.length)
}

// ───────────────────────────────────────────────────────────────────
section('먼저 묻기 — 둘 다 동의하면 반영')
const cardsNow = (await planner('cards', { coupleId })).body.cards
const raise = cardsNow.find((c: any) => c.key === 'raise_plan')
{
  const it = byKey('raise_plan')
  if (it) await planner('resolve', { coupleId, judgmentId: it.id, resolution: 'factcheck', note: 'E2E' })
  const noReason = await planner('save_card', { coupleId, cardId: raise.card_id, plannedValue: '내년 이직', reason: ' ' })
  check('사유 없이 저장 거부', noReason.status === 400)
  const s = await planner('save_card', { coupleId, cardId: raise.card_id, plannedValue: '내년에 이직 예정, 연봉 약 20% 상승 예상', reason: 'E2E: 0회차에서 두 분 모두 이직을 전제' })
  check('새 버전 v2 저장 → 먼저 묻기 라운드', s.status === 200 && s.body.version === 2 && !!s.body.roundId)
  const dup = await planner('save_card', { coupleId, cardId: raise.card_id, plannedValue: '또 바꿈', reason: 'E2E' })
  check('동의 대기 중엔 다시 못 고침', dup.status === 400, dup.body.error?.slice(0, 30))
  const { data: act } = await him.from('active_cards').select('version').eq('couple_id', coupleId).eq('key', 'raise_plan').single()
  check('동의 전 [내 설계]는 옛 버전(v1) 그대로', act?.version === 1, `v${act?.version}`)
}
{
  const fc = await openRound(her, coupleId)
  check('부부 폰에 먼저 묻기 1문항', fc?.kind === 'factcheck' && fc.cards.length === 1)
  await answer(him, fc!.id, h.memberId, { raise_plan: '내년에 이직하고 연봉 20% 정도 오를 거예요' }, fc!.cards)
  await answer(her, fc!.id, w.memberId, { raise_plan: '남편 내년에 이직해요. 연봉도 20% 정도 오른대요' }, fc!.cards)
  const j = await judgeRound(fc!.id)
  check('판정 → 🟢 이면 v2 활성화', j.status === 200 && j.body.activated === 1, `activated ${j.body.activated}`, true)
  const { data: act } = await him.from('active_cards').select('version, planned_value').eq('couple_id', coupleId).eq('key', 'raise_plan').single()
  check('[내 설계]가 v2 로 바뀜', act?.version === 2, `v${act?.version}`, true)
}

// ───────────────────────────────────────────────────────────────────
section('먼저 묻기 — 어긋나면 반영 안 됨')
const home = cardsNow.find((c: any) => c.key === 'home_when')
{
  const s = await planner('save_card', { coupleId, cardId: home.card_id, plannedValue: '2030-06', reason: 'E2E: 매수 1년 연기' })
  const fc = await openRound(him, coupleId)
  await answer(him, fc!.id, h.memberId, { home_when: '2030-06' }, fc!.cards)
  await answer(her, fc!.id, w.memberId, { home_when: '2028-01' }, fc!.cards)
  const j = await judgeRound(fc!.id)
  check('한 명만 동의 → 활성화 안 함', s.status === 200 && j.body.activated === 0)
  const { data: act } = await her.from('active_cards').select('planned_value').eq('couple_id', coupleId).eq('key', 'home_when').single()
  check('[내 설계]는 옛 값 유지', act?.planned_value !== '2030-06', String(act?.planned_value))
  const q = (await planner('queue', { coupleId })).body.items ?? []
  const it = q.find((i: any) => i.key === 'home_when' && i.roundKind === 'factcheck')
  check('어긋난 먼저 묻기는 큐로 옴', !!it, it ? `${it.verdict}/${it.redKind}` : '')
  if (it) await planner('resolve', { coupleId, judgmentId: it.id, resolution: 'factcheck', note: 'E2E: 다시 묻기' })
  const cardsMid = (await planner('cards', { coupleId })).body.cards
  const failed = cardsMid.find((c: any) => c.key === 'home_when')
  check('설계사 화면: "동의 안 됨" (대기 아님)', failed?.pending === true && failed?.awaiting === false)
  const retry = await planner('save_card', { coupleId, cardId: home.card_id, plannedValue: '2029-12', reason: 'E2E: 절충안으로 다시 묻기' })
  check('동의가 안 된 카드를 설계사가 다시 고칠 수 있음', retry.status === 200, retry.body.error ?? `v${retry.body.version}`)
  // 다음 섹션이 깨끗하게 돌도록 이 라운드를 닫는다 (둘 다 절충안에 동의)
  if (retry.status === 200) {
    const fc2 = await openRound(him, coupleId)
    await answer(him, fc2!.id, h.memberId, { home_when: '2029-12' }, fc2!.cards)
    await answer(her, fc2!.id, w.memberId, { home_when: '2029-11' }, fc2!.cards)
    const j2 = await judgeRound(fc2!.id)
    check('다시 물은 절충안에 둘 다 동의 → 활성화', j2.body.activated === 1)
  }
}

// ───────────────────────────────────────────────────────────────────
section('카드 추가 + 바로 묻기')
{
  const bad = await planner('add_card', { coupleId, card: { category: 'housing', type: 'date', label: 'x', question: 'x', plannedValue: '내년', stake: 'x' } })
  check('잘못된 값은 거부 (연도 없는 시점)', bad.status === 400, bad.body.error)
  const add = await planner('add_card', { coupleId, askNow: true, card: {
    category: 'housing', type: 'choice', label: '전세대출 명의', question: '전세대출은 누구 이름으로 받기로 했나요?',
    options: ['남편', '아내', '둘 다', '아직 모름'], plannedValue: '남편', stake: '아내 신고소득이 낮게 잡히면 한도가 줄어듦',
  } })
  check('선택형 카드 추가 → v1 바로 전제 + 정기 1문항', add.status === 200 && !!add.body.roundId, add.body.error ?? '')
  const rg = await openRound(her, coupleId)
  check('부부 폰에 정기 1문항', rg?.kind === 'regular' && rg.cards.length === 1)
  const { data: act } = await her.from('active_cards').select('label').eq('couple_id', coupleId).eq('label', '전세대출 명의')
  check('[내 설계]에 새 카드가 보임', (act ?? []).length === 1)
  if (rg) {
    const k = rg.cards[0].key
    await answer(him, rg.id, h.memberId, { [k]: '남편' }, rg.cards)
    await answer(her, rg.id, w.memberId, { [k]: '아직 모름' }, rg.cards)
    // 마지막 답을 낸 폰의 답변 화면·대기 화면이 거의 동시에 판정을 부른다 — 한 번만 판정해야 한다
    const both = await Promise.all([judgeRound(rg.id), judgeRound(rg.id), judgeRound(rg.id)])
    const ran = both.filter(r => r.body.judged === 1).length
    check('판정 요청이 동시에 3번 와도 한 번만 판정', ran === 1 && both.every(r => r.status === 200), both.map(r => r.body.judged ? 'judged' : r.body.inProgress ? 'inProgress' : r.body.already ? 'already' : r.status).join(', '))
    const j = both.find(r => r.body.judged === 1) ?? both[0]
    const q = (await planner('queue', { coupleId })).body.items ?? []
    const it = q.find((i: any) => i.label === '전세대출 명의')
    check('선택형은 AI 없이 판정 (남편 vs 아직 모름)', j.status === 200 && (!it || it.method === 'deterministic'), it ? `${it.verdict}/${it.redKind ?? ''} · ${it.method}` : '큐에 없음(🟢/🟡)')
  }
}

// ───────────────────────────────────────────────────────────────────
section('기기 바꾸기')
{
  const newPhone = phone()
  const r = await join(newPhone, code, 'husband')
  check('같은 역할로 다른 폰 입장 → 새 폰으로 넘어감', !('error' in r), (r as any).error)
  const { data: old } = await him.from('rounds').select('id').eq('couple_id', coupleId)
  check('예전 폰은 더 이상 못 읽음', (old ?? []).length === 0, `${(old ?? []).length}행`)
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
