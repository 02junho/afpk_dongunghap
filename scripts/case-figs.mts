/**
 * 사례 보고서 6단계(고객 상황 모니터링) 그림 2장 — 실제 앱 · 실제 DB 로 찍는다 (11.14).
 *  · 촬영용 부부(이도윤 · 한서연, 계획 값 = 가상고객 예시)를 새로 만들고 3주차(노후)까지 연다. 1 · 2주차는 둘 다 계획대로 답해 둔다
 *  · 3주차를 두 폰 화면에서 직접 답한다: 은퇴 후 월 생활비만 남편 300만 원 · 아내 350만 원, 나머지는 계획대로
 *  · 판정 → AI 요약 → 설계사 처리 대기 카드를 찍는다. 끝나면 촬영용 부부를 보관(지우기)한다 — 심사용 시연 부부(818793)는 건드리지 않는다
 * 로컬 dev 서버(실제 DB)가 떠 있어야 한다:  npm run dev -- --port 5174
 *   node --env-file=.env --import tsx scripts/case-figs.mts   → build/case-figs/answer.png · summary.png
 */
import { chromium, type Page } from 'playwright'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import plannerHandler from '../api/planner'
import { SLOTS } from '../src/data/template'

const B = process.env.SHOTS_BASE ?? 'http://localhost:5174'
const OUT = resolve('build/case-figs')
mkdirSync(OUT, { recursive: true })
const HUSBAND = '이도윤', WIFE = '한서연'
const PROFILE = '남편: 대기업 직장인(연 급여 6,700만 원) · 아내: 프리랜서(순사업소득 3,200만 원)'

async function planner(action: string, extra: any = {}) {
  const res = await plannerHandler(new Request('http://local/api/planner', { method: 'POST', body: JSON.stringify({ passcode: process.env.PLANNER_PASSCODE, action, ...extra }) }))
  const body = await res.json() as any
  if (res.status >= 400) throw new Error(`${action}: ${body.error ?? res.status}`)
  return body
}
const phoneDb = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
async function join(p: SupabaseClient, code: string, role: 'husband' | 'wife') {
  const { error: e1 } = await p.auth.signInAnonymously(); if (e1) throw new Error(e1.message)
  const { data, error } = await p.rpc('join_couple', { code, want_role: role }); if (error) throw new Error(error.message)
  const { data: ms } = await p.from('members').select('id, role').eq('couple_id', data)
  return ms!.find(m => m.role === role)!.id as string
}

// ── 1) 촬영용 부부 · 1 · 2주차 ──
const made = await planner('new_couple', { label: `${HUSBAND} · ${WIFE}`, husband: HUSBAND, wife: WIFE })
const coupleId = made.coupleId as string
const plan = Object.fromEntries(SLOTS.map(s => [s.key, s.example]))
await planner('template_save', { coupleId, values: plan, source: 'example', profile: PROFILE })
await planner('cycle_start', { coupleId, periodMonths: 6 })
const him = phoneDb(), her = phoneDb()
const ids = { husband: await join(him, made.code, 'husband'), wife: await join(her, made.code, 'wife') }
async function answerOpenRound() {
  const { data: rs } = await him.from('rounds').select('id, card_version_ids').eq('couple_id', coupleId).eq('status', 'open').limit(1)
  const round = rs![0]
  const { data: cvs } = await him.from('card_versions').select('id, cards!inner(key)').in('id', round.card_version_ids)
  for (const [p, mid] of [[him, ids.husband], [her, ids.wife]] as const)
    for (const c of cvs ?? []) {
      const { error } = await p.from('answers').insert({ round_id: round.id, card_version_id: c.id, member_id: mid, text: plan[(c as any).cards.key], is_condition: false })
      if (error) throw new Error(error.message)
    }
  await fetch(`${B}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId: round.id }) })
}
await answerOpenRound(); await planner('cycle_skip_week', { coupleId })
await answerOpenRound(); const sk = await planner('cycle_skip_week', { coupleId })
console.log(`촬영용 부부 ${made.code} · ${sk.week}주차 열림`)

// ── 2) 두 폰에서 3주차 답하기 ──
const br = await chromium.launch({ args: ['--lang=ko-KR'] })
const phoneCtx = () => br.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
// 만 원 단위로 적는다 (숫자 칸이 금액은 만 원)
const typed = (key: string, role: 'husband' | 'wife') => {
  if (key === 't3_life_monthly') return role === 'husband' ? '300' : '350'
  const s = SLOTS.find(x => x.key === key)!
  return (s.unit ?? 'krw') === 'krw' ? String(Number(s.example) / 10000) : s.example
}
const week3 = SLOTS.filter(s => s.week === 3)
async function answerOnPhone(role: 'husband' | 'wife') {
  const p: Page = await (await phoneCtx()).newPage()
  await p.goto(`${B}/c/join`, { waitUntil: 'networkidle' })
  await p.fill('input.code-field', made.code)
  await p.click(`button.role:has-text("${role === 'husband' ? '남편' : '아내'}")`)
  await p.click('button:has-text("시작하기")')
  await p.waitForURL(/\/c\/home/, { timeout: 20000 })
  await p.goto(`${B}/c/home`, { waitUntil: 'networkidle' })
  await p.click('button:has-text("시작하기")')
  await p.waitForURL(/\/c\/round\//, { timeout: 15000 })
  for (let n = 0; n < week3.length; n++) {
    await p.waitForSelector('h2.q'); await p.waitForTimeout(500)
    const q = (await p.locator('h2.q').innerText()).trim()
    const s = week3.find(x => x.question === q)
    if (!s) throw new Error(`모르는 질문: ${q}`)
    await p.fill('input.field', typed(s.key, role))
    if (s.key === 't3_life_monthly') { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${role}.png` }) }
    await p.click('button:has-text("제출")')
    await p.waitForTimeout(900)
  }
  await p.context().close()
}
await answerOnPhone('husband')
await answerOnPhone('wife')
await new Promise(r => setTimeout(r, 6000))

