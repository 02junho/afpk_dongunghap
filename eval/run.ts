/**
 * golden set을 현재 프롬프트로 전부 돌려서 혼동행렬·오판 목록·자기일관성을 낸다.
 *   LLM_API_KEY=... LLM_MODEL=... npm run eval
 *   npm run eval -- --repeat=3          같은 입력을 3번 돌려 흔들림을 측정
 *   npm run eval -- --only=g13,g15      일부만
 * 키가 없으면 mock으로 돈다 (형식 확인용. 품질 측정 아님).
 * 결과는 eval/out/<judge버전>-<timestamp>.json 에 남긴다 → 부록 3번 원료.
 *
 * 왜 혼동행렬이 두 개인가:
 *   최종 신호등만 채점하면, LLM이 aVsPlan을 틀렸는데 resolve()가 우연히 같은 신호등을
 *   뱉은 경우를 구분할 수 없다. 이 기획의 주장은 "3자 비교"이므로 중간 라벨을 따로 채점한다.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { judge, PROMPT_VERSIONS, type Card, type Deviation, type Judgment, type Verdict } from '../src/judge/index'
import { createLlmClient, mockLlm } from '../src/judge/text-llm'
import { isAuthError, isRetryable } from './errors'
import seed from '../src/data/seed-cards.json'

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const flag = (name: string) => process.argv.includes(`--${name}`)
const REPEAT = Math.max(1, Number(arg('repeat') ?? 1))
const ONLY = arg('only')?.split(',')
/** 키가 있어도 mock 으로 돌린다 — 베이스라인(키워드 겹침)을 같은 조건에서 재현하기 위해 */
const FORCE_MOCK = flag('mock')

interface GoldenRow {
  id: string
  cardKey: string
  a: string
  b: string
  expect: { verdict: Verdict; redKind?: string; aVsPlan?: Deviation; bVsPlan?: Deviation; abAgree?: boolean }
  note?: string
}

