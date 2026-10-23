/**
 * 예시 고객 3쌍 (10.23 팀 결정 Q5 — "설계사 입장에서 여러 고객이 뜨게").
 * 이름·숫자는 모두 지어낸 예시다. 실존 인물·실제 상담과 무관.
 *
 *   npm run seed:samples          # 이미 같은 이름의 부부가 있으면 건너뛴다 (두 번 돌려도 안전)
 *
 * 상태가 서로 다르게 만든다: ① 맞춰보기 끝 → 처리 대기에 어긋난 건 ② 한 분만 답함(진행 중) ③ 시작 전.
 * ①의 판정은 실제 판정 경로(api/judge)를 탄다 — 서술형은 AI 판별, 🔴 는 AI 3줄 요약까지.
 * 데이터를 처음 상태로 돌리려면 supabase/cleanup-2026-10-19.sql → 다시 이 스크립트.
 */
import { createClient } from '@supabase/supabase-js'
import seed from '../src/data/seed-cards.json' with { type: 'json' }
import judgeHandler from '../api/judge'

const url = process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('✗ .env 에 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })
const BASELINE = ['home_when', 'raise_plan', 'family_help']

type Plan = Partial<Record<string, { value: string; stake?: string }>>
type Ans = Partial<Record<string, string>>   // 'same' = 네, 그대로예요 (전제 값이 답이 된다)
interface Sample { label: string; husband: string; wife: string; plan: Plan; answers?: { husband?: Ans; wife?: Ans } }

const SAMPLES: Sample[] = [
  {
    label: '이도윤 · 정하린', husband: '도윤', wife: '하린',
    plan: {
      home_when: { value: '2031-03', stake: '전세 만기 두 번(2027·2029) 뒤 매수. 늦어지면 자녀 초등 입학과 이사가 겹친다' },
      home_price: { value: '500000000', stake: '자기자금 1.6억 + 대출 3.4억 구조. 가격이 오르면 대출 한도를 넘는다' },
      income: { value: '82000000', stake: '맞벌이 합산 기준. 한 명이 쉬면 월 저축 180만이 무너진다' },
      raise_plan: { value: '두 분 모두 현 직장 유지. 연봉 상승은 물가 수준', stake: '이직하면 소득이 바뀌어 대출·저축 계획을 다시 본다' },
      family_help: { value: '양가 지원 없음. 자기자금으로만 마련', stake: '지원이 생기면 증여세·자금출처 정리가 필요하다' },
      saving: { value: '1800000', stake: '매수까지 월 180만 저축이 전제' },
      leave_who: { value: '둘 다', stake: '두 분이 나눠 쓰는 기간 동안 소득이 줄어든다' },
    },
    answers: {
      husband: { home_when: 'same', raise_plan: 'same', family_help: 'same' },
      // 아내: 매수 2년 늦춤 + 친정 지원이 생김 → 재설계 필요 후보 2건
      wife: { home_when: '2033-03', raise_plan: 'same', family_help: '친정에서 3천만 원 정도 도와주시기로 했어요' },
    },
  },
  {
    label: '박서준 · 김나연', husband: '서준', wife: '나연',
    plan: {
      home_when: { value: '2028-09', stake: '신혼부부 구입자금 혼인 7년 이내 요건 안에서 매수' },
      home_price: { value: '450000000' },
      income: { value: '71000000' },
      raise_plan: { value: '남편 2027년 승진 예정, 연봉 약 10% 상승' },
      family_help: { value: '시댁에서 5천만 원 증여 예정' },
    },
    answers: { husband: { home_when: 'same', raise_plan: 'same', family_help: 'same' } },   // 아내는 아직
  },
  {
    label: '최민재 · 윤소희', husband: '민재', wife: '소희',
    plan: {
      home_when: { value: '2032-06' },
      home_price: { value: '700000000' },
      income: { value: '95000000' },
      raise_plan: { value: '아내 2026년 말 이직 확정, 연봉 비슷' },
      family_help: { value: '양가 지원 없음' },
      retire_age: { value: '58' },
    },
  },
]

async function code(): Promise<string> {
  for (;;) {
    const c = String(100000 + Math.floor(Math.random() * 900000))
    const { data } = await sb.from('couples').select('id').eq('invite_code', c).maybeSingle()
    if (!data) return c
  }
}

const { data: planner } = await sb.from('planners').select('id').limit(1).single()
for (const s of SAMPLES) {
  const { data: exists } = await sb.from('couples').select('id').eq('label', s.label).maybeSingle()
  if (exists) { console.log(`· ${s.label}: 이미 있음, 건너뜀`); continue }
  const invite = await code()
  const { data: couple, error } = await sb.from('couples').insert({ planner_id: planner!.id, invite_code: invite, label: s.label }).select('id').single()
  if (error) throw new Error(error.message)
  const { data: members } = await sb.from('members').insert([
    { couple_id: couple.id, role: 'husband', display_name: s.husband },
    { couple_id: couple.id, role: 'wife', display_name: s.wife },
  ]).select('id, role')
  const memberOf = (r: string) => members!.find(m => m.role === r)!.id

  const cvByKey = new Map<string, { id: string; value: string }>()
  for (const c of seed as any[]) {
    const o = s.plan[c.key]
    const value = o?.value ?? String(c.plannedValue)
    const { data: card } = await sb.from('cards').insert({ couple_id: couple.id, key: c.key, type: c.type, category: c.category, unit: c.unit ?? null }).select('id').single()
    const { data: cv } = await sb.from('card_versions').insert({
      card_id: card!.id, version: 1, label: c.label, question: c.question, planned_value: value,
      tolerance: c.tolerance ?? null, options: c.options ?? null, allow_condition: !!c.allowCondition,
      stake: o?.stake ?? c.stake, reason: '최초 설정 (예시 고객)', created_by: planner!.id, activated_at: new Date().toISOString(),
    }).select('id').single()
    cvByKey.set(c.key, { id: cv!.id, value })
  }
  const { data: round } = await sb.from('rounds').insert({ couple_id: couple.id, kind: 'baseline', card_version_ids: BASELINE.map(k => cvByKey.get(k)!.id) }).select('id').single()

  for (const role of ['husband', 'wife'] as const) {
    const ans = s.answers?.[role]
    if (!ans) continue
    for (const [k, a] of Object.entries(ans)) {
      const cv = cvByKey.get(k)!
      await sb.from('answers').insert({ round_id: round!.id, card_version_id: cv.id, member_id: memberOf(role), text: a === 'same' ? cv.value : a!, is_condition: false })
    }
  }
  let note = s.answers?.wife && s.answers?.husband ? '' : s.answers ? '한 분만 답함' : '시작 전'
  if (!note) {
    const res = await judgeHandler(new Request('http://local/api/judge', { method: 'POST', body: JSON.stringify({ roundId: round!.id }) }))
    const body = await res.json() as any
    note = `판정 ${body.judged ?? body.error}건, 요약 ${body.summarized ?? 0}건`
  }
  console.log(`✓ ${s.label} · 코드 ${invite} · ${note}`)
}
