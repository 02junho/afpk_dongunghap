import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, type Card, type Deviation, type Verdict } from '../../src/judge/index'
import seed from '../../src/data/seed-cards.json'

/**
 * golden set의 정답 라벨 자체를 검증한다.
 * 라벨을 사람이 손으로 적으므로, 중간 라벨(aVsPlan·bVsPlan·abAgree)과 최종 신호등이
 * 서로 모순인 행이 생길 수 있다. 그런 행은 프롬프트를 아무리 고쳐도 맞출 수 없다 —
 * eval 결과를 조용히 오염시키는 가장 흔한 사고다.
 */
interface Row {
  id: string
  cardKey: string
  a: string
  b: string
  expect: { verdict: Verdict; redKind?: string; aVsPlan?: Deviation; bVsPlan?: Deviation; abAgree?: boolean }
  note?: string
}

const rows: Row[] = readFileSync(new URL('../golden.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l))
const cards = new Map((seed as Card[]).map(c => [c.key, c]))

describe('golden set 자체 검증', () => {
  it('비어 있지 않다', () => expect(rows.length).toBeGreaterThan(0))

  it('모든 cardKey 가 seed-cards.json 에 있다', () => {
    for (const r of rows) expect(cards.has(r.cardKey), `${r.id}: ${r.cardKey}`).toBe(true)
  })

  it('id 가 중복되지 않는다', () => {
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
  })

  it('text 카드만 들어 있다 (LLM 판별 대상)', () => {
    for (const r of rows) expect(cards.get(r.cardKey)!.type, r.id).toBe('text')
  })

  it('중간 라벨과 최종 신호등이 서로 모순이 아니다', () => {
    for (const r of rows) {
      const { aVsPlan, bVsPlan, abAgree, verdict, redKind } = r.expect
      if (!aVsPlan || !bVsPlan || abAgree === undefined) continue
      const derived = resolve(aVsPlan, bVsPlan, abAgree)
      expect(derived.verdict, `${r.id} (${aVsPlan}/${bVsPlan}/${abAgree})`).toBe(verdict)
      if (redKind) expect(derived.redKind, r.id).toBe(redKind)
      else expect(derived.redKind, r.id).toBeUndefined()
    }
  })

  it('모든 행에 중간 라벨이 있다 — 3자 비교를 채점하려면 필수', () => {
    for (const r of rows) {
      expect(r.expect.aVsPlan, r.id).toBeDefined()
      expect(r.expect.bVsPlan, r.id).toBeDefined()
      expect(r.expect.abAgree, r.id).toBeDefined()
    }
  })

  // 11.05: 계획과 다르면 🔴 하나 — AI 라벨(match · minor · major)에서는 🟢 · 🔴 만 나온다. 🟡 는 규칙이 못 읽은 답에서만
  it('🟢 · 🔴 가 모두 충분히 들어 있다 (혼동행렬이 의미를 가지려면)', () => {
    const count = (v: Verdict) => rows.filter(r => r.expect.verdict === v).length
    for (const v of ['green', 'red'] as Verdict[]) expect(count(v), v).toBeGreaterThanOrEqual(3)
  })

  it('세 편차 라벨이 모두 들어 있다 — "조금 다름"도 다름으로 잡는지 보려면', () => {
    const labels = new Set(rows.flatMap(r => [r.expect.aVsPlan, r.expect.bVsPlan]))
    for (const d of ['match', 'minor', 'major']) expect(labels, d).toContain(d)
  })
})
