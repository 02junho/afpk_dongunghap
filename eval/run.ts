/**
 * golden set을 현재 프롬프트로 전부 돌려서 혼동행렬과 오탐 목록을 낸다.
 *   LLM_API_KEY=... LLM_MODEL=... npm run eval
 * 키가 없으면 mock으로 돈다 (형식 확인용. 품질 측정 아님).
 * 결과는 eval/out/<PROMPT_VERSION>-<timestamp>.json 에 남긴다 → 부록 3번 원료.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { judge, PROMPT_VERSION, type Card, type Verdict } from '../src/judge/index'
import { createLlmClient, mockLlm } from '../src/judge/text-llm'
import seed from '../src/data/seed-cards.json'

const cards = new Map((seed as Card[]).map(c => [c.key, c]))
const rows = readFileSync(new URL('./golden.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l: string) => JSON.parse(l))

const llm = process.env.LLM_API_KEY
  ? createLlmClient({ apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL!, baseUrl: process.env.LLM_BASE_URL })
  : (console.warn('⚠ LLM_API_KEY 없음 → mock 사용'), mockLlm)

const V: Verdict[] = ['green', 'yellow', 'red']
const confusion: Record<string, Record<string, number>> = Object.fromEntries(V.map(e => [e, Object.fromEntries(V.map(p => [p, 0]))]))
const misses: any[] = []

for (const r of rows) {
  const card = cards.get(r.cardKey)!
  const j = await judge(card, r.a, r.b, llm)
  confusion[r.expect.verdict][j.verdict]++
  const kindOk = !r.expect.redKind || r.expect.redKind === j.redKind
  if (j.verdict !== r.expect.verdict || !kindOk)
    misses.push({ id: r.id, card: card.key, a: r.a, b: r.b, expect: r.expect, got: { verdict: j.verdict, redKind: j.redKind, aVsPlan: j.aVsPlan, bVsPlan: j.bVsPlan, abAgree: j.abAgree, reason: j.reason }, note: r.note })
}

const total = rows.length, correct = total - misses.length
console.log(`\nprompt ${PROMPT_VERSION} · ${correct}/${total} (${((correct / total) * 100).toFixed(0)}%)\n`)
console.log('expect \\ got   green  yellow  red')
for (const e of V) console.log(`${e.padEnd(12)}${V.map(p => String(confusion[e][p]).padStart(7)).join('')}`)
if (misses.length) {
  console.log('\n--- 오판 ---')
  for (const m of misses) console.log(`${m.id} [${m.card}] expect ${JSON.stringify(m.expect)} got ${m.got.verdict}${m.got.redKind ? '/' + m.got.redKind : ''}\n   A: ${m.a}\n   B: ${m.b}\n   → ${m.got.reason}\n   note: ${m.note}`)
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
const out = new URL(`./out/${PROMPT_VERSION}-${Date.now()}.json`, import.meta.url)
writeFileSync(out, JSON.stringify({ promptVersion: PROMPT_VERSION, model: process.env.LLM_MODEL ?? 'mock', total, correct, confusion, misses }, null, 2))
console.log(`\n저장: ${out.pathname}`)
