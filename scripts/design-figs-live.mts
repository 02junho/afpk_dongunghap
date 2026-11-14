/**
 * 앱설계서 그림 6장 — 실제 DB 의 시연 부부로 찍는다 (11.14). scripts/make-report-couples.mts 로 만든 두 쌍:
 *   설계사 화면은 보고서 사례 이도윤 · 한서연(818793, 6주 끝 · 처리 대기 1건), 부부 폰은 직접 답해 보기 정우진 · 최하은(1주차).
 * 로컬 dev 서버(실제 DB 연결, /api 미들웨어)가 떠 있어야 한다:  npm run dev -- --port 5174
 *   node --env-file=.env --import tsx scripts/design-figs-live.mts
 * 설계사 코드는 .env 에서 읽어 브라우저 저장소에 넣는다 (출력하지 않는다).
 * 부부 폰은 남편 역할로 들어가 화면만 찍는다 (답은 제출하지 않는다).
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import plannerHandler from '../api/planner'

const B = process.env.SHOTS_BASE ?? 'http://localhost:5174'
const CODE = '818793'
const OUT = resolve('build/figs-live')
mkdirSync(OUT, { recursive: true })
const call = async (b: object) => (await plannerHandler(new Request('http://l/api/planner', { method: 'POST', body: JSON.stringify({ passcode: process.env.PLANNER_PASSCODE, ...b }) }))).json() as Promise<any>

const cs = await call({ action: 'couples' })
const row = (cs.couples ?? cs.items ?? cs).find((x: any) => x.code === CODE && !x.archivedAt)
if (!row) throw new Error('시연 부부 없음')
const tryout = (cs.couples ?? cs.items ?? cs).find((x: any) => x.label === '정우진 · 최하은' && !x.archivedAt)
if (!tryout) throw new Error('직접 답해 보기 부부 없음')

const br = await chromium.launch({ args: ['--lang=ko-KR'] })

// ── 부부 폰 (남편) ──
const phone = await br.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
const p = await phone.newPage()
const pshot = async (name: string) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}.png` }) }
await p.goto(`${B}/c/join`, { waitUntil: 'networkidle' })
await p.fill('input.code-field', tryout.code)
await p.click('button.role:has-text("남편")')
await p.click('button:has-text("시작하기")')
await p.waitForURL(/\/c\/home/, { timeout: 20000 })
await p.goto(`${B}/c/home`, { waitUntil: 'networkidle' })
await pshot('c-home')
await p.click('button:has-text("시작하기")')
await p.waitForURL(/\/c\/round\//, { timeout: 15000 })
await p.waitForTimeout(800)
await p.locator('button.pick').first().click()
await pshot('c-choice')
await p.click('button.pick-other')
await p.fill('textarea.field', '청약도 넣어 보고, 안 되면 기존 집을 사고 싶어요')
await pshot('c-other')
await p.goto(`${B}/c/home`, { waitUntil: 'networkidle' })
await p.click('button[role=tab]:has-text("내 설계")')
await pshot('c-plan')

// ── 설계사 노트북 ──
const desk = await br.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'ko-KR' })
await desk.addInitScript(([pass, couple]) => {
  localStorage.setItem('planner:passcode', pass)
  localStorage.setItem('planner:couple', couple)
}, [process.env.PLANNER_PASSCODE ?? '', JSON.stringify(row)])
const d = await desk.newPage()
const realUrl = () => d.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n: Node | null; (n = w.nextNode());) if (n.nodeValue?.includes('localhost:5174')) n.nodeValue = n.nodeValue.replace('http://localhost:5174', 'https://afpk-dongunghap.vercel.app')
})
const hideTest = () => d.evaluate(() => document.querySelectorAll('button').forEach(b => { if (b.textContent?.includes('(테스트용)')) b.remove() }))
// 문서 그림에는 시연 부부만 (팀원 연습 부부는 뺀다 — 11.14 예슬님 의견)
const onlyDemo = () => d.evaluate(() => document.querySelectorAll('.qcard').forEach(c => { if (!/이도윤 · 한서연|정우진 · 최하은/.test(c.textContent ?? '')) c.remove() }))
const dshot = async (name: string, url: string) => {
  await d.goto(B + url, { waitUntil: 'networkidle' }); await d.waitForTimeout(1500)
  await hideTest(); await realUrl(); if (url === '/p/couples') await onlyDemo()
  await d.screenshot({ path: `${OUT}/${name}.png` })
}
await dshot('p-couples', '/p/couples')
await dshot('p-template', '/p/template')
await dshot('p-queue', '/p/queue')
await dshot('p-cycle', '/p/cycle')
// 일치 · 불일치: 처리 대기 카드 윗부분(판정 · 계획 · 두 답)
await d.goto(B + '/p/queue', { waitUntil: 'networkidle' }); await d.waitForTimeout(1500)
const labels = await d.locator('.qcard .queue-top span[style*="font-weight"]').allTextContents()
console.log('처리 대기:', labels.join(' / '))
async function cardTop(name: string, label: string) {
  const el = d.locator('.qcard').filter({ has: d.locator('.queue-top span', { hasText: new RegExp(`^${label}$`) }) }).first()
  await el.scrollIntoViewIfNeeded()
  const box = (await el.boundingBox())!, dl = (await el.locator('dl.pair').boundingBox())!
  await d.screenshot({ path: `${OUT}/${name}.png`, clip: { x: box.x, y: box.y, width: box.width, height: dl.y + dl.height - box.y + 18 } })
}
await cardTop('q-a', '은퇴 후 월 생활비')

// ── 그림 합치기 (설명 글 없이 화면만) ──
const img = (n: string) => `data:image/png;base64,${readFileSync(`${OUT}/${n}.png`).toString('base64')}`
const page = await (await br.newContext({ deviceScaleFactor: 2 })).newPage()
const css = `body{margin:0;background:#fff}#f{display:inline-flex;gap:28px;align-items:flex-start;padding:24px;background:#f4f1ed}
.dk{border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.12);border:1px solid #ddd;background:#fff}
.ph{border-radius:28px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.15);border:6px solid #222;background:#fff}
.col{display:flex;flex-direction:column;gap:20px}`
const dk = (n: string, w: number) => `<div class="dk"><img src="${img(n)}" style="width:${w}px;display:block"></div>`
const ph = (n: string, w = 300) => `<div class="ph"><img src="${img(n)}" style="width:${w}px;display:block"></div>`
async function fig(name: string, body: string) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="f">${body}</div></body></html>`)
  await page.waitForTimeout(500)
  await page.locator('#f').screenshot({ path: `${OUT}/${name}.png` })
  console.log('·', name)
}
await fig('fig1', dk('p-couples', 900) + ph('c-home', 270))
await fig('fig2', dk('p-template', 1100))
await fig('fig3', ph('c-home') + ph('c-choice') + ph('c-other') + ph('c-plan'))
await fig('fig4', dk('p-queue', 1100))
await fig('fig5', dk('p-cycle', 1100))
await fig('fig6', dk('q-a', 900))
await br.close()
