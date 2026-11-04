/**
 * 화면 흐름도 PDF → docs/11_화면흐름도.pdf
 * 데모 모드(Supabase env 비움) 서버를 띄운 뒤 실행한다 — 실제 DB 를 건드리지 않고, 데이터가 늘 같다.
 *
 *   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5180 --host 127.0.0.1
 *   node scripts/flow-pdf.mjs                      # 다른 터미널
 *
 * 11.04: 앱 화면의 부연 설명은 여기로 옮겼다. 흐름도도 단순하게 — 1쪽 큰 그림, 화면 쪽은 한 줄씩, 자세한 설명은 마지막 쪽에만.
 * 캡처는 build/flow/ 에 남는다(커밋 안 함). 크로미움은 playwright 것을 쓴다 (PW_CHROMIUM 으로 바꿀 수 있음).
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const B = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5180'
const OUT = resolve('build/flow')
const PDF = resolve('docs/11_화면흐름도.pdf')
const TODAY = '2026-11-04'
mkdirSync(OUT, { recursive: true })

const br = await chromium.launch({ args: ['--lang=ko-KR'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) })  // 파일 고르기 버튼도 한국어로
const shotOpts = { type: 'jpeg', quality: 86 }

// ── 부부 폰 (아이폰 사파리로 보이게 — 홈 화면 추가 안내가 뜬다) ──────────────────
const phone = await br.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
const p = await phone.newPage()
async function shot(url, name, prep, full = false) {
  if (url) await p.goto(B + url, { waitUntil: 'networkidle' })
  if (prep) await prep(p)
  await p.waitForTimeout(400)
  await p.screenshot({ ...shotOpts, path: `${OUT}/${name}.jpg`, fullPage: full })
  console.log('·', name)
}
await shot('/c/join', 'c1-join', async pg => {
  await pg.fill('input.code-field', '482913')
  await pg.click('button.role:has-text("남편")')
}, true)
await shot('/c/home', 'c2-home-match')
await shot('/c/round/baseline', 'c4-round', async pg => { await pg.click('button:has-text("아니요, 바뀌었어요")'); await pg.selectOption('select[aria-label="연도"]', '2029'); await pg.selectOption('select[aria-label="월"]', '09') })
await shot('/c/wait/baseline', 'c5-wait')
await shot('/c/done/baseline', 'c6-done')
// 바뀐 게 있어요 (11.04)
await shot('/c/home', 'c3-home-plan', async pg => {
  await pg.click('button[role=tab]:has-text("내 설계")')
  await pg.click('button.plan-card:has-text("주거")')
})
await shot('/c/change/home_when', 'c7-change', async pg => { await pg.selectOption('select[aria-label="연도"]', '2031'); await pg.selectOption('select[aria-label="월"]', '03') })
await shot(null, 'c8-change-sent', async pg => { await pg.click('button:has-text("설계사님께 알리기")') })

// ── 설계사 콘솔 (노트북) ────────────────────────────────────────────────
const desk = await br.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'ko-KR' })
const d = await desk.newPage()
async function dshot(url, name, prep, el) {
  if (url) await d.goto(B + url, { waitUntil: 'networkidle' })
  if (prep) await prep(d)
  await d.waitForTimeout(400)
  if (el) await d.locator(el).first().screenshot({ ...shotOpts, path: `${OUT}/${name}.jpg` })
  else await d.screenshot({ ...shotOpts, path: `${OUT}/${name}.jpg` })
  console.log('·', name)
}
// 설계사 쪽 (11.04): 준비 → 결과 보기 → 계획 바꾸기. 엑셀은 가상고객 파일 (FLOW_XLSX 로 바꿀 수 있음)
const XLSX = process.env.FLOW_XLSX ?? `${process.env.HOME}/Desktop/공모전/AFPK 영 플래너/에이피_에피케_재무설계.xlsx`
const hasXlsx = existsSync(XLSX)
await dshot('/p/couples', 'p1-couples')
await dshot(null, 'p2-new-couple', async pg => {
  if (hasXlsx) await pg.setInputFiles('#imp-statement', XLSX)
  await pg.waitForTimeout(600)
}, 'main .editor')
await dshot('/p/cards', 'p5-extract', async pg => {
  await pg.click('button:has-text("엑셀로 만들기")')
  if (hasXlsx) { await pg.setInputFiles('#xlsx-statement', XLSX); await pg.waitForSelector('text=확인한', { timeout: 15000 }) }
  // 예시 모드 안내 줄은 그림에서 뺀다 (실제 설계사 화면엔 없다)
  await pg.evaluate(() => document.querySelectorAll('.note').forEach(e => { if (e.textContent?.includes('예시 모드')) e.remove() }))
}, 'main .editor')
await dshot('/p/queue', 'p3-queue', null, 'main')
await dshot('/p/cards', 'p4-card-view', async pg => { await pg.locator('.card-row').first().click() }, 'main .cards-layout')
await dshot('/p/history', 'p7-history', null, 'main')
const invite = await d.evaluate(async () => {
  const m = await import('/src/lib/install.ts')
  return m.inviteMessage({ husband: '에이피', wife: '에피케', code: '482913', url: 'https://afpk-dongunghap.vercel.app/c/join?code=482913' })
})


// ── PDF (5쪽) ─────────────────────────────────────────────────────────
const img = n => `file://${OUT}/${n}.jpg`
const phoneFig = (n, cap) => `<figure class="ph"><img src="${img(n)}"><figcaption>${cap}</figcaption></figure>`
const deskFig = (n, cap, h = 62) => `<figure class="dk"><img src="${img(n)}" style="height:${h}mm"><figcaption>${cap}</figcaption></figure>`
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const step = (n, t) => `<span class="sn">${n}</span><b>${t}</b>`

// 1쪽 큰 그림: 세 줄(설계사 · 부부 폰 · 앱) 위에 상자 8개
const W = 135, H = 78, X = [100, 265, 430, 595, 760, 925], LANE = [0, 135, 270], Y = LANE.map(t => t + 24)
const box = (c, l, title, lines, opt = {}) => {
  const x = X[c], y = Y[l]
  return `<g><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12" fill="${opt.fill ?? '#fff'}" stroke="${opt.stroke ?? '#e4dcd6'}" stroke-width="1.5"${opt.dash ? ' stroke-dasharray="5 4"' : ''}/>
    <text x="${x + 12}" y="${y + 27}" class="bt">${title}</text>
    ${lines.map((t, i) => `<text x="${x + 12}" y="${y + 48 + i * 16}" class="bs">${t}</text>`).join('')}</g>`
}
const lane = (l, label, fill) => `<rect x="0" y="${LANE[l]}" width="1075" height="125" rx="14" fill="${fill}"/><text x="48" y="${LANE[l] + 68}" class="ln" text-anchor="middle">${label}</text>`
const cx = c => X[c] + W / 2
const svg = `<svg viewBox="0 0 1075 395" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
<style>.bt{font:700 15px sans-serif;fill:#2b2a33}.bs{font:12px sans-serif;fill:#6d6674}.ln{font:700 14px sans-serif;fill:#5f5866}.al{font:600 11.5px sans-serif;fill:#8a8391}</style>
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8a8391"/></marker>
<marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b8860b"/></marker></defs>
${lane(0, '설계사', '#f4f1f6')}${lane(1, '부부 폰', '#eef3fd')}${lane(2, '앱', '#edf7f1')}
${box(0, 0, '① 등록', ['엑셀 → 질문 카드', '안내문 · QR 보내기'])}
${box(1, 1, '② 입장', ['코드 → 남편 / 아내'])}
${box(2, 1, '③ 따로 답하기', ['계획을 보여 주고', '"지금도 맞나요?"'])}
${box(3, 2, '④ 3자 비교', ['남편 · 아내 · 계획', '말로 쓴 답만 AI'])}
${box(4, 0, '⑤ 처리 대기', ['어긋난 것만 올라옴', '재설계 · 상담 · 같은 뜻'])}
${box(5, 0, '⑥ 다시 읽기', ['엑셀에서 다시 설계', '바뀐 숫자만 반영'])}
${box(4, 1, '바뀐 게 있어요', ['언제든 한 사람이', '설계사에게만'], { fill: '#fdf6e3', stroke: '#e0c36a', dash: true })}
${box(5, 2, '새 버전', ['예전 값은 이력에'])}
<path d="M${X[0] + W},${Y[0] + 39} H${cx(1)} V${Y[1]}" fill="none" stroke="#8a8391" stroke-width="1.6" marker-end="url(#a)"/>
<path d="M${X[1] + W},${Y[1] + 39} H${X[2]}" fill="none" stroke="#8a8391" stroke-width="1.6" marker-end="url(#a)"/>
<path d="M${cx(2)},${Y[1] + H} V${Y[2] + 39} H${X[3]}" fill="none" stroke="#8a8391" stroke-width="1.6" marker-end="url(#a)"/>
<path d="M${X[3] + W},${Y[2] + 39} H${X[4] - 15} V${Y[0] + 39} H${X[4]}" fill="none" stroke="#8a8391" stroke-width="1.6" marker-end="url(#a)"/>
<text x="${X[4] - 22}" y="${Y[1] + 50}" class="al" text-anchor="end">어긋난 것만</text>
<path d="M${cx(4)},${Y[1]} V${Y[0] + H}" fill="none" stroke="#b8860b" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#b)"/>
<text x="${cx(4) + 8}" y="${Y[1] - 10}" class="al" style="fill:#a07a12">판정 없이</text>
<path d="M${X[4] + W},${Y[0] + 39} H${X[5]}" fill="none" stroke="#8a8391" stroke-width="1.6" marker-end="url(#a)"/>
<path d="M${cx(5)},${Y[0] + H} V${Y[2]}" fill="none" stroke="#8a8391" stroke-width="1.6" marker-end="url(#a)"/>
</svg>`

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: #2b2a33; margin: 0; font-size: 10.5pt; line-height: 1.55; }
svg text { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif !important; }
.page { page-break-after: always; height: 184mm; display: flex; flex-direction: column; gap: 4mm; overflow: hidden; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 24pt; margin: 0; letter-spacing: -0.02em; }
h2 { font-size: 16pt; margin: 0; letter-spacing: -0.01em; }
.eyebrow { font-size: 9pt; color: #8a8391; letter-spacing: 0.04em; }
.lead { color: #5f5866; margin: 0; }
.rules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: auto; }
.rule { background: #2b2a33; color: #fff; border-radius: 4mm; padding: 3mm 4mm; }
.rule b { display: block; margin-bottom: 0.5mm; }
.rule small { color: #d7d1db; font-size: 9pt; }
.row { display: flex; gap: 5mm; align-items: flex-start; flex: 1; min-height: 0; }
.ph { margin: 0; flex: 1; min-width: 0; }
.ph img { width: 100%; max-height: 132mm; object-fit: contain; object-position: top; border-radius: 4mm; border: 0.3mm solid #e4dcd6; }
figcaption { font-size: 9.5pt; color: #4a4450; margin-top: 2mm; line-height: 1.45; }
.grid4 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 6mm; flex: 1; min-height: 0; }
.dk { margin: 0; min-height: 0; display: flex; flex-direction: column; }
.dk img { width: 100%; height: 62mm; object-fit: cover; object-position: top left; border-radius: 3mm; border: 0.3mm solid #e4dcd6; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; flex: 1; min-height: 0; }
.col { display: flex; flex-direction: column; gap: 3mm; }
.box { background: #fff7f2; border-radius: 3mm; padding: 3mm 4mm; }
.box h3 { margin: 0 0 1.5mm; font-size: 11pt; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; }
th, td { text-align: left; padding: 1.3mm 2mm; border-bottom: 0.3mm solid #eee5df; vertical-align: top; }
th { color: #8a8391; font-weight: 500; font-size: 8.5pt; }
ul { margin: 0; padding-left: 5mm; font-size: 9.2pt; } li { margin: 0.5mm 0; }
.chip { display: inline-block; font-size: 8pt; font-weight: 700; padding: 0.2mm 2mm; border-radius: 10mm; white-space: nowrap; }
.g { background: #e4f5ec; color: #1f7a52; } .y { background: #fdf1dc; color: #a86a12; } .r { background: #fde6e5; color: #c0392b; }
.foot { font-size: 8.5pt; color: #6d6674; margin-top: auto; }
.three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; flex: 1; min-height: 0; }
.sn { display: inline-grid; place-items: center; width: 6mm; height: 6mm; border-radius: 50%; background: #2b2a33; color: #fff; font-size: 8.5pt; font-weight: 700; margin-right: 1.5mm; vertical-align: 0.2mm; }
pre.msg { white-space: pre-wrap; font-family: inherit; font-size: 8.2pt; background: #fff; border: 0.3mm solid #e4dcd6; border-radius: 3mm; padding: 3mm 3.5mm; margin: 0; line-height: 1.45; height: 62mm; overflow: hidden; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm 6mm; }
.node { border-radius: 4mm; padding: 3.5mm 4mm; background: #fff7f2; border: 0.4mm solid #f0e6df; position: relative; }
.node b { display: block; font-size: 10.5pt; margin-bottom: 0.8mm; }
.node small { color: #6d6674; font-size: 8.8pt; display: block; }
.node:not(:last-child)::after { content: '→'; position: absolute; right: -5mm; top: 50%; transform: translateY(-50%); color: #b3aab4; font-size: 12pt; }
.side { display: flex; flex-direction: column; gap: 2.5mm; }
.side .box p { margin: 0; font-size: 9.2pt; }
</style></head><body>

<section class="page">
  <div class="eyebrow">돈궁합 · 부부 재무설계 점검 · AFPK 영 플래너 챌린지 2026 · ${TODAY} 기준</div>
  <h1>화면 흐름도</h1>
  <p class="lead">설계사가 세운 계획이 두 분에게 <b>지금도 맞는지</b> 따로 묻고, <b>어긋난 것만</b> 설계사에게 알립니다. <b>앱은 듣고, 설계사가 말합니다.</b></p>
  ${svg}
  <div class="rules">
    <div class="rule"><b>서로의 답은 안 보인다</b><small>판정도 상대의 답도 부부 폰에서는 볼 수 없다</small></div>
    <div class="rule"><b>AI는 판단을 돕기만 한다</b><small>말로 쓴 답의 뜻 비교와 요약만. 계산 · 조언 · 계획 수정은 안 한다</small></div>
    <div class="rule"><b>기록은 지워지지 않는다</b><small>계획을 바꾸면 새 버전이 쌓이고 예전 값이 남는다</small></div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">② ③ 부부 폰</div>
  <h2>두 분이 각자 답합니다</h2>
  <div class="row">
    ${phoneFig('c1-join', '<b>입장</b> — 코드와 남편 / 아내')}
    ${phoneFig('c2-home-match', '<b>홈</b> — 설계사가 열면 시작')}
    ${phoneFig('c4-round', '<b>답하기</b> — 계획을 보고 "그대로 / 바뀌었어요"')}
    ${phoneFig('c5-wait', '<b>대기</b> — 상대는 몇 개 답했는지만')}
    ${phoneFig('c6-done', '<b>끝</b> — 판정은 보여 주지 않는다')}
  </div>
</section>

<section class="page">
  <div class="eyebrow">부부 폰 — 바뀐 게 있어요</div>
  <h2>사정이 바뀌면 기다리지 않고 설계사에게만 알립니다</h2>
  <div class="row" style="max-width:190mm;width:100%;margin:0 auto">
    ${phoneFig('c3-home-plan', '<b>내 설계</b> — 계획마다 "바뀐 게 있어요"')}
    ${phoneFig('c7-change', '<b>바뀐 내용</b> — 답하기와 같은 입력')}
    ${phoneFig('c8-change-sent', '<b>전달됨</b> — 배우자에게는 안 보인다')}
  </div>
</section>

<section class="page">
  <div class="eyebrow">① 설계사 — 준비</div>
  <h2>엑셀을 올려 질문 카드를 만들고, 두 분께 안내문을 보냅니다</h2>
  <div class="three">
    ${deskFig('p2-new-couple', `${step(1, '새 부부 등록')} — 엑셀을 올리면 파일 이름에서 두 분 이름이 채워진다`, 112)}
    ${deskFig('p5-extract', `${step(2, '카드 고르기')} — 엑셀 항목이 그대로 카드 후보가 된다. 물어볼 것만 골라 저장`, 112)}
    <figure class="dk"><pre class="msg" style="height:112mm">${esc(invite)}</pre><figcaption>${step(3, '안내문 보내기')} — "안내문 복사" → 카톡. QR도 있다</figcaption></figure>
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑤ 설계사 — 결과 보기</div>
  <h2>두 분이 다 답하면 어긋난 것만 처리 대기에 올라옵니다</h2>
  <div class="two" style="grid-template-columns: 1.5fr 1fr">
    <img src="${img('p3-queue')}" style="width:100%;max-height:150mm;object-fit:cover;object-position:top left;border-radius:3mm;border:0.3mm solid #e4dcd6">
    <div class="side">
      <div class="box">${step(4, '처리 대기 열기')}<p style="margin-top:1.5mm">부부 목록의 "처리 대기 N"이 볼 건의 수다</p></div>
      <div class="box">${step(5, '카드 한 장씩 읽기')}<p style="margin-top:1.5mm">계획 · 남편 답 · 아내 답이 나란히. 🔴 건은 AI가 세 줄로 요약해 둔다</p></div>
      <div class="box">${step(6, '버튼 하나로 닫기')}<p style="margin-top:1.5mm"><b>재설계 필요</b> → 다음 쪽<br><b>상담 때 다루기</b> → 다음 상담 안건<br><b>이건 같은 뜻이에요</b> → AI 오판 기록</p></div>
      <div class="box">${step('+', '먼저 알린 변화')}<p style="margin-top:1.5mm">한 분이 "바뀐 게 있어요"로 알린 것. 맨 위에 따로 보인다. <b>두 분께 같이 묻기</b>를 누르면 그 카드 한 문항이 두 분 폰에 열린다</p></div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑥ 설계사 — 계획 바꾸기</div>
  <h2>계획은 엑셀에서 고치고, 앱은 바뀐 숫자만 받아 옵니다</h2>
  <div class="steps">
    <div class="node"><b>7 · 엑셀에서 다시 설계</b><small>처음 만든 그 엑셀 파일을 고치고 저장</small></div>
    <div class="node"><b>8 · "엑셀 다시 읽기"</b><small>질문 카드 맨 위 버튼 (처음 한 번 "이 컴퓨터 파일로 연결")</small></div>
    <div class="node"><b>9 · 바뀐 숫자만 반영</b><small>"지금 카드 → 엑셀"로 보이는 것만 골라 반영. 그대로인 건 건드리지 않는다</small></div>
    <div class="node"><b>10 · 새 버전 · 이력</b><small>카드가 v2가 되고 두 분 [내 설계]에 보인다. 예전 값은 이력에</small></div>
  </div>
  <div class="grid4" style="grid-template-columns: 1.2fr 1fr">
    ${deskFig('p4-card-view', '<b>질문 카드</b> — 앱 안에서는 계획을 고치지 않는다. 두 분 폰에 어떻게 나가는지만 보인다', 98)}
    ${deskFig('p7-history', '<b>변경 이력</b> — 언제 · 무엇이 · 왜 바뀌었는지 모두 남는다', 98)}
  </div>
</section>

<section class="page">
  <div class="eyebrow">자세한 설명</div>
  <h2>판정 · 버튼 · 엑셀 규칙</h2>
  <div class="two">
    <div class="col">
      <div class="box"><h3>판정 — 두 답이 각각 계획과 맞나, 서로 맞나</h3>
        <table>
          <tr><th>상황</th><th>판정</th><th>설계사에게</th></tr>
          <tr><td>둘 다 계획과 같음</td><td><span class="chip g">🟢</span></td><td>올라오지 않음</td></tr>
          <tr><td>조금 다름</td><td><span class="chip y">🟡</span></td><td>다음에 다시 묻는다. 두 번 연속이면 🔴</td></tr>
          <tr><td>두 분은 같은데 계획과 크게 다름</td><td><span class="chip r">🔴 전제 폐기</span></td><td>계획이 낡음 → 재설계</td></tr>
          <tr><td>두 분이 서로 다르게 앎</td><td><span class="chip r">🔴 부부 불일치</span></td><td>상담 안건</td></tr>
          <tr><td>해석 못 함 ("애 낳고 나서")</td><td><span class="chip y">🟡 확인 필요</span></td><td>추측하지 않고 설계사에게</td></tr>
        </table>
        <p style="margin:2mm 0 0;font-size:9pt;color:#5f5866">금액 · 시점 · 보기는 규칙으로, 말로 쓴 답만 AI가 뜻을 비교한다. 🔴 건은 AI가 세 줄로 요약한다(사실 · 영향 · 물어볼 것).</p>
      </div>
      <div class="box"><h3>처리 대기 버튼</h3>
        <table>
          <tr><td style="width:32%"><b>재설계 필요</b></td><td>엑셀에서 다시 설계하고 "엑셀 다시 읽기"로 반영</td></tr>
          <tr><td><b>상담 때 다루기</b></td><td>메모를 남기고 다음 상담 안건으로</td></tr>
          <tr><td><b>이건 같은 뜻이에요</b></td><td>AI 오판으로 기록 → 규칙을 고칠 때 시험 사례</td></tr>
          <tr><td><b>두 분께 같이 묻기</b></td><td>"바뀐 게 있어요"에만. 그 카드 한 문항으로 두 분께 묻는다</td></tr>
        </table>
      </div>
    </div>
    <div class="col">
      <div class="box"><h3>엑셀</h3>
        <ul>
          <li>표의 항목 이름과 금액을 <b>그대로</b> 옮긴다. 숫자는 AI를 거치지 않는다 ("만원"만 원으로)</li>
          <li>엑셀은 한 파일 — 재무상태표와 현금흐름표가 한 시트에. 파일 이름이 "남편이름_아내이름_재무설계.xlsx"면 이름이 채워진다</li>
          <li>정해 둔 표 양식만 읽는다. 양식이 아니면 "읽지 못했습니다"</li>
          <li><b>다시 읽기</b> — 파일을 한 번 연결해 두면, 엑셀을 고쳐 저장하고 버튼만 누른다. 바뀐 숫자만 보이고, 그대로인 항목은 다시 만들지 않는다</li>
          <li>맞춰보기에서 묻는 중인 카드는 반영할 수 없다. 파일 연결은 크롬 · 엣지 컴퓨터에서만</li>
        </ul>
      </div>
      <div class="box"><h3>부부 화면</h3>
        <ul>
          <li>제출하거나 알린 뒤에는 고칠 수 없다</li>
          <li>날짜로 말하기 어려우면 조건으로 답한다 → 설계사가 직접 확인</li>
          <li>맞춰보기는 3개월마다. 열리면 탭에 빨간 점</li>
          <li>"바뀐 게 있어요"는 판정하지 않고 AI도 쓰지 않는다. 설계사가 처리하면 다시 알릴 수 있다</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="foot">지금 상태: 자동 점검 107개 · 처음부터 끝까지 시험 39단계 통과 · AI 판단 새 10건 중 8건(다른 날 7건). 화면 그림은 예시 데이터라 이름이 "김현우 · 박지우"로 보인다.</div>
</section>
<section class="page">
  <div class="eyebrow">다음 단계 — 아직 없는 기능</div>
  <h2>카드 골라 맞춰보기 열기</h2>
  <div class="two">
    <div class="col">
      <div class="box"><h3>지금은</h3>
        <p>첫 맞춰보기는 <b>정해 둔 카드 3장</b>(주택 취득 시점 · 승진·이직 계획 · 양가 지원)으로 열린다. 연습용 카드 10장으로 만든 부부에게는 이 3장이 있어서 바로 열린다.</p>
      </div>
      <div class="box"><h3>그래서 생기는 일</h3>
        <p><b>엑셀로 만든 부부</b>(예: 에이피 · 에피케)는 카드가 남편 급여 · 월세 · 적금 같은 엑셀 항목이라 이 3장이 없다. 카드는 있는데 <b>두 분께 물어볼 방법이 없다.</b> "엑셀 등록 → 두 분이 답하기 → 처리 대기"가 한 부부로 이어지지 않는다.</p>
      </div>
      <div class="box"><h3>만들면</h3>
        <ul>
          <li>설계사가 <b>물어볼 카드를 직접 골라</b> 맞춰보기를 연다</li>
          <li>바뀌는 건 "무엇을 물을지 설계사가 고른다" 하나. 판정 · 처리 대기 · 부부 화면은 그대로</li>
          <li>AI는 쓰지 않는다</li>
          <li>가상고객으로 처음부터 끝까지 시연할 수 있다 — "남편 연 급여 6,700만 원, 지금도 그렇게 생각하시나요?"</li>
        </ul>
      </div>
    </div>
    <div class="col">
      <div class="box" style="background:#fff;border:0.4mm dashed #d8cdc6"><h3>만들면 이런 모양 (그림 예시)</h3>
        <table style="font-size:9.5pt">
          <tr><td style="width:8mm">☑</td><td>남편 연 급여(세전)</td><td style="text-align:right">6,700만원</td></tr>
          <tr><td>☐</td><td>아내 연 매출</td><td style="text-align:right">4,000만원</td></tr>
          <tr><td>☑</td><td>월세 (1년)</td><td style="text-align:right">1,140만원</td></tr>
          <tr><td>☑</td><td>보증금</td><td style="text-align:right">2,000만원</td></tr>
          <tr><td>☐</td><td>적금 (1년)</td><td style="text-align:right">500만원</td></tr>
        </table>
        <p style="margin:3mm 0 0"><span class="chip" style="background:#2b2a33;color:#fff;padding:1mm 3mm">고른 3장으로 맞춰보기 열기</span></p>
        <p style="margin:3mm 0 0;font-size:9.2pt;color:#5f5866">→ 두 분 폰에 "정기 맞춰보기 · 3문항" → 답하면 지금처럼 판정 → 처리 대기</p>
        <p style="margin:2mm 0 0;font-size:9.2pt;color:#5f5866">이미 열린 맞춰보기가 있으면 열지 않고 "끝난 뒤 다시"</p>
      </div>
      <div class="box"><h3>정할 것</h3>
        <p>제출 전에 만들지(반나절), 보고서에 "다음 단계"로만 적을지. 만들지 않으면 폰 테스트 · 시연은 연습 부부로, 엑셀은 "카드 만들기"까지만 보여 준다.</p>
      </div>
    </div>
  </div>
</section>
</body></html>`
writeFileSync(`${OUT}/flow.html`, html)
const pg = await (await br.newContext()).newPage()
await pg.goto(`file://${OUT}/flow.html`, { waitUntil: 'load' })
await pg.pdf({ path: PDF, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })
await br.close()
console.log('→', PDF)