// ── 3) 판정 · 요약 · 설계사 카드 ──
let q = await planner('queue', { coupleId })
console.log('처리 대기:', q.items.map((i: any) => i.label).join(', '))
for (const it of q.items) if (!it.summary) await planner('summarize', { judgmentId: it.id })
const row = (await planner('couples')).items.find((x: any) => x.id === coupleId)
const desk = await br.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'ko-KR' })
await desk.addInitScript(([pass, couple]) => {
  localStorage.setItem('planner:passcode', pass)
  localStorage.setItem('planner:couple', couple)
}, [process.env.PLANNER_PASSCODE ?? '', JSON.stringify(row)])
const d = await desk.newPage()
await d.goto(`${B}/p/queue`, { waitUntil: 'networkidle' }); await d.waitForTimeout(2000)
const card = d.locator('.qcard').filter({ has: d.locator('.queue-top span', { hasText: /^은퇴 후 월 생활비$/ }) }).first()
await card.locator('input.field').evaluate(e => e.remove())   // 메모 칸은 빼고 요약까지만
const box = (await card.boundingBox())!, sum = (await card.locator('p.summary').boundingBox())!
await d.screenshot({ path: `${OUT}/card.png`, clip: { x: box.x, y: box.y, width: box.width, height: sum.y + sum.height - box.y + 20 } })
console.log('AI 요약:\n' + (await card.locator('p.summary').innerText()))

// ── 4) 그림 합치기 (설명 글 없이 화면만) ──
const img = (n: string) => `data:image/png;base64,${readFileSync(`${OUT}/${n}.png`).toString('base64')}`
const page = await (await br.newContext({ deviceScaleFactor: 2 })).newPage()
const css = `body{margin:0;background:#fff}#f{display:inline-flex;gap:36px;align-items:flex-start;padding:24px;background:#f4f1ed}
.dk{border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.12);border:1px solid #ddd;background:#fff}
.ph{border-radius:28px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.15);border:6px solid #222;background:#fff}`
async function fig(name: string, body: string) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="f">${body}</div></body></html>`)
  await page.waitForTimeout(500)
  await page.locator('#f').screenshot({ path: `${OUT}/${name}.png` })
  console.log('·', name)
}
await fig('answer', `<div class="ph"><img src="${img('husband')}" style="width:300px;display:block"></div><div class="ph"><img src="${img('wife')}" style="width:300px;display:block"></div>`)
await fig('summary', `<div class="dk"><img src="${img('card')}" style="width:1000px;display:block"></div>`)
await br.close()

// ── 5) 촬영용 부부 보관 ──
await planner('archive_couple', { coupleId })
await planner('hide_couple', { coupleId })
console.log('촬영용 부부 보관함')
