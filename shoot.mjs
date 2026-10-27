/**
 * 화면 스크린샷 10장 → shots/. `npm run dev -- --port 5180` 띄운 뒤 `npm run shots`.
 * 크로미움 경로는 환경마다 다르다. 지정하지 않으면 playwright 가 설치한 것을 쓴다
 * (`npx playwright install chromium`). 다른 경로를 쓰려면 PW_CHROMIUM=/path/to/chrome.
 */
import { chromium } from 'playwright'
const B = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5180'
const br = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})

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
await shot('/c/home', '2-홈-맞춰보기')
await shot('/c/home', '2b-홈-내설계', async pg => { await pg.click('text=내 설계') })
await shot('/c/round/baseline', '3-문답', async pg => {
  // 첫 카드는 시점(연·월 선택). 2029년을 고른 상태를 찍는다
  await pg.click('button:has-text("아니요, 바뀌었어요")'); await pg.selectOption('select[aria-label="연도"]', '2029'); await pg.selectOption('select[aria-label="월"]', '09')
})
await shot('/c/wait/baseline', '4-대기')
await shot('/c/done/baseline', '5-전달완료')

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
