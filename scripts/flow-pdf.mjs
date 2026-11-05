/**
 * 화면 흐름도 PDF → docs/11_화면흐름도.pdf
 * 데모 모드(Supabase env 비움) 서버를 띄운 뒤 실행한다 — 실제 DB 를 건드리지 않고, 데이터가 늘 같다.
 *
 *   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5180 --host 127.0.0.1
 *   node scripts/flow-pdf.mjs                      # 다른 터미널
 *
 * 11.05 새 방향: 재무설계 결과 → 질문 틀 30칸 → 6주 사이클(매주 1테마 5문항) → 객관식 답 → 계획과 다르면 🔴 → 확인함 → 상담 요청.
 * 앱 화면의 부연 설명은 여기로 옮겼다 — 1쪽 큰 그림, 화면 쪽은 한 줄씩, 자세한 설명은 마지막 쪽에만.
 * 캡처는 build/flow/ 에 남는다(커밋 안 함). 크로미움은 playwright 것을 쓴다 (PW_CHROMIUM 으로 바꿀 수 있음).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const B = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5180'
const OUT = resolve('build/flow')
const PDF = resolve('docs/11_화면흐름도.pdf')
const TODAY = '2026-11-05'
mkdirSync(OUT, { recursive: true })

const br = await chromium.launch({ args: ['--lang=ko-KR'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) })
const shotOpts = { type: 'jpeg', quality: 86 }
// 예시 모드에서는 파일 내용을 읽지 않는다 — 이름만 있으면 된다 (이름에서 남편 · 아내를 채운다)
// 11.05: 재무설계 결과가 Word 일지 PDF 일지 아직 모른다 → 흐름도에는 파일 형식을 쓰지 않는다
// 테스트용 버튼(예시 값으로 채우기 · 다음 주로 넘기기)은 캡처에서 뺀다
const hideTestButtons = pg => pg.evaluate(() => document.querySelectorAll('button').forEach(b => { if (b.textContent?.includes('(테스트용)')) b.remove() }))
const WORD = { name: '에이피_에피케_재무설계', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('demo') }

// ── 부부 폰 (아이폰 사파리로 보이게) ─────────────────────────────────────
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
await shot('/c/home', 'c2-home')
await shot('/c/round/baseline', 'c3-round', async pg => {
  await pg.click('button:has-text("아니요, 바뀌었어요")')
  await pg.locator('.pick').nth(2).click()
  await pg.evaluate(() => window.scrollTo(0, 260))
})
await shot('/c/done/baseline', 'c4-done')
await shot('/c/home', 'c5-plan', async pg => {
  await pg.click('button[role=tab]:has-text("내 설계")')
  await pg.locator('button.plan-card').first().click()
})

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
const hideDemoNotes = pg => pg.evaluate(() => document.querySelectorAll('.note, .will').forEach(e => { if (e.textContent?.includes('예시 모드')) e.remove() }))
await dshot('/p/couples', 'p1-new-couple', async pg => {
  await pg.setInputFiles('#imp-word', WORD)
  await hideDemoNotes(pg)
}, 'main .editor')
await dshot('/p/template', 'p2-word', async pg => {
  await pg.setInputFiles('#tpl-word', WORD)
  await pg.waitForTimeout(300)
  const boxes = pg.locator('input[type=checkbox]')
  for (const i of [0, 1, 2]) await boxes.nth(i).check()
  await hideTestButtons(pg)
  await pg.evaluate(() => document.querySelectorAll('.note').forEach(e => { e.textContent = (e.textContent ?? '').replace('(예시) ', '') }))
}, 'main')
await dshot('/p/template', 'p3-cycle-start', async pg => { await hideDemoNotes(pg) }, 'main .editor')
await dshot('/p/queue', 'p4-queue', null, 'main')
await dshot('/p/cycle', 'p5-cycle', hideTestButtons, 'main')
const invite = await d.evaluate(async () => {
  const m = await import('/src/lib/install.ts')
  return m.inviteMessage({ husband: '에이피', wife: '에피케', code: '482913', url: 'https://afpk-dongunghap.vercel.app/c/join?code=482913' })
})

// ── PDF ─────────────────────────────────────────────────────────────
const img = n => `file://${OUT}/${n}.jpg`
const phoneFig = (n, cap) => `<figure class="ph"><img src="${img(n)}"><figcaption>${cap}</figcaption></figure>`
const deskFig = (n, cap, h = 62) => `<figure class="dk"><img src="${img(n)}" style="height:${h}mm"><figcaption>${cap}</figcaption></figure>`
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const step = (n, t) => `<span class="sn">${n}</span><b>${t}</b>`

// 1쪽 큰 그림: 세 줄(설계사 · 부부 폰 · 앱) 위에 상자 6개 + 상담 요청
const W = 135, H = 78, X = [100, 265, 430, 595, 760, 925], LANE = [0, 135, 270], Y = LANE.map(t => t + 24)
const box = (c, l, title, lines, opt = {}) => {
  const x = X[c], y = Y[l]
  return `<g><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12" fill="${opt.fill ?? '#fff'}" stroke="${opt.stroke ?? '#e4dcd6'}" stroke-width="1.5"${opt.dash ? ' stroke-dasharray="5 4"' : ''}/>
    <text x="${x + 12}" y="${y + 27}" class="bt">${title}</text>
    ${lines.map((t, i) => `<text x="${x + 12}" y="${y + 48 + i * 16}" class="bs">${t}</text>`).join('')}</g>`
}
const lane = (l, label, fill) => `<rect x="0" y="${LANE[l]}" width="1075" height="125" rx="14" fill="${fill}"/><text x="48" y="${LANE[l] + 68}" class="ln" text-anchor="middle">${label}</text>`
const cx = c => X[c] + W / 2
// 상자 c1(l1) 오른쪽 가운데 → 상자 c2(l2) 위/아래 가운데 (꺾은선)
const elbow = (c1, l1, c2, l2, color = '#8a8391', dash = false) => {
  const y1 = Y[l1] + 39, x2 = cx(c2)
  const y2 = l2 > l1 ? Y[l2] : l2 < l1 ? Y[l2] + H : Y[l2] + 39
  const d = l2 === l1 ? `M${X[c1] + W},${y1} H${X[c2]}` : `M${X[c1] + W},${y1} H${x2} V${y2}`
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"${dash ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${color === '#8a8391' ? 'a' : 'b'})"/>`
}
const svg = `<svg viewBox="0 0 1075 395" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
<style>.bt{font:700 15px sans-serif;fill:#2b2a33}.bs{font:12px sans-serif;fill:#6d6674}.ln{font:700 14px sans-serif;fill:#5f5866}.al{font:600 11.5px sans-serif;fill:#8a8391}</style>
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8a8391"/></marker>
<marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b8860b"/></marker></defs>
${lane(0, '설계사', '#f4f1f6')}${lane(1, '부부 폰', '#eef3fd')}${lane(2, '앱', '#edf7f1')}
${box(0, 0, '① 결과 올리기', ['재무설계 결과', '새 부부 등록'])}
${box(1, 2, '② 계획 값 찾기', ['AI가 30칸을 찾고', '근거 문장을 붙임'])}
${box(2, 0, '③ 원문 대조', ['칸마다 "원문과 맞음"', '→ 사이클 시작'])}
${box(3, 1, '④ 매주 5문항', ['테마 1개씩 6주', '그대로 / 다른 답 고르기'])}
${box(4, 2, '⑤ 계획과 비교', ['다르면 🔴', '기타 답만 AI'])}
${box(5, 0, '⑥ 처리 대기', ['확인함 · 메모', '6주 뒤 상담 요청'])}
${box(5, 1, '상담 요청 알림', ['두 분 폰에', '분기 · 반기마다 다시'], { fill: '#fdf6e3', stroke: '#e0c36a', dash: true })}
${elbow(0, 0, 1, 2)}${elbow(1, 2, 2, 0)}${elbow(2, 0, 3, 1)}${elbow(3, 1, 4, 2)}${elbow(4, 2, 5, 0)}
<text x="${X[5] - 16}" y="${Y[1] + 44}" class="al" text-anchor="end">다르거나</text><text x="${X[5] - 16}" y="${Y[1] + 60}" class="al" text-anchor="end">못 읽은 것만</text>
<path d="M${cx(5)},${Y[0] + H} V${Y[1]}" fill="none" stroke="#b8860b" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#b)"/>
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
pre.msg { white-space: pre-wrap; font-family: inherit; font-size: 8.2pt; background: #fff; border: 0.3mm solid #e4dcd6; border-radius: 3mm; padding: 3mm 3.5mm; margin: 0; line-height: 1.45; overflow: hidden; }
.side { display: flex; flex-direction: column; gap: 2.5mm; }
.side .box p { margin: 0; font-size: 9.2pt; }
.weeks { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2mm; }
.wk { background: #fff; border: 0.3mm solid #e4dcd6; border-radius: 3mm; padding: 2mm 2.5mm; font-size: 8.8pt; }
.wk b { display: block; font-size: 10pt; }
</style></head><body>

<section class="page">
  <div class="eyebrow">돈궁합 · 부부 재무설계 점검 · AFPK 영 플래너 챌린지 2026 · ${TODAY} 기준</div>
  <h1>화면 흐름도</h1>
  <p class="lead">재무설계 결과를 바탕으로, 6주 동안 매주 한 테마씩 두 분께 따로 묻습니다. <b>계획과 다른 답만</b> 설계사에게 올라가고, 6주가 끝나면 설계사가 상담을 요청합니다. <b>앱은 듣고, 설계사가 말합니다.</b></p>
  ${svg}
  <div class="weeks">
    <div class="wk"><b>1주 · 주택</b>이사 · 보증금 · 내 집 마련 · 부모님 지원</div>
    <div class="wk"><b>2주 · 출산/육아</b>첫 아이 · 자녀 수 · 쉬는 기간 · 교육비</div>
    <div class="wk"><b>3주 · 노후</b>은퇴 나이 · 소득 전망 · 연금</div>
    <div class="wk"><b>4주 · 보험</b>보험료 한도 · 재설계 · 대비할 위험</div>
    <div class="wk"><b>5주 · 부채</b>대출 금액 · 명의 · 지원금 성격 · 통장</div>
    <div class="wk"><b>6주 · 투자</b>저축 · 비상금 · 굴리는 방식 · 비율</div>
  </div>
  <div class="rules">
    <div class="rule"><b>서로의 답은 안 보인다</b><small>판정도 상대의 답도 부부 폰에서는 볼 수 없다</small></div>
    <div class="rule"><b>AI는 찾기 · 비교 · 요약만</b><small>재무설계 결과에서 값 찾기(설계사 확인 필수) · 기타 답 뜻 비교 · 세 줄 요약. 계산 · 조언 · 계획 수정은 안 한다</small></div>
    <div class="rule"><b>계획과 다르면 다른 것</b><small>허용 범위 없음. 기록은 지워지지 않고 새 버전으로 쌓인다</small></div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">① ② ③ 설계사 — 준비</div>
  <h2>재무설계 결과를 올리면, AI가 30칸의 계획 값을 찾고 설계사가 원문과 대조합니다</h2>
  <div class="two" style="grid-template-columns: 0.8fr 1.6fr">
    <div class="col">
      ${deskFig('p1-new-couple', `${step(1, '새 부부 등록')} — 재무설계 결과 파일을 고르면 파일 이름에서 두 분 이름이 채워진다`, 72)}
      <figure class="dk"><pre class="msg" style="height:52mm">${esc(invite)}</pre><figcaption>${step(5, '안내문 보내기')} — 부부 목록의 "안내문 복사" → 카톡. QR도 있다</figcaption></figure>
    </div>
    ${deskFig('p2-word', `${step(2, '재무설계 결과에서 채우기')} — AI가 찾은 값 옆에 원문 문장이 붙는다. ${step(3, '원문과 맞음')} 을 누른 칸만 저장된다. 못 찾은 칸은 직접 채운다. ${step(4, '사이클 시작')} — 30칸이 다 차면 같은 화면 아래에서 누른다(분기 / 반기). 이날이 1주차`, 140)}
  </div>
</section>

<section class="page">
  <div class="eyebrow">④ 부부 폰</div>
  <h2>매주 그 주 테마 5문항이 열리면, 두 분이 각자 답합니다</h2>
  <div class="row">
    ${phoneFig('c1-join', '<b>입장</b> — 코드와 남편 / 아내')}
    ${phoneFig('c2-home', '<b>홈</b> — "이번 주 질문이 열렸어요". 폰 알림도 온다')}
    ${phoneFig('c3-round', '<b>답하기</b> — 계획을 보고 "그대로예요" 또는 <b>다른 답 고르기</b>')}
    ${phoneFig('c4-done', '<b>끝</b> — 판정은 보여 주지 않는다. 다음 주 테마 안내')}
    ${phoneFig('c5-plan', '<b>내 설계</b> — 재무설계 결과를 테마별로')}
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑤ ⑥ 설계사 — 결과 보기</div>
  <h2>두 분이 다 답하면, 계획과 다르거나 읽지 못한 답만 처리 대기에 올라옵니다</h2>
  <div class="two" style="grid-template-columns: 1.5fr 1fr">
    <img src="${img('p4-queue')}" style="width:100%;max-height:150mm;object-fit:cover;object-position:top left;border-radius:3mm;border:0.3mm solid #e4dcd6">
    <div class="side">
      <div class="box">${step(6, '처리 대기 열기')}<p style="margin-top:1.5mm">"○○ 부부 · 처리 대기 N건" 알림이 오거나, 부부 목록에서 본다</p></div>
      <div class="box">${step(7, '한 건씩 읽기')}<p style="margin-top:1.5mm">계획 · 남편 답 · 아내 답이 나란히. "그대로예요" / "바뀜 → 고른 답". 🔴 건은 AI가 세 줄로 요약해 둔다</p></div>
      <div class="box">${step(8, '확인함')}<p style="margin-top:1.5mm">봤다는 표시와 메모가 사이클 정리에 남는다. 판정은 바뀌지 않는다</p></div>
      <div class="box">${step('+', '이건 같은 뜻이에요')}<p style="margin-top:1.5mm">AI가 판정한 건(기타 답)에만. AI 오판으로 기록 → 판단 규칙을 고칠 때 시험 사례</p></div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑥ 설계사 — 사이클 정리 · 상담 요청</div>
  <h2>6주 동안 무엇이 바뀌었는지 테마별로 모아 보고, 상담을 요청합니다</h2>
  <div class="two" style="grid-template-columns: 1.5fr 1fr">
    <img src="${img('p5-cycle')}" style="width:100%;max-height:150mm;object-fit:cover;object-position:top left;border-radius:3mm;border:0.3mm solid #e4dcd6">
    <div class="side">
      <div class="box">${step(9, '주차별 진행')}<p style="margin-top:1.5mm">시작한 날부터 7일마다 다음 테마가 저절로 열린다. "남편 5/5 · 아내 0/5". 답하지 않은 주는 닫지 않고 다음 주로 넘긴다. 열린 지 4일이면 늦은 분에게만 한 번 더 알림</p></div>
      <div class="box">${step(10, '상담 요청 보내기')}<p style="margin-top:1.5mm">두 분 폰에 상담 요청 알림. 남은 질문은 닫히고 상담에서 직접 묻는다. 주기가 지나면 다음 사이클이 1주차부터</p></div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">자세한 설명</div>
  <h2>판정 · 다른 답 후보 · AI · 알림</h2>
  <div class="two">
    <div class="col">
      <div class="box"><h3>판정 — 계획과 다르면 다른 것 (허용 범위 없음)</h3>
        <table>
          <tr><th>상황</th><th>판정</th><th>설계사에게</th></tr>
          <tr><td>두 분 다 "그대로예요"</td><td><span class="chip g">🟢</span></td><td>올라오지 않음</td></tr>
          <tr><td>한 분이라도 다른 답 (금액 1원 · 시점 1개월 · "아직 모름"도)</td><td><span class="chip r">🔴 계획과 다름</span></td><td>처리 대기 · 누가 무엇을 골랐는지 그대로</td></tr>
          <tr><td>기타 답을 읽지 못함</td><td><span class="chip y">🟡 확인 필요</span></td><td>추측하지 않고 설계사에게</td></tr>
        </table>
      </div>
      <div class="box"><h3>다른 답 후보 — 계획 값에서 규칙으로 (AI 아님)</h3>
        <table>
          <tr><td style="width:18%"><b>금액</b></td><td>계획의 0.5 · 0.8 · 1.2 · 1.5배 (3억 → 1억 5,000만 · 2억 5,000만 · 3억 5,000만 · 4억 5,000만)</td></tr>
          <tr><td><b>시점</b></td><td>1년 전 · 6개월 전 · 6개월 뒤 · 1년 뒤 · 2년 뒤 (지난 달은 뺀다)</td></tr>
          <tr><td><b>나이 · 개수</b></td><td>나이 −5 · −2 · +2 · +5살 / 자녀 0~4명 · 쉬는 기간 0~36개월</td></tr>
          <tr><td><b>선택</b></td><td>나머지 보기</td></tr>
          <tr><td><b>모든 칸</b></td><td>"아직 모름" 등 + 맨 끝 <b>기타 — 직접 적기</b></td></tr>
        </table>
      </div>
    </div>
    <div class="col">
      <div class="box"><h3>AI가 하는 일 세 가지</h3>
        <ul>
          <li><b>재무설계 결과에서 계획 값 찾기</b> — 문서 표기 그대로 + 근거 문장. 원 단위 · 날짜로 바꾸는 건 앱 규칙. 설계사가 칸마다 원문과 대조해야 저장</li>
          <li><b>기타 답 뜻 비교</b> — "집 사고 나서요"처럼 말이 섞인 답만. 값만 적었으면("3억 2천") 규칙이 읽는다</li>
          <li><b>🔴 건 세 줄 요약</b> — 무엇이 다른지 · 영향 · 물어볼 것. 판정을 바꾸지 못한다</li>
        </ul>
        <p style="margin:1.5mm 0 0;font-size:9pt;color:#5f5866">계산 · 재무 조언 · 자동 반영 · 재설계는 하지 않는다. 부부에게는 AI가 쓴 문장이 가지 않는다.</p>
      </div>
      <div class="box"><h3>폰 알림 (판정 · 상대 답 · 금액은 넣지 않는다)</h3>
        <table style="font-size:8.8pt">
          <tr><td style="width:22%"><b>부부</b></td><td>이번 주 질문 5개가 열렸어요 · 아직 답하지 않은 질문이 남아 있어요 · [내 설계]를 새로 고쳤어요 · 상담 요청</td></tr>
          <tr><td><b>설계사</b></td><td>○○ 부부 · 처리 대기 N건</td></tr>
        </table>
        <p style="margin:1.5mm 0 0;font-size:8.8pt;color:#5f5866">처음 한 번 "알림 켜기". 아이폰은 홈 화면 아이콘으로 열었을 때만</p>
      </div>
      <div class="box"><h3>계획이 바뀌면</h3>
        <ul><li>재무설계 결과를 고쳐 다시 올리거나 칸을 고쳐 저장 → 새 버전. 예전 값은 변경 이력에. 묻는 중인 칸은 끝난 뒤에</li></ul>
      </div>
    </div>
  </div>
  <div class="foot">지금 상태: 자동 점검 93개 · 실제 DB 처음부터 끝까지 시험 29단계 통과. 화면 그림은 예시 데이터라 이름이 "김현우 · 박지우"로 보인다. 재무설계 결과 단계 그림은 예시 값으로 찍었다.</div>
</section>
</body></html>`
writeFileSync(`${OUT}/flow.html`, html)
const pg = await (await br.newContext()).newPage()
await pg.goto(`file://${OUT}/flow.html`, { waitUntil: 'load' })
await pg.pdf({ path: PDF, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })
await br.close()
console.log('→', PDF)
