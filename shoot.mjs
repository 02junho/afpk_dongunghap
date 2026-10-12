import { chromium } from 'playwright'
const B = 'http://127.0.0.1:5180'
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

// 폰
const phone = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const p = await phone.newPage()

async function shot(url, name, prep) {
  await p.goto(B + url, { waitUntil: 'networkidle' })
  if (prep) await prep(p)
  await p.waitForTimeout(500)
  await p.screenshot({ path: `shots/${name}.png`, fullPage: true })
  console.log(name)
}

await shot('/c/join', '1-코드입력', async pg => {
  await pg.fill('input', '482913')
  await pg.click('text=남편')
})
await shot('/c/home', '2-홈')
await shot('/c/round/baseline', '3-문답', async pg => {
  await pg.fill('textarea', '2029년쯤 생각하고 있어요')
})
await shot('/c/wait/baseline', '4-대기')
await shot('/c/result/baseline', '5-결과')

// 데스크톱
const desk = await br.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
const d = await desk.newPage()
async function dshot(url, name) {
  await d.goto(B + url, { waitUntil: 'networkidle' })
  await d.waitForTimeout(500)
  await d.screenshot({ path: `shots/${name}.png`, fullPage: true })
  console.log(name)
}
await dshot('/p/couples', '6-설계사-커플목록')
await dshot('/p/queue', '7-설계사-처리대기')
await dshot('/p/cards', '8-설계사-카드수정')
await dshot('/p/history', '9-설계사-변경이력')

await br.close()
