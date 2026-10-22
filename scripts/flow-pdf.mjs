/**
 * 화면 흐름도 PDF → docs/11_화면흐름도.pdf
 * 데모 모드(Supabase env 비움) 서버를 띄운 뒤 실행한다 — 실제 DB 를 건드리지 않고, 데이터가 늘 같다.
 *
 *   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5180 --host 127.0.0.1
 *   node scripts/flow-pdf.mjs                      # 다른 터미널
 *
 * 캡처는 build/flow/ 에 남는다(커밋 안 함). 크로미움은 playwright 것을 쓴다 (PW_CHROMIUM 으로 바꿀 수 있음).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const B = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5180'
const OUT = resolve('build/flow')
const PDF = resolve('docs/11_화면흐름도.pdf')
mkdirSync(OUT, { recursive: true })

const br = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
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
await shot(null, 'c3-home-plan', async pg => { await pg.click('button[role=tab]:has-text("내 설계")') }, true)
await shot('/c/round/baseline', 'c4-round', async pg => { await pg.selectOption('select[aria-label="연도"]', '2029') })
await shot('/c/wait/baseline', 'c5-wait')
await shot('/c/done/baseline', 'c6-done')

// ── 설계사 콘솔 (노트북) ────────────────────────────────────────────────
const desk = await br.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
const d = await desk.newPage()
async function dshot(url, name, prep, el) {
  if (url) await d.goto(B + url, { waitUntil: 'networkidle' })
  if (prep) await prep(d)
  await d.waitForTimeout(400)
  if (el) await d.locator(el).first().screenshot({ ...shotOpts, path: `${OUT}/${name}.jpg` })
  else await d.screenshot({ ...shotOpts, path: `${OUT}/${name}.jpg` })
  console.log('·', name)
}
await dshot('/p/couples', 'p1-couples')
await dshot(null, 'p1b-rename', async pg => { await pg.locator('.qcard').first().locator('button:has-text("이름 고치기")').click() }, '.qcard')
await dshot(null, 'p2-issue', async pg => {
  await pg.fill('#h', '민준'); await pg.fill('#w', '서연'); await pg.fill('#l', '이민준 · 최서연')
  await pg.click('button:has-text("새 부부 등록하고 코드 발급")')
}, 'main .editor')
await dshot('/p/queue', 'p3-queue', null, 'main')
await dshot('/p/cards', 'p4-card-edit', async pg => { await pg.locator('.card-row').nth(4).click() }, 'main .editor')
await dshot(null, 'p5-card-add', async pg => { await pg.click('button:has-text("카드 추가")') }, 'main .editor')
await dshot('/p/history', 'p6-history', null, 'main')

// 안내문 문구는 앱의 함수를 그대로 쓴다 (화면과 PDF 가 같은 말을 하게)
const invite = await d.evaluate(async () => {
  const m = await import('/src/lib/install.ts')
  return m.inviteMessage({ husband: '민준', wife: '서연', code: '482913', url: 'https://afpk-dongunghap.vercel.app/c/join?code=482913' })
})

// ── PDF ─────────────────────────────────────────────────────────────
const img = n => `file://${OUT}/${n}.jpg`
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
// 회의 질문 번호표 (docs/12 와 같은 번호). 화면을 보며 답할 수 있게 그 화면 아래에 붙인다
const qb = (...ids) => `<span class="qbs">${ids.map(i => `<span class="qb">${i}</span>`).join('')}</span>`
const phoneFig = (n, cap, step) => `<figure class="ph"><div class="step">${step}</div><img src="${img(n)}"><figcaption>${cap}</figcaption></figure>`
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: #2b2a33; margin: 0; font-size: 10.5pt; line-height: 1.55; }
.page { page-break-after: always; height: 184mm; display: flex; flex-direction: column; gap: 4mm; overflow: hidden; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 24pt; margin: 0; letter-spacing: -0.02em; }
h2 { font-size: 16pt; margin: 0; letter-spacing: -0.01em; }
.eyebrow { font-size: 9pt; color: #8a8391; letter-spacing: 0.04em; }
.lead { color: #5f5866; margin: 0; max-width: 220mm; }
.him { color: #4f74d4; } .her { color: #c8604f; }
.flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm 6mm; margin-top: 2mm; }
.node { border-radius: 4mm; padding: 4.5mm 4.5mm; min-height: 30mm; background: #fff7f2; border: 0.4mm solid #f0e6df; position: relative; }
.node b { display: block; font-size: 11pt; margin-bottom: 1mm; }
.node small { color: #6d6674; font-size: 9pt; display: block; }
.node .who { position: absolute; top: 2.5mm; right: 3mm; font-size: 8pt; font-weight: 700; padding: 0.3mm 2mm; border-radius: 10mm; }
.who.p { background: #2b2a33; color: #fff; } .who.c { background: #e9effd; color: #4f74d4; } .who.s { background: #e4f5ec; color: #1f7a52; }
.node:not(.last)::after { content: '→'; position: absolute; right: -5mm; top: 50%; transform: translateY(-50%); color: #b3aab4; font-size: 12pt; }
.flow .node:nth-child(4n)::after { content: none; }  /* 줄 끝은 화살표 없이 — 번호(①~⑧)로 순서를 읽는다 */
.rules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 8mm; }
.rule { background: #2b2a33; color: #fff; border-radius: 4mm; padding: 3.5mm 4mm; }
.rule b { display: block; margin-bottom: 0.8mm; }
.rule small { color: #d7d1db; font-size: 9pt; }
.row { display: flex; gap: 4mm; align-items: flex-start; min-height: 0; flex: 1; }
.ph { margin: 0; flex: 1; min-width: 0; text-align: center; position: relative; }
.ph img { width: 100%; max-height: 128mm; object-fit: contain; object-position: top; border-radius: 4mm; border: 0.3mm solid #e4dcd6; }
.ph figcaption { font-size: 8.8pt; color: #4a4450; margin-top: 1.5mm; text-align: left; }
.step { position: absolute; top: -2mm; left: -1mm; width: 6mm; height: 6mm; border-radius: 50%; background: #2b2a33; color: #fff; font-size: 8.5pt; font-weight: 700; display: grid; place-items: center; z-index: 2; }
.shot { border-radius: 3mm; border: 0.3mm solid #e4dcd6; width: 100%; object-fit: contain; object-position: top left; }
.two { display: grid; grid-template-columns: 1.35fr 1fr; gap: 5mm; flex: 1; min-height: 0; }
.col { display: flex; flex-direction: column; gap: 3mm; min-height: 0; }
.box { background: #fff7f2; border-radius: 3mm; padding: 3mm 4mm; }
.box h3 { margin: 0 0 1.5mm; font-size: 11pt; }
pre.msg { white-space: pre-wrap; font-family: inherit; font-size: 8.6pt; background: #fff; border: 0.3mm solid #e4dcd6; border-radius: 3mm; padding: 3mm 3.5mm; margin: 0; line-height: 1.5; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; }
th, td { text-align: left; padding: 1.6mm 2mm; border-bottom: 0.3mm solid #eee5df; vertical-align: top; }
th { color: #8a8391; font-weight: 500; font-size: 8.5pt; }
ul { margin: 0; padding-left: 5mm; } li { margin: 0.6mm 0; }
.chip { display: inline-block; font-size: 8pt; font-weight: 700; padding: 0.2mm 2mm; border-radius: 10mm; }
.g { background: #e4f5ec; color: #1f7a52; } .y { background: #fdf1dc; color: #a86a12; } .r { background: #fde6e5; color: #c0392b; }
.foot { font-size: 8pt; color: #8a8391; margin-top: auto; }
.qbs { display: inline-flex; gap: 1mm; margin-right: 1.2mm; vertical-align: 0.3mm; }
.qb { background: #ffe58a; color: #5c4300; font-weight: 800; font-size: 7.8pt; padding: 0.1mm 1.6mm; border-radius: 1.6mm; }
.qtable td, .qtable th { padding: 1.05mm 2mm; } .qtable td:first-child { width: 13mm; } .qtable td:nth-child(2) { width: 57%; } .qtable td:nth-child(3) { color: #5f5866; } .qtable .grp td { padding: 0.8mm 2mm; background: #fff7f2; font-weight: 700; font-size: 8.2pt; }
</style></head><body>

<section class="page">
  <div class="eyebrow">돈궁합 · 부부 재무설계 합의 확인 · AFPK 영 플래너 챌린지 2026 · 2026-10-19 기준</div>
  <h1>화면 흐름도</h1>
  <p class="lead">설계사가 부부를 등록하면, 두 분이 각자 휴대폰에서 같은 질문에 따로 답합니다. 앱은 두 답과 설계안의 전제를 비교해 <b>어긋난 것만</b> 설계사에게 올립니다. 판정과 상대의 답은 부부에게 보이지 않습니다. <b>앱은 듣고, 설계사가 말합니다.</b></p>
  <p class="lead" style="font-size:9.5pt">${qb('Q1')} 노란 번호표는 <b>회의 질문</b>입니다. 그 화면을 보면서 답하면 됩니다. 질문 목록은 마지막 쪽(7쪽)에 있습니다.</p>
  <div class="flow">
    <div class="node"><span class="who p">설계사</span><b>① 부부 등록</b><small>남편·아내 이름 → 입장 코드 6자리 발급. 가정 카드 10장과 0회차 3문항이 열린다</small></div>
    <div class="node"><span class="who p">설계사</span><b>② 안내문 보내기</b><small>"안내문 복사" → 카톡. 링크 · 홈 화면 추가 방법 · 입장 코드가 한 번에</small></div>
    <div class="node"><span class="who c">부부 폰</span><b>③ 홈 화면 추가 · 입장</b><small>아이콘으로 열고 코드 입력 → 남편/아내 선택. 앱을 닫아도 기억</small></div>
    <div class="node"><span class="who c">부부 폰</span><b>④ 따로 답하기</b><small>0회차 3문항(집 시점 · 승진·이직 · 양가 지원). 제출하면 고칠 수 없음</small></div>
    <div class="node"><span class="who s">서버</span><b>⑤ 3자 비교 판정</b><small>남편 답 · 아내 답 · 설계안 전제. 숫자·시점·선택은 규칙, 서술형만 AI가 판별</small></div>
    <div class="node"><span class="who p">설계사</span><b>⑥ 처리 대기</b><small>🔴(전제 폐기 · 부부 불일치)와 확인 필요 🟡만. AI 3줄 요약: 사실 · 영향 · 확인할 질문</small></div>
    <div class="node"><span class="who p">설계사</span><b>⑦ 결정</b><small>상담 때 다루기 / 이건 같은 뜻이에요(AI 오판 기록) / 두 분께 먼저 묻기</small></div>
    <div class="node last"><span class="who c">부부 폰</span><b>⑧ 먼저 묻기 → 반영</b><small>설계사가 고친 카드 1문항. 둘 다 새 값과 맞으면 그 버전이 전제가 된다. 아니면 "동의 안 됨"</small></div>
  </div>
  <div class="rules">
    <div class="rule"><b>서로의 답은 안 보인다</b><small>부부 폰에서는 판정 결과도, 상대방이 뭐라고 답했는지도 볼 수 없게 서버가 막는다. 보이는 건 "남편 3문항 중 3개 답함" 같은 진행 상황뿐</small></div>
    <div class="rule"><b>AI는 판단을 돕기만 한다</b><small>AI는 "두 답이 같은 뜻인가"를 가리고 요약만 한다. 돈 계산, 재무 조언, 설계 변경은 하지 않는다. 애매하면 추측하지 않고 설계사에게 넘긴다</small></div>
    <div class="rule"><b>기록은 지워지지 않는다</b><small>카드 값을 고치면 덮어쓰지 않고 새 버전으로 쌓여, 언제 왜 바뀌었는지 남는다. 부부가 제출한 답은 고치거나 지울 수 없다</small></div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">① ② 설계사 — 부부 등록과 안내</div>
  <h2>등록하면 코드가 나오고, 안내문 한 번이면 두 분이 시작합니다</h2>
  <div class="two">
    <div class="col">
      <img class="shot" style="max-height:92mm" src="${img('p1-couples')}">
      <img class="shot" style="max-height:56mm" src="${img('p1b-rename')}">
    </div>
    <div class="col">
      <img class="shot" style="max-height:66mm" src="${img('p2-issue')}">
      <div class="box"><h3>안내문 복사 → 카톡에 그대로</h3><pre class="msg">${esc(invite)}</pre></div>
    </div>
  </div>
  <div class="foot" style="color:#4a4450">${qb('Q5')}왼쪽 위 담당 부부 목록 — 연습용 부부를 가상고객으로 바꿀까. ${qb('Q2')}오른쪽 위 새 부부 발급 — A안에서는 발급 직후 카드 틀을 채우는 화면이 들어간다. (왼쪽 아래: 이름 고치기)</div>
</section>

<section class="page">
  <div class="eyebrow">③ ④ 부부 폰 — 입장부터 전달까지</div>
  <h2>두 분이 각자 3분, 서로의 답은 보이지 않습니다</h2>
  <div class="row">
    ${phoneFig('c1-join', '<b>입장</b> — 코드와 역할. 브라우저로 열면 "홈 화면에 추가" 안내가 뜬다. 입장 전 아바타는 남/아', 1)}
    ${phoneFig('c2-home-match', `${qb('Q4', 'Q10')}<b>홈 · 맞춰보기</b> — "0회차 · 3문항". 열린 질문이 있을 때만 시작할 수 있다`, 2)}
    ${phoneFig('c4-round', `${qb('Q6', 'Q7', 'Q8', 'Q9')}<b>문답</b> — 질문 문장, 연·월 고르기, "정확한 시점 대신 조건으로 답하기" 버튼`, 3)}
    ${phoneFig('c5-wait', '<b>대기</b> — 상대가 몇 문항 답했는지만. 내용은 안 보인다', 4)}
    ${phoneFig('c6-done', `${qb('Q11', 'Q12')}<b>전달됨</b> — "11월 둘째 주쯤", "[내 설계]에서 알려주세요" 문구`, 5)}
    ${phoneFig('c3-home-plan', `${qb('Q13')}<b>내 설계</b> — 카드가 5장만 보인다. 맨 위 진행 막대는 예시 화면에만 있다`, 6)}
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑤ ⑥ ⑦ 판정과 처리 대기</div>
  <h2>어긋난 것만 올라오고, 무엇을 할지는 설계사가 정합니다</h2>
  <div class="two">
    <img class="shot" style="max-height:150mm" src="${img('p3-queue')}">
    <div class="col">
      <div class="box"><h3>${qb('Q7', 'Q8', 'Q14')}3자 비교 — 두 답이 각각 전제와 맞는가, 두 답이 서로 맞는가</h3>
        <table>
          <tr><th>상황</th><th>판정</th><th>설계사에게</th></tr>
          <tr><td>둘 다 전제와 같고 서로 같음</td><td><span class="chip g">🟢</span></td><td>올라오지 않음</td></tr>
          <tr><td>조금 다름 (허용 범위의 두 배 안)</td><td><span class="chip y">🟡</span></td><td>다음 라운드에 다시. 2연속이면 🔴</td></tr>
          <tr><td>두 분은 같은데 전제와 크게 다름</td><td><span class="chip r">🔴 전제 폐기</span></td><td>설계안이 현실을 못 따라옴</td></tr>
          <tr><td>두 분이 서로 다르게 앎</td><td><span class="chip r">🔴 부부 불일치</span></td><td>상담 안건</td></tr>
          <tr><td>답을 해석 못 함 ("집 사고 나서")</td><td><span class="chip y">🟡 확인 필요</span></td><td>추측하지 않고 설계사에게</td></tr>
        </table>
      </div>
      <div class="box"><h3>세 가지 처리</h3>
        <ul>
          <li><b>두 분께 먼저 묻기</b> — 카드 값을 고쳐 다시 묻는다 (다음 장)</li>
          <li><b>상담 때 다루기</b> — 메모를 남기고 큐에서 뺀다</li>
          <li><b>이건 같은 뜻이에요</b> — AI 오판으로 기록. 판별 평가 자료가 된다</li>
        </ul>
      </div>
      <div class="box"><h3>${qb('Q3')}AI가 하는 일</h3>
        <ul>
          <li>서술형 답의 판별 (같은 뜻인가 · 전제와 다른가)</li>
          <li>🔴·확인 필요 건의 3줄 요약 — 사실 · 영향 · 확인할 질문. 조언·계산 없음</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑧ 가정 카드 — 고치기, 먼저 묻기, 추가, 이력</div>
  <h2>값을 바꾸면 새 버전이 생기고, 두 분이 동의해야 전제가 됩니다</h2>
  <div class="row" style="gap:5mm">
    <figure class="ph" style="flex:0.8"><img class="shot" style="max-height:108mm" src="${img('p4-card-edit')}"><figcaption>${qb('Q14')}<b>카드 고치기</b> — "허용 범위" 칸. 사유 필수. 저장하면 그 카드 1문항으로 "먼저 묻기"가 두 분 폰에 열린다</figcaption></figure>
    <figure class="ph" style="flex:0.8"><img class="shot" style="max-height:108mm" src="${img('p5-card-add')}"><figcaption>${qb('Q1', 'Q2', 'Q3')}<b>카드 추가</b> — A안은 이 칸들을 카드 28장만큼 한 화면에서 채우는 모양. 설계안에 있는 전제를 직접 만든다. v1 은 바로 전제. "바로 묻기"로 1문항 정기 맞춰보기</figcaption></figure>
    <figure class="ph" style="flex:1.2"><img class="shot" style="max-height:108mm" src="${img('p6-history')}"><figcaption><b>변경 이력</b> — 모든 버전이 남는다. 반영됨 / 동의 대기 / 동의 안 됨</figcaption></figure>
  </div>
  <div class="flow" style="grid-template-columns: repeat(4, 1fr)">
    <div class="node"><span class="who p">설계사</span><b>v2 저장</b><small>"두 분께 먼저 묻고 v2 저장" — 아직 전제 아님 (동의 대기)</small></div>
    <div class="node"><span class="who c">부부 폰</span><b>먼저 묻기 1문항</b><small>"설계사님이 전제 하나를 바꾸려고 해요"</small></div>
    <div class="node"><span class="who s">서버</span><b>둘 다 새 값과 맞으면</b><small>v2 활성화 → [내 설계]에 반영. 연동 수치는 공식대로 다시 계산</small></div>
    <div class="node last"><span class="who p">설계사</span><b>어긋나면</b><small>v2 는 "동의 안 됨"으로 남고 처리 대기로. 값을 고쳐 다시 물을 수 있다</small></div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">팀원용 정리 · 2026-10-19</div>
  <h2>지금 어디까지 됐고, 다음에 무엇을 하나</h2>
  <div class="two" style="grid-template-columns: 1fr 1fr">
    <div class="col">
      <div class="box"><h3>지금까지 확인한 것</h3>
        <table>
          <tr><td style="width:30%"><b>기능 점검</b></td><td>자동 점검 81개 모두 통과. 판정 규칙, 금액·날짜 읽기, 제도 계산이 의도대로 도는지 고칠 때마다 다시 검사한다</td></tr>
          <tr><td><b>처음부터 끝까지 시험</b></td><td>실제 서버에서 39단계 모두 통과. 가상의 폰 2대와 설계사가 등록 → 답하기 → 판정 → 먼저 묻기 → 반영까지 실제로 해 봤다</td></tr>
          <tr><td><b>AI 판단 정확도</b></td><td>처음 보는 서술형 답 10문제 중 7~8개를 맞게 판단. 틀린 사례는 기록해 두고 고치는 중</td></tr>
          <tr><td><b>실제 폰 확인</b></td><td>홈 화면에 앱처럼 추가, 새 버전 자동 반영, 카톡 안내문, 이름 고치기, 다시 입장하기 (10.18)</td></tr>
          <tr><td><b>주소</b></td><td>afpk-dongunghap.vercel.app — 폰 브라우저로 바로 열린다</td></tr>
          <tr><td><b>연습용 데이터</b></td><td>테스트 기록은 모두 지웠다. 연습용 부부 "남편 · 아내" 한 쌍만 있다 (입장 코드 482913)</td></tr>
        </table>
      </div>
      <div class="box"><h3>우리 앱이 지키는 약속 — 심사 때 설명할 거리</h3>
        <ul>
          <li><b>AI 이용권은 서버에만 둔다.</b> AI를 부르는 비밀 열쇠가 부부 폰이나 웹페이지에 들어가지 않아, 남이 가져다 쓸 수 없다</li>
          <li><b>제도 숫자는 한 곳에서만 관리한다.</b> 대출 한도·소득 기준 같은 숫자를 한 파일에 모으고, 어느 공식 사이트에서 언제 확인했는지 함께 적는다. 바뀌면 한 곳만 고치면 된다</li>
          <li><b>AI 지시문을 고치면 다시 잰다.</b> 버전 번호를 올리고 정확도를 새로 측정해, "고친 뒤 나아졌다"를 숫자로 말할 수 있게 한다</li>
        </ul>
      </div>
    </div>
    <div class="col">
      <div class="box"><h3>다음 단계 — A안으로 진행</h3>
        <p style="margin:0 0 2mm"><b>A안:</b> 새 부부를 등록하면 <b>카드 틀(질문 목록)</b>이 뜨고, 설계사가 그 부부의 설계안을 보면서 값을 직접 채운다. 채우고 저장하면 0회차가 열린다.</p>
        <p style="margin:0; color:#6d6674; font-size:9pt">지금은 새 부부에게 연습용 부부의 카드를 그대로 복사하고 있어서, 부부마다 다른 설계를 넣을 수 없다. A안이 이걸 해결한다. 설계안 문서에서 AI가 자동으로 채워 주는 방식(B안)은 공모전 이후로 미룬다.</p>
      </div>
      <div class="box"><h3>팀이 정해 줄 것 — 회의 질문 16개 (7쪽)</h3>
        <ul>
          <li><b>카드 틀 확정</b> ${qb('Q1')} — 가상고객 재무제표로 만든 초안(주제 10개 · 카드 28장). 이게 정해져야 A안 화면을 만든다</li>
          <li>그중 <b>먼저 답이 필요한 4가지</b>
            <ul style="margin-top:1mm">
              <li>${qb('Q4')}첫 맞춰보기를 몇 문항, 어떤 카드로</li>
              <li>${qb('Q5')}연습용 부부를 우리 조 가상고객으로 바꾸나</li>
              <li>${qb('Q6')}한 사람에 관한 질문을 배우자에게도 묻나</li>
              <li>${qb('Q7')}선택지에 "아직 모름"을 넣나</li>
            </ul>
          </li>
          <li><b>재무제표 숫자 맞추기</b> ${qb('Q15')} — 상담 시트와 10/22 재무제표가 다른 곳</li>
        </ul>
      </div>
      <div class="box"><h3>직접 확인할 것</h3>
        <ul>
          <li><b>제도 숫자 재확인</b> — 대출 한도·소득 기준 등을 주택도시기금·국세법령 공식 사이트에서 다시 보고 표에 체크 (확인표 따로 있음)</li>
          <li><b>폰 두 대로 리허설</b> — 안내문 받기 → 홈 화면 추가 → 0회차 답하기 → 설계사 화면에 결과가 오는지</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="foot">이 문서의 화면 그림은 연습용 예시 데이터로 찍어 부부 이름이 "김현우 · 박지우"로 보인다. 실제 앱의 연습용 부부 이름은 "남편 · 아내"다.</div>
</section>
<section class="page">
  <div class="eyebrow">회의 질문 목록 · 흐름도에서 볼 곳</div>
  <h2>노란 번호표를 따라가며 답해 주세요</h2>
  <table class="qtable" style="font-size:8.6pt">
    <tr><th>번호</th><th>질문</th><th>흐름도에서 볼 곳</th></tr>
    <tr class="grp"><td colspan="3">등록 · 카드 틀 (A안)</td></tr>
    <tr><td>${qb('Q1')}</td><td>카드 틀(주제 10개 · 카드 28장)을 이대로 확정할까</td><td>5쪽 가운데 "카드 추가" — 이 칸들을 28장만큼 채우는 모양</td></tr>
    <tr><td>${qb('Q2')}</td><td>첫 입력은 부부 확인 없이 바로 전제가 돼도 될까</td><td>2쪽 오른쪽 위 발급 직후 · 5쪽 카드 추가 아래 안내</td></tr>
    <tr><td>${qb('Q3')}</td><td>"흔들리면 무너지는 것" 문장은 설계사가 쓰나, 앱이 계산하나</td><td>5쪽 카드 추가의 그 칸 · 4쪽 처리 대기의 AI 요약</td></tr>
    <tr><td>${qb('Q4')}</td><td>첫 맞춰보기(0회차)는 몇 문항, 어떤 카드로</td><td>3쪽 ② "0회차 · 3문항"</td></tr>
    <tr><td>${qb('Q5')}</td><td>연습용 부부를 우리 조 가상고객으로 바꿀까 (가명)</td><td>2쪽 왼쪽 위 부부 목록</td></tr>
    <tr class="grp"><td colspan="3">부부 폰</td></tr>
    <tr><td>${qb('Q6')}</td><td>한 사람에 관한 질문(아내 매출 등)을 배우자에게도 물을까</td><td>3쪽 ③ 질문 문장</td></tr>
    <tr><td>${qb('Q7')}</td><td>선택지에 "아직 모름"을 넣을까 (빨간불 대신 확인 필요로)</td><td>3쪽 ③ · 4쪽 판정표</td></tr>
    <tr><td>${qb('Q8')}</td><td>"집 사고 나서"처럼 조건으로 답하면 AI가 판단할까, 설계사에게 넘길까</td><td>3쪽 ③ "조건으로 답하기" 버튼 · 4쪽 처리 대기 세 번째 건</td></tr>
    <tr><td>${qb('Q9')}</td><td>질문 말투를 하나로 (~하셨어요? / ~인가요?) · 다듬을 담당</td><td>3쪽 ③ 질문 문장</td></tr>
    <tr><td>${qb('Q10')}</td><td>열린 질문이 없을 때도 "세 가지만 맞춰볼게요"가 뜬다</td><td>3쪽 ② 제목</td></tr>
    <tr><td>${qb('Q11')}</td><td>"다음 맞춰보기 · 11월 둘째 주쯤"이 날짜로 고정</td><td>3쪽 ⑤</td></tr>
    <tr><td>${qb('Q12')}</td><td>"[내 설계]에서 알려주세요" — 그런 기능이 없다</td><td>3쪽 ⑤</td></tr>
    <tr><td>${qb('Q13')}</td><td>[내 설계]에 카드가 5장만 보인다 — 전부 / 중요한 5장</td><td>3쪽 ⑥</td></tr>
    <tr class="grp"><td colspan="3">판정</td></tr>
    <tr><td>${qb('Q14')}</td><td>"조금 다름 / 크게 다름" 기준을 카드마다 다르게 할까</td><td>4쪽 판정표 · 5쪽 카드 고치기 "허용 범위" 칸</td></tr>
    <tr class="grp"><td colspan="3">화면 밖</td></tr>
    <tr><td>${qb('Q15')}</td><td>가상고객 재무제표: 상담 시트와 10/22 재무제표 숫자 맞추기 (월세 · 자동차 할부 · 학자금 · 보험료 등)</td><td>—</td></tr>
    <tr><td>${qb('Q16')}</td><td>시연 방식(실시간 / 녹화)과 역할(남편 · 아내 · 설계사)</td><td>1쪽 ①~⑧ 순서대로 보여준다</td></tr>
  </table>
  <div class="foot" style="color:#4a4450">공모전 이후로 미루려는 것: AI가 설계안에서 카드 자동 채우기(B안) · 알림(지금은 1쪽 ②처럼 카톡) · 설계사 개인 로그인 · [내 설계] 진행 막대(3쪽 ⑥ 맨 위, 예시 화면에만). 이의가 있으면 회의에서.</div>
</section>
</body></html>`
writeFileSync(`${OUT}/flow.html`, html)
const pg = await (await br.newContext()).newPage()
await pg.goto(`file://${OUT}/flow.html`, { waitUntil: 'load' })
await pg.pdf({ path: PDF, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })
await br.close()
console.log('→', PDF)
