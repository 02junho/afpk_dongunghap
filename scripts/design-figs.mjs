/**
 * 앱설계서에 넣을 실제 앱 화면 그림 6장 (11.14). 설명 글은 문서 본문에 있으므로 그림에는 화면만 넣는다.
 *   데모 서버(예시 데이터): VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5180 --host 127.0.0.1
 *   node scripts/design-figs.mjs   → build/figs/fig1~6.png
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const B = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5180'
const OUT = resolve('build/figs')
mkdirSync(OUT, { recursive: true })
const br = await chromium.launch({ args: ['--lang=ko-KR'] })
const WORD = { name: '에이피_에피케_재무설계', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('demo') }
const hideTest = pg => pg.evaluate(() => {
  document.querySelectorAll('button').forEach(b => { if (b.textContent?.includes('(테스트용)')) b.remove() })
  document.querySelectorAll('.note, .will').forEach(e => { if (e.textContent?.includes('예시 모드')) e.remove() })
  document.querySelectorAll('.note').forEach(e => { e.textContent = (e.textContent ?? '').replace('(예시) ', '') })
})

// ── 부부 폰 ──
const phone = await br.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
const p = await phone.newPage()
const pshot = async (name, url, prep) => {
  if (url) await p.goto(B + url, { waitUntil: 'networkidle' })
  if (prep) await prep(p)
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/${name}.png` })
}
await pshot('c-home', '/c/home')
await pshot('c-choice', '/c/round/baseline', async pg => { await pg.locator('.pick').first().click() })
await pshot('c-number', null, async pg => {
  await pg.click('button:has-text("제출")'); await pg.waitForTimeout(300)
  await pg.fill('input.field', '4억 8천')
})
await pshot('c-done', '/c/done/baseline')

// ── 설계사 노트북 (화면 전체) ──
const desk = await br.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'ko-KR' })
const d = await desk.newPage()
const dshot = async (name, url, prep, el) => {
  if (url) await d.goto(B + url, { waitUntil: 'networkidle' })
  if (prep) await prep(d)
  await d.waitForTimeout(400)
  if (el) await d.locator(el).first().screenshot({ path: `${OUT}/${name}.png` })
  else await d.screenshot({ path: `${OUT}/${name}.png` })
}
const realUrl = pg => pg.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n; (n = w.nextNode());) if (n.nodeValue?.includes('127.0.0.1:5180')) n.nodeValue = n.nodeValue.replace('http://127.0.0.1:5180', 'https://afpk-dongunghap.vercel.app')
})
await dshot('p-couples', '/p/couples', async pg => { await hideTest(pg); await realUrl(pg) })
await dshot('p-template', '/p/template', async pg => {
  await pg.setInputFiles('#tpl-word', WORD); await pg.waitForTimeout(300)
  const boxes = pg.locator('input[type=checkbox]')
  for (const i of [0, 1]) await boxes.nth(i).check()
  await hideTest(pg)
})
await dshot('p-queue', '/p/queue', hideTest)
await dshot('p-cycle', '/p/cycle', hideTest)
// 일치 · 불일치: 카드 윗부분(판정 · 계획 · 두 답)만
async function cardTop(name, nth) {
  const el = d.locator('.qcard').nth(nth)
  const box = await el.boundingBox(), dl = await el.locator('dl.pair').boundingBox()
  await d.screenshot({ path: `${OUT}/${name}.png`, clip: { x: box.x, y: box.y, width: box.width, height: dl.y + dl.height - box.y + 18 } })
}
await d.goto(B + '/p/queue', { waitUntil: 'networkidle' }); await hideTest(d); await d.waitForTimeout(300)
await cardTop('q-card1', 0); await cardTop('q-card2', 1); await cardTop('q-card3', 2)

// ── 그림 합치기 ──
const img = n => `data:image/png;base64,${readFileSync(`${OUT}/${n}.png`).toString('base64')}`
const page = await (await br.newContext({ deviceScaleFactor: 2 })).newPage()
const css = `body{margin:0;background:#fff;font-family:sans-serif}
#f{display:inline-flex;gap:28px;align-items:flex-start;padding:24px;background:#f4f1ed}
.dk{border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.12);border:1px solid #ddd;background:#fff}
.ph{border-radius:28px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.15);border:6px solid #222;background:#fff}
.col{display:flex;flex-direction:column;gap:20px}`
async function fig(name, body) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="f">${body}</div></body></html>`)
  await page.waitForTimeout(500)
  await page.locator('#f').screenshot({ path: `${OUT}/${name}.png` })
  console.log('·', name)
}
const dk = (n, w) => `<div class="dk"><img src="${img(n)}" style="width:${w}px;display:block"></div>`
const ph = (n, w = 300) => `<div class="ph"><img src="${img(n)}" style="width:${w}px;display:block"></div>`
await fig('fig1', dk('p-couples', 900) + ph('c-home', 270))
await fig('fig2', dk('p-template', 1100))
await fig('fig3', ph('c-home') + ph('c-choice') + ph('c-number') + ph('c-done'))
await fig('fig4', dk('p-queue', 1100))
await fig('fig5', dk('p-cycle', 1100))
await fig('fig6', `<div class="col">${dk('q-card1', 900)}${dk('q-card2', 900)}${dk('q-card3', 900)}</div>`)
await br.close()
