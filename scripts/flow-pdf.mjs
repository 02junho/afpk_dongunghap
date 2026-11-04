/**
 * 화면 흐름도 PDF → docs/11_화면흐름도.pdf
 * 데모 모드(Supabase env 비움) 서버를 띄운 뒤 실행한다 — 실제 DB 를 건드리지 않고, 데이터가 늘 같다.
 *
 *   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5180 --host 127.0.0.1
 *   node scripts/flow-pdf.mjs                      # 다른 터미널
 *
 * 11.04: 앱 화면의 부연 설명을 줄이고, 그 설명은 여기(그림 아래 글)로 옮겼다. 앱은 짧게, 흐름도는 자세히.
 * 캡처는 build/flow/ 에 남는다(커밋 안 함). 크로미움은 playwright 것을 쓴다 (PW_CHROMIUM 으로 바꿀 수 있음).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const B = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5180'
const OUT = resolve('build/flow')
const PDF = resolve('docs/11_화면흐름도.pdf')
const TODAY = '2026-11-04'
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
await dshot(null, 'p2-issue', async pg => {
  await pg.fill('#h', '민준'); await pg.fill('#w', '서연'); await pg.fill('#l', '이민준 · 최서연')
  await pg.click('button:has-text("새 부부 등록하고 코드 발급")')
}, 'main .editor')
await dshot('/p/queue', 'p3-queue', null, 'main')
await dshot('/p/cards', 'p4-card-view', async pg => { await pg.locator('.card-row').first().click() }, 'main .cards-layout')
await dshot(null, 'p5-card-add', async pg => { await pg.click('button:has-text("카드 추가")') }, 'main .editor')
await dshot(null, 'p6-extract', async pg => { await pg.click('button:has-text("재무제표 엑셀로 만들기")') }, 'main .editor')
await dshot('/p/history', 'p7-history', null, 'main')

// 안내문 문구는 앱의 함수를 그대로 쓴다 (화면과 PDF 가 같은 말을 하게)
const invite = await d.evaluate(async () => {
  const m = await import('/src/lib/install.ts')
  return m.inviteMessage({ husband: '민준', wife: '서연', code: '482913', url: 'https://afpk-dongunghap.vercel.app/c/join?code=482913' })
})

// ── PDF ─────────────────────────────────────────────────────────────
const img = n => `file://${OUT}/${n}.jpg`
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const phoneFig = (n, cap, step) => `<figure class="ph">${step ? `<div class="step">${step}</div>` : ''}<img src="${img(n)}"><figcaption>${cap}</figcaption></figure>`
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: #2b2a33; margin: 0; font-size: 10.5pt; line-height: 1.55; }
.page { page-break-after: always; height: 184mm; display: flex; flex-direction: column; gap: 4mm; overflow: hidden; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 24pt; margin: 0; letter-spacing: -0.02em; }
h2 { font-size: 16pt; margin: 0; letter-spacing: -0.01em; }
.eyebrow { font-size: 9pt; color: #8a8391; letter-spacing: 0.04em; }
.lead { color: #5f5866; margin: 0; max-width: 240mm; }
.flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm 6mm; margin-top: 1mm; }
.node { border-radius: 4mm; padding: 4mm 4.5mm; min-height: 26mm; background: #fff7f2; border: 0.4mm solid #f0e6df; position: relative; }
.node b { display: block; font-size: 11pt; margin-bottom: 1mm; }
.node small { color: #6d6674; font-size: 9pt; display: block; }
.node .who { position: absolute; top: 2.5mm; right: 3mm; font-size: 8pt; font-weight: 700; padding: 0.3mm 2mm; border-radius: 10mm; }
.who.p { background: #2b2a33; color: #fff; } .who.c { background: #e9effd; color: #4f74d4; } .who.s { background: #e4f5ec; color: #1f7a52; }
.node:not(.last)::after { content: '→'; position: absolute; right: -5mm; top: 50%; transform: translateY(-50%); color: #b3aab4; font-size: 12pt; }
.flow .node:nth-child(4n)::after { content: none; }
.lane { display: grid; grid-template-columns: 1.1fr 1fr 1.4fr; gap: 4mm 6mm; }
.lane .node { background: #fdf6e3; border-color: #f1e2b8; }
.lane-title { font-size: 9.5pt; font-weight: 700; color: #8a6412; margin: 2mm 0 -1mm; }
.rules { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin-top: auto; }
.rule { background: #2b2a33; color: #fff; border-radius: 4mm; padding: 3mm 4mm; }
.rule b { display: block; margin-bottom: 0.8mm; }
.rule small { color: #d7d1db; font-size: 8.8pt; }
.row { display: flex; gap: 4mm; align-items: flex-start; min-height: 0; flex: 1; }
.ph { margin: 0; flex: 1; min-width: 0; text-align: center; position: relative; }
.ph img { width: 100%; max-height: 118mm; object-fit: contain; object-position: top; border-radius: 4mm; border: 0.3mm solid #e4dcd6; }
.ph figcaption { font-size: 8.6pt; color: #4a4450; margin-top: 1.5mm; text-align: left; line-height: 1.5; }
.step { position: absolute; top: -2mm; left: -1mm; width: 6mm; height: 6mm; border-radius: 50%; background: #2b2a33; color: #fff; font-size: 8.5pt; font-weight: 700; display: grid; place-items: center; z-index: 2; }
.shot { border-radius: 3mm; border: 0.3mm solid #e4dcd6; width: 100%; object-fit: contain; object-position: top left; }
.two { display: grid; grid-template-columns: 1.35fr 1fr; gap: 5mm; flex: 1; min-height: 0; }
.col { display: flex; flex-direction: column; gap: 3mm; min-height: 0; }
.box { background: #fff7f2; border-radius: 3mm; padding: 3mm 4mm; }
.box h3 { margin: 0 0 1.5mm; font-size: 11pt; }
.box p { margin: 0 0 1.5mm; font-size: 9.2pt; } .box p:last-child { margin-bottom: 0; }
pre.msg { white-space: pre-wrap; font-family: inherit; font-size: 7.6pt; background: #fff; border: 0.3mm solid #e4dcd6; border-radius: 3mm; padding: 3mm 3.5mm; margin: 0; line-height: 1.45; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; }
th, td { text-align: left; padding: 1.5mm 2mm; border-bottom: 0.3mm solid #eee5df; vertical-align: top; }
th { color: #8a8391; font-weight: 500; font-size: 8.5pt; }
ul { margin: 0; padding-left: 5mm; font-size: 9.2pt; } li { margin: 0.6mm 0; }
.chip { display: inline-block; font-size: 8pt; font-weight: 700; padding: 0.2mm 2mm; border-radius: 10mm; }
.g { background: #e4f5ec; color: #1f7a52; } .y { background: #fdf1dc; color: #a86a12; } .r { background: #fde6e5; color: #c0392b; }
.foot { font-size: 8pt; color: #8a8391; margin-top: auto; }
.new { display: inline-block; background: #ffe58a; color: #5c4300; font-weight: 800; font-size: 7.5pt; padding: 0 1.6mm; border-radius: 1.6mm; vertical-align: 0.4mm; margin-left: 1mm; }
</style></head><body>

<section class="page">
  <div class="eyebrow">돈궁합 · 부부 재무설계 점검 · AFPK 영 플래너 챌린지 2026 · ${TODAY} 기준</div>
  <h1>화면 흐름도</h1>
  <p class="lead">설계사가 세운 계획이 두 분에게 <b>지금도 맞는지</b> 각자 휴대폰으로 따로 묻습니다. 앱은 남편 답 · 아내 답 · 계획 셋을 비교해 <b>어긋난 것만</b> 설계사에게 올립니다. 판정과 상대의 답은 부부에게 보이지 않습니다. <b>앱은 듣고, 설계사가 말합니다.</b></p>
  <div class="flow">
    <div class="node"><span class="who p">설계사</span><b>① 부부 등록</b><small>이름 입력. 재무제표 · 현금흐름표 엑셀을 올리면 질문 카드 후보가 나온다. 입장 코드 6자리 발급</small></div>
    <div class="node"><span class="who p">설계사</span><b>② 안내문 · QR</b><small>"안내문 복사" → 카톡. 이름 · 링크 · 홈 화면 추가 방법 · 코드가 한 번에</small></div>
    <div class="node"><span class="who c">부부 폰</span><b>③ 입장</b><small>코드 → 남편 / 아내 선택. 홈 화면에 추가하면 앱처럼 열린다</small></div>
    <div class="node"><span class="who c">부부 폰</span><b>④ 따로 답하기</b><small>계획을 먼저 보여 주고 "지금도 그렇게 생각하시나요?" 제출하면 고칠 수 없다</small></div>
    <div class="node"><span class="who s">서버</span><b>⑤ 3자 비교</b><small>남편 답 · 아내 답 · 계획. 금액 · 시점 · 보기는 규칙으로, 말로 적은 답만 AI가 뜻을 비교</small></div>
    <div class="node"><span class="who p">설계사</span><b>⑥ 처리 대기</b><small>🔴 전제 폐기 · 🔴 부부 불일치 · 🟡 확인 필요만 올라온다. AI 3줄 요약</small></div>
    <div class="node"><span class="who p">설계사</span><b>⑦ 결정</b><small>재설계 필요 / 상담 때 다루기 / 이건 같은 뜻이에요(AI 오판 기록)</small></div>
    <div class="node last"><span class="who p">설계사</span><b>⑧ 엑셀 다시 읽기 <span class="new">11.04</span></b><small>엑셀에서 다시 설계 → 바뀐 숫자만 골라 반영 → 새 버전. 예전 값은 이력에 남는다</small></div>
  </div>
  <p class="lane-title">언제든 — 맞춰보기를 기다리지 않고 <span class="new">11.04</span></p>
  <div class="lane">
    <div class="node"><span class="who c">부부 한 사람</span><b>"바뀐 게 있어요"</b><small>[내 설계]의 계획 옆 버튼. 이직 · 임신처럼 사정이 바뀌면 바로 알린다. 배우자에게는 안 보인다</small></div>
    <div class="node"><span class="who p">설계사</span><b>처리 대기 "먼저 알린 변화"</b><small>판정하지 않고 AI도 쓰지 않는다. 한 사람의 말이라 셋을 비교할 수 없기 때문</small></div>
    <div class="node last"><span class="who p">설계사</span><b>셋 중 하나로 닫기</b><small>두 분께 같이 묻기(그 카드 1문항 맞춰보기) / 재설계 필요 → ⑧ / 상담 때 다루기</small></div>
  </div>
  <div class="rules">
    <div class="rule"><b>서로의 답은 안 보인다</b><small>판정도 상대의 답도 부부 폰에서는 읽을 수 없게 데이터베이스 권한으로 막았다. 보이는 건 "몇 문항 답했나"뿐</small></div>
    <div class="rule"><b>계획은 설계사가 바꾼다</b><small>부부는 답하고 알리기만 한다. 앱도 계획을 고치거나 새 계획을 제안하지 않는다</small></div>
    <div class="rule"><b>AI는 판단을 돕기만 한다</b><small>말로 적은 답의 뜻 비교와 요약만. 계산 · 재무 조언 · 계획 수정은 하지 않는다. 애매하면 추측하지 않고 설계사에게</small></div>
    <div class="rule"><b>기록은 지워지지 않는다</b><small>카드 값은 덮어쓰지 않고 새 버전으로 쌓인다. 부부가 보낸 답과 알림은 고치거나 지울 수 없다</small></div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">① ② 설계사 — 부부 등록과 안내</div>
  <h2>등록하면 코드가 나오고, 안내문 한 번이면 두 분이 시작합니다</h2>
  <div class="two">
    <div class="col">
      <img class="shot" style="max-height:104mm" src="${img('p1-couples')}">
      <div class="box">
        <p><b>담당 부부</b> — 부부를 고르면 처리 대기 · 질문 카드 · 변경 이력이 그 부부 기준으로 열린다. "처리 대기 N"은 설계사가 볼 건의 수.</p>
        <p><b>이름 고치기</b> — 남편 · 아내 이름은 두 분 폰 화면과 안내문에 그대로 나간다. 이미 입장한 폰은 다음에 앱을 열 때 바뀐다. "표시 이름"은 설계사 화면에만 쓰인다.</p>
        <p><b>지우기</b> — 두 분 폰에서 더 열리지 않고, 진행 중인 맞춰보기는 닫힌다. 답 · 판정 · 카드 기록은 보관되고 왼쪽 메뉴 "지운 부부 보기"에서 되돌린다. 되돌리면 같은 코드로 다시 입장한다.</p>
      </div>
    </div>
    <div class="col">
      <img class="shot" style="max-height:56mm" src="${img('p2-issue')}">
      <div class="box">
        <p><b>엑셀로 등록</b> — 파일 이름이 "남편이름_아내이름_재무제표.xlsx" · "…_현금흐름표.xlsx"면 이름이 채워지고, 등록하면 바로 질문 카드 후보가 나온다. 하나만 올려도 된다.</p>
        <p><b>질문 카드</b> — "빈 카드로 시작"한 부부는 카드를 넣은 뒤에도 아직 맞춰보기를 열 수 없다(카드를 골라 여는 기능은 다음 단계). "연습용 카드 10장"은 첫 맞춰보기 3문항이 바로 열린다.</p>
        <p><b>발급 뒤</b> — 링크로 보내면 코드가 채워진 채 열린다. QR도 있다.</p>
      </div>
      <pre class="msg">${esc(invite)}</pre>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">③ ④ 부부 폰 — 입장부터 전달까지</div>
  <h2>두 분이 각자 몇 분, 서로의 답은 보이지 않습니다</h2>
  <div class="row">
    ${phoneFig('c1-join', '<b>입장</b> — 상담 때 받은 여섯 자리 코드와 남편 / 아내. 브라우저로 열면 "홈 화면에 추가" 방법이 뜬다. 두 분의 답은 설계사만 보고 서로에게는 보이지 않는다', 1)}
    ${phoneFig('c2-home-match', '<b>홈 · 맞춰보기</b> — 설계사가 맞춰보기를 열면 "이제부터 시작할게요". 열린 게 없으면 다음 맞춰보기 날짜(3개월마다)가 보이고, 열리면 탭에 빨간 점이 켜진다', 2)}
    ${phoneFig('c4-round', '<b>문답</b> — 계획을 먼저 보여 주고 묻는다. 금액은 단위 버튼, 시점은 연 · 월. 날짜로 말하기 어려우면 "조건으로 답하기" — 조건부 답은 자동 판정 없이 설계사가 직접 확인한다. 제출하면 못 고친다', 3)}
    ${phoneFig('c5-wait', '<b>대기</b> — 상대가 몇 문항 답했는지만 보인다. 두 분 다 끝나면 설계사에게 함께 전달된다. 화면을 열어 두면 끝나는 대로 넘어간다', 4)}
    ${phoneFig('c6-done', '<b>전달됨</b> — 판정은 보여 주지 않는다. 다음 맞춰보기 날짜만. "먼저 묻기"였다면 두 분이 같게 답할 때 [내 설계]에 반영되고, 다르면 설계사가 다시 본다', 5)}
  </div>
</section>

<section class="page">
  <div class="eyebrow">부부 폰 — "바뀐 게 있어요" <span class="new">11.04</span></div>
  <h2>사정이 바뀌면 맞춰보기를 기다리지 않고 설계사에게만 먼저 알립니다</h2>
  <div class="row" style="gap:6mm">
    ${phoneFig('c3-home-plan', '<b>내 설계</b> — 설계사와 정한 계획이 주제별로. 주제를 누르면 펼쳐지고, 계획마다 "바뀐 게 있어요" 버튼이 있다', 1)}
    ${phoneFig('c7-change', '<b>바뀐 내용</b> — 맞춰보기와 같은 입력(금액 단위 버튼, 연 · 월, 조건, 기타). 설계사에게만 가고 배우자에게는 보이지 않는다. 보내면 못 고친다', 2)}
    ${phoneFig('c8-change-sent', '<b>전달됨</b> — 홈의 그 계획 옆에 "설계사님께 전달됨"이 뜬다. 설계사가 처리하면 풀려서 다시 알릴 수 있다', 3)}
    <div class="col" style="flex:1.3">
      <div class="box"><h3>왜 이렇게 만들었나</h3>
        <p>팀장님 질문(11.04): "집안 사정이 바뀌면 고객이 엑셀을 직접 고치게 할 수 있을까?"</p>
        <p>고객이 설계안 엑셀을 고치면 ① 설계사의 원래 계획이 사라져 셋을 비교할 수 없고 ② 한 파일을 둘이 쓰면 배우자가 고친 걸 바로 보게 되고 ③ 누가 언제 바꿨는지 남지 않는다. 그래서 고객은 <b>알리기만</b> 하고, 계획은 설계사가 엑셀에서 다시 세운다.</p>
      </div>
      <div class="box"><h3>설계사 쪽에서는</h3>
        <ul>
          <li>처리 대기 맨 위 "먼저 알린 변화"에 계획과 알린 내용이 나란히 보인다. 판정하지 않고 AI도 쓰지 않는다</li>
          <li><b>두 분께 같이 묻기</b> — 그 카드 1문항으로 두 분 폰에 맞춰보기가 열린다. 이미 열린 맞춰보기가 있으면 "끝난 뒤 다시"</li>
          <li><b>재설계 필요</b> — 엑셀에서 다시 설계한 뒤 질문 카드 → "엑셀 다시 읽기"로 반영</li>
          <li><b>상담 때 다루기</b> — 메모를 남기고 닫는다</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑤ ⑥ ⑦ 판정과 처리 대기</div>
  <h2>어긋난 것만 올라오고, 무엇을 할지는 설계사가 정합니다</h2>
  <div class="two">
    <img class="shot" style="max-height:152mm" src="${img('p3-queue')}">
    <div class="col">
      <div class="box"><h3>3자 비교 — 두 답이 각각 계획과 맞는가, 두 답이 서로 맞는가</h3>
        <table>
          <tr><th>상황</th><th>판정</th><th>설계사에게</th></tr>
          <tr><td>둘 다 계획과 같고 서로 같음</td><td><span class="chip g">🟢</span></td><td>올라오지 않음</td></tr>
          <tr><td>조금 다름 (허용 범위의 두 배 안)</td><td><span class="chip y">🟡</span></td><td>다음 맞춰보기에 다시. 2번 연속이면 🔴</td></tr>
          <tr><td>두 분은 같은데 계획과 크게 다름</td><td><span class="chip r">🔴 전제 폐기</span></td><td>계획이 현실을 못 따라옴 → 재설계</td></tr>
          <tr><td>두 분이 서로 다르게 앎</td><td><span class="chip r">🔴 부부 불일치</span></td><td>상담 안건</td></tr>
          <tr><td>해석 못 함 ("애 낳고 나서")</td><td><span class="chip y">🟡 확인 필요</span></td><td>추측하지 않고 설계사에게</td></tr>
        </table>
      </div>
      <div class="box"><h3>세 가지 처리</h3>
        <ul>
          <li><b>재설계 필요</b> — 두 분 생각이 계획과 달라졌다. 앱 밖(엑셀)에서 다시 설계하고 "엑셀 다시 읽기"로 반영</li>
          <li><b>상담 때 다루기</b> — 다음 상담 안건으로. 메모를 남기고 닫는다</li>
          <li><b>이건 같은 뜻이에요</b> — AI 오판으로 기록. 다음에 판단 규칙을 고칠 때 시험 사례가 된다</li>
        </ul>
      </div>
      <div class="box"><h3>카드 위 작은 글씨</h3>
        <ul>
          <li>"AI 판별 · 프롬프트 v…" / "규칙 판별" — 이 판정을 누가 냈는지. 말로 적은 답만 AI</li>
          <li>"AI 요약" — 🔴 · 확인 필요 건만. 사실 · 영향 · 확인할 질문. 조언 · 계산 없음</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">질문 카드 — 보기 · 추가 · 엑셀로 만들기</div>
  <h2>카드는 "지금도 그렇게 생각하시나요?"로 묻는 계획입니다</h2>
  <div class="row" style="gap:5mm">
    <figure class="ph" style="flex:1.5"><img class="shot" style="max-height:112mm" src="${img('p4-card-view')}"><figcaption><b>카드 보기</b> — 카드를 고르면 두 분 폰에 어떻게 나가는지 보인다. <b>앱 안에서는 계획을 바꾸지 않는다.</b> 두 분 생각이 달라지면 처리 대기에서 "재설계 필요"로 표시하고, 엑셀에서 다시 설계한 뒤 "엑셀 다시 읽기"로 반영한다. "동의 대기" · "동의 안 됨" 표시는 예전 방식(앱에서 값을 고쳐 먼저 묻기)으로 만든 버전에만 남아 있다</figcaption></figure>
    <figure class="ph" style="flex:0.8"><img class="shot" style="max-height:112mm" src="${img('p5-card-add')}"><figcaption><b>카드 추가</b> — 설계안에 있는 계획을 한 장 더 만든다. 저장하면 v1이 바로 계획이 된다</figcaption></figure>
    <figure class="ph" style="flex:0.8"><img class="shot" style="max-height:112mm" src="${img('p6-extract')}"><figcaption><b>엑셀로 만들기</b> — 표에 적힌 항목 이름과 금액을 그대로 옮겨 카드 후보를 만든다. 숫자는 AI를 거치지 않고, 엑셀 내용은 브라우저 밖으로 나가지 않는다. 금액은 "만원"을 원으로 바꾼 값. 고른 카드만 저장된다. 표가 아닌 글 엑셀일 때만 칸의 글을 AI에 보내 초안을 만든다(실제 고객이면 이름 · 연락처 · 주민번호를 지우고)</figcaption></figure>
  </div>
</section>

<section class="page">
  <div class="eyebrow">⑧ 엑셀 다시 읽기와 변경 이력 <span class="new">11.04</span></div>
  <h2>엑셀을 고쳐 저장하고 "다시 읽기"만 — 바뀐 숫자만 반영되고 예전 값은 남습니다</h2>
  <div class="flow">
    <div class="node"><span class="who p">설계사</span><b>처음 한 번 연결</b><small>질문 카드 → "재무제표 엑셀로 만들기" → "이 컴퓨터 파일로 연결". 크롬 · 엣지 컴퓨터에서만 (다른 브라우저는 파일을 다시 고른다)</small></div>
    <div class="node"><span class="who p">설계사</span><b>엑셀에서 다시 설계</b><small>재설계가 필요한 건을 엑셀에서 고치고 저장한다. 앱은 계산하지 않는다</small></div>
    <div class="node"><span class="who p">설계사</span><b>"엑셀 다시 읽기"</b><small>질문 카드 맨 위 버튼. 브라우저가 허락을 물으면 "허용". 바뀐 숫자만 "지금 카드 → 엑셀"로 보인다. 그대로인 항목은 다시 만들지 않는다</small></div>
    <div class="node last"><span class="who s">서버</span><b>반영 → 새 버전</b><small>v1 → v2로 바로 계획이 된다. 맞춰보기에서 묻는 중인 카드는 반영 못 함(두 분이 답한 뒤 다시). 엑셀에서 사라진 항목의 카드는 그대로 둔다</small></div>
  </div>
  <div class="two" style="grid-template-columns: 1.4fr 1fr">
    <img class="shot" style="max-height:104mm" src="${img('p7-history')}">
    <div class="col">
      <div class="box"><h3>변경 이력</h3>
        <p>카드 값은 덮어쓰지 않는다. 모든 버전이 이전 값 · 이후 값 · 이유와 함께 남는다. 엑셀 다시 읽기로 바뀐 값은 이유에 "엑셀 다시 읽기 (파일 이름): 이전 → 이후"가 적힌다.</p>
        <p>"동의 대기"는 두 분이 아직 먼저 묻기에 답하지 않은 버전, "동의 안 됨"은 답했지만 두 분 생각이 새 값과 맞지 않아 계획이 되지 못한 버전이다.</p>
      </div>
      <div class="box"><h3>같은 카드를 어떻게 찾나</h3>
        <p>엑셀로 만든 카드는 "어느 표의 어느 줄"인지 기억한다. 카드 이름을 고쳐도 같은 카드로 찾는다. 예전에 만든 카드는 이름이 같고 하나뿐일 때만 같은 카드로 보고, 애매하면 추측하지 않고 새 항목으로 보여 준다.</p>
      </div>
    </div>
  </div>
</section>

<section class="page">
  <div class="eyebrow">팀원용 정리 · ${TODAY}</div>
  <h2>지금 어디까지 됐고, 무엇이 남았나</h2>
  <div class="two" style="grid-template-columns: 1fr 1fr">
    <div class="col">
      <div class="box"><h3>확인한 것</h3>
        <table>
          <tr><td style="width:30%"><b>기능 점검</b></td><td>자동 점검 107개 모두 통과. 판정 규칙, 금액 · 날짜 읽기, 제도 계산, 엑셀 읽기가 의도대로 도는지 고칠 때마다 다시 검사한다</td></tr>
          <tr><td><b>처음부터 끝까지</b></td><td>실제 서버에서 39단계 통과. 가상의 폰 2대와 설계사가 등록 → 답하기 → 판정 → 처리까지</td></tr>
          <tr><td><b>11.04 새 기능</b></td><td>실제 데이터베이스에서 19가지 확인. "바뀐 게 있어요"가 배우자에게 안 보이는지, 보낸 뒤 못 고치는지, 엑셀 다시 읽기가 바뀐 숫자만 반영하고 예전 값을 남기는지</td></tr>
          <tr><td><b>AI 판단 정확도</b></td><td>규칙을 다 만든 뒤 새로 쓴 10건 중 8건(다른 날 7건). AI 없이 단어 겹침만 보면 2건</td></tr>
          <tr><td><b>주소</b></td><td>afpk-dongunghap.vercel.app — 연습용 부부 "남편 · 아내" (입장 코드 482913)</td></tr>
        </table>
      </div>
    </div>
    <div class="col">
      <div class="box"><h3>회의에서 정한 것 (반영됨)</h3>
        <ul>
          <li>계획을 먼저 보여 주고 "지금도 그렇게 생각하시나요?"로 묻는다</li>
          <li>카드 틀: 주제 10개 · 28장</li>
          <li>판정과 상대의 답은 부부에게 보여 주지 않는다</li>
          <li>앱 안에서는 계획을 바꾸지 않는다 — 재설계는 엑셀에서</li>
          <li>고객이 엑셀을 고치지 않는다 — 대신 "바뀐 게 있어요" (11.04)</li>
        </ul>
      </div>
      <div class="box"><h3>남은 것</h3>
        <ul>
          <li><b>엑셀 AI 역할 정하기</b> — 표가 아닌 글 엑셀에서 AI가 카드 초안을 쓰게 둘지(지금), 규칙만 쓸지</li>
          <li><b>다음 단계로 적을 것</b> — 설계사가 카드를 골라 맞춰보기 열기 · 알림(지금은 카톡 안내문) · 설계사 개인 로그인</li>
          <li><b>직접 확인</b> — 제도 수치를 공식 사이트에서 다시 보기 · 폰 두 대로 시연 리허설</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="foot">이 문서의 화면 그림은 연습용 예시 데이터로 찍어 부부 이름이 "김현우 · 박지우"로 보인다. 실제 앱의 연습용 부부 이름은 "남편 · 아내"다.</div>
</section>
</body></html>`
writeFileSync(`${OUT}/flow.html`, html)
const pg = await (await br.newContext()).newPage()
await pg.goto(`file://${OUT}/flow.html`, { waitUntil: 'load' })
await pg.pdf({ path: PDF, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })
await br.close()
console.log('→', PDF)