const cards = new Map((seed as Card[]).map(c => [c.key, c]))
const rows: GoldenRow[] = readFileSync(new URL('./golden.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l))
  .filter((r: GoldenRow) => !ONLY || ONLY.includes(r.id))

for (const r of rows) if (!cards.has(r.cardKey)) throw new Error(`golden ${r.id}: seed-cards.json 에 '${r.cardKey}' 없음`)

const useMock = FORCE_MOCK || !process.env.LLM_API_KEY
const llm = useMock
  ? mockLlm
  : createLlmClient({ apiKey: process.env.LLM_API_KEY!, model: process.env.LLM_MODEL!, baseUrl: process.env.LLM_BASE_URL })
const modelLabel = useMock ? 'mock(키워드 겹침)' : (process.env.LLM_MODEL ?? '(모델 미지정)')
if (useMock && !FORCE_MOCK) console.warn('⚠ LLM_API_KEY 없음 → mock 으로 돕니다')
if (!useMock && !process.env.LLM_MODEL) {
  console.error('✗ LLM_MODEL 이 없습니다. 예: LLM_MODEL=claude-sonnet-5-5')
  process.exit(1)
}

/**
 * 인증 실패는 60번 재시도해도 소용없다 → 즉시, 읽을 수 있게 끝낸다.
 * 일시적 실패(429·5xx·네트워크)는 물러나며 재시도하고, 그래도 안 되면 그 행만 버리고 계속한다.
 * 호출 한 번 때문에 측정 전체를 잃지 않는다.
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function judgeWithRetry(card: Card, a: string, b: string, tries = 3): Promise<Judgment | { error: string }> {
  for (let i = 0; ; i++) {
    try {
      return await judge(card, a, b, llm)
    } catch (e) {
      const msg = (e as Error).message
      if (isAuthError(msg)) {
        console.error(`\n✗ LLM 인증 실패 — LLM_API_KEY 를 확인하세요 (플레이스홀더를 그대로 붙여넣지 않았는지).\n  ${msg.slice(0, 200)}\n`)
        process.exit(1)
      }
      if (i + 1 >= tries || !isRetryable(msg)) return { error: msg }
      const wait = 500 * 2 ** i
      console.warn(`  재시도 ${i + 1}/${tries - 1} (${wait}ms) · ${msg.slice(0, 80)}`)
      await sleep(wait)
    }
  }
}

const V: Verdict[] = ['green', 'yellow', 'red']
const D: Deviation[] = ['match', 'minor', 'major']
const zeros = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map(e => [e, Object.fromEntries(keys.map(p => [p, 0]))])) as Record<string, Record<string, number>>

const verdictMatrix = zeros(V)
const deviationMatrix = zeros(D)
let scored = 0
let devScored = 0, devCorrect = 0
let agreeScored = 0, agreeCorrect = 0
const misses: any[] = []
const unstable: any[] = []
const failures: { id: string; card: string; error: string }[] = []

for (const r of rows) {
  const card = cards.get(r.cardKey)!
  const runs: Judgment[] = []
  for (let i = 0; i < REPEAT; i++) {
    const out = await judgeWithRetry(card, r.a, r.b)
    if ('error' in out) {
      failures.push({ id: r.id, card: card.key, error: out.error })
      break
    }
    runs.push(out)
  }
  if (!runs.length) continue // 이 행은 측정에서 빠진다. 아래에서 따로 보고한다
  scored++
  const j = runs[0]

  // 자기일관성: 같은 입력에 같은 답이 나오는가 (temperature 0 이어도 흔들린다)
  const sig = (x: typeof j) => `${x.verdict}/${x.redKind ?? '-'}/${x.aVsPlan}/${x.bVsPlan}/${x.abAgree}`
  const sigs = new Set(runs.map(sig))
  if (sigs.size > 1) unstable.push({ id: r.id, card: card.key, variants: [...sigs] })

  verdictMatrix[r.expect.verdict][j.verdict]++
  const kindOk = !r.expect.redKind || r.expect.redKind === j.redKind

  // 중간 라벨 채점 (golden에 라벨이 있을 때만)
  for (const side of ['aVsPlan', 'bVsPlan'] as const) {
    const exp = r.expect[side]
    if (!exp) continue
    const got = j[side]
    devScored++
    if (got === exp) devCorrect++
    if (got !== 'unparsed') deviationMatrix[exp][got]++
  }
  if (r.expect.abAgree !== undefined) {
    agreeScored++
    if (j.abAgree === r.expect.abAgree) agreeCorrect++
  }

  const midOk =
    (!r.expect.aVsPlan || r.expect.aVsPlan === j.aVsPlan) &&
    (!r.expect.bVsPlan || r.expect.bVsPlan === j.bVsPlan) &&
    (r.expect.abAgree === undefined || r.expect.abAgree === j.abAgree)

  if (j.verdict !== r.expect.verdict || !kindOk || !midOk)
    misses.push({
      id: r.id, card: card.key, a: r.a, b: r.b,
      expect: r.expect,
      got: { verdict: j.verdict, redKind: j.redKind, aVsPlan: j.aVsPlan, bVsPlan: j.bVsPlan, abAgree: j.abAgree, reason: j.reason },
      verdictOk: j.verdict === r.expect.verdict && kindOk,
      note: r.note,
    })
}

const total = rows.length
const verdictCorrect = scored - misses.filter(m => !m.verdictOk).length
const fullCorrect = scored - misses.length
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : '—')

const table = (name: string, keys: readonly string[], m: Record<string, Record<string, number>>) => {
  const lines = [`\n[${name}]  expect \\ got${keys.map(k => k.padStart(8)).join('')}`]
  for (const e of keys) lines.push(`${e.padEnd(18)}${keys.map(p => String(m[e][p]).padStart(8)).join('')}`)
  return lines.join('\n')
}

console.log(`\nprompt judge=${PROMPT_VERSIONS.judge} · model=${modelLabel} · ${total}건 × ${REPEAT}회`)
if (useMock)
  console.log(
    '⚠ 이 숫자는 프롬프트 품질이 아닙니다. mock 은 LLM이 아니라 토큰 겹침(Jaccard)으로 답하는\n' +
    '  **베이스라인**입니다. "의미 비교에 LLM이 왜 필요한가"의 대조군으로만 쓰세요.',
  )
if (failures.length) console.log(`⚠ 호출 실패로 ${failures.length}건 제외 — 아래 참조`)
console.log(`신호등 정확도      ${verdictCorrect}/${scored} (${pct(verdictCorrect, scored)})`)
console.log(`중간 라벨 정확도   ${devCorrect}/${devScored} (${pct(devCorrect, devScored)})   ← 3자 비교가 실제로 맞았는가`)
console.log(`abAgree 정확도     ${agreeCorrect}/${agreeScored} (${pct(agreeCorrect, agreeScored)})`)
console.log(`전부 일치          ${fullCorrect}/${scored} (${pct(fullCorrect, scored)})`)
if (REPEAT > 1) console.log(`자기일관성         ${scored - unstable.length}/${scored} (${pct(scored - unstable.length, scored)})`)
console.log(table('신호등', V, verdictMatrix))
console.log(table('편차(A·B 각각)', D, deviationMatrix))

if (misses.length) {
  console.log('\n--- 오판 ---')
  for (const m of misses) {
    const mark = m.verdictOk ? '신호등은 맞음(중간 라벨 불일치)' : '신호등 오판'
    console.log(`${m.id} [${m.card}] ${mark}
   expect ${JSON.stringify(m.expect)}
   got    ${JSON.stringify(m.got)}
   A: ${m.a}
   B: ${m.b}
   note: ${m.note ?? ''}`)
  }
}
if (unstable.length) {
  console.log('\n--- 같은 입력, 다른 답 (temperature 0 인데도) ---')
  for (const u of unstable) console.log(`${u.id} [${u.card}]\n   ${u.variants.join('\n   ')}`)
}
if (failures.length) {
  console.log('\n--- 호출 실패 (측정에서 제외됨) ---')
  for (const f of failures) console.log(`${f.id} [${f.card}] ${f.error.slice(0, 160)}`)
}

mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
const out = new URL(`./out/${PROMPT_VERSIONS.judge}-${Date.now()}.json`, import.meta.url)
writeFileSync(out, JSON.stringify({
  promptVersions: PROMPT_VERSIONS,
  model: modelLabel,
  isBaseline: useMock,
  repeat: REPEAT,
  total,
  scored,
  failures,
  verdictCorrect,
  deviation: { scored: devScored, correct: devCorrect },
  abAgree: { scored: agreeScored, correct: agreeCorrect },
  fullCorrect,
  verdictMatrix,
  deviationMatrix,
  misses,
  unstable,
}, null, 2))
console.log(`\n저장: ${out.pathname}`)
