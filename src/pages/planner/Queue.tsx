import { useEffect, useState } from 'react'
import Rail from './Rail'
import {
  answerLine, byKey, CATEGORIES, DEMO_ANSWERS, DEMO_JUDGMENTS, DEMO_QUEUE, DEMO_SUMMARY, chipOf, loadLiveRound, showAnswer, showPlanned,
} from '../../data/demo'
import type { Card, Judgment, RedKind } from '../../judge/index'

/** 부부는 계획을 보지 않고 답한다 (11.05 목표 질문) — 설계사에겐 답과 "계획과 같음 / 다름"을 나란히 */
const asSaid = (c: Card, raw: string) => answerLine(showAnswer(c, raw), raw, String(c.plannedValue))
import { apiKey, remember, remembered, usePlanner } from './planner'
import { THEMES } from '../../data/template'
import { REVIEW } from '../../data/review'


/**
 * 큐를 닫는 버튼 = judgments.resolution 값 그대로.
 * 11.04 새 방향(docs/21): 6주 뒤 상담에서 한꺼번에 다루므로 "확인함"(consult)과 "이건 같은 뜻이에요"(AI 오판) 둘만.
 * 확인한 건은 사이클 정리 화면에 ✓ 와 메모로 남는다. replan · factcheck 는 예전 기록 표시용.
 */
type Resolution = 'replan' | 'factcheck' | 'consult' | 'false_positive'
const RESOLVED = {
  replan: { text: '재설계 필요', cls: 'chip-escalate' },
  factcheck: { text: '두 분께 다시 물음', cls: 'chip-talk' },
  consult: { text: '확인함', cls: 'chip-agree' },
  false_positive: { text: '같은 뜻으로 정리', cls: 'chip-agree' },
} as const

interface Item {
  id: string
  key: string
  category: Card['category']
  label: string
  planned: string
  type?: Card['type']
  verdict: Judgment['verdict']
  redKind?: RedKind | null
  needsReview?: boolean
  method: Judgment['method']
  promptVersion?: string | null
  a: string
  b: string
  reason?: string
  summary?: string | null
  roundLabel: string
}

/**
 * 🔴 전부 + 자동 판정이 안 된 🟡(확인 필요)이 올라온다.
 * live: /api/planner (service_role, 설계사 코드 — Rail 이 받는다). 데모: 고정 데이터 또는 한 기기 데모 결과.
 * "이건 같은 뜻이에요"(AI 오판 표시)는 부부가 아니라 설계사가 누른다 — 부부는 판정을 보지 않으므로.
 */
/** 서버 응답 → 화면 항목. 부부는 계획을 보지 않고 답한다 (11.05) — 답 옆에 계획과 같은지만 붙인다 */
function toItems(rows: any[]): Item[] {
  const show = (r: any, ans: string) => {
    const raw = String(ans ?? '')
    const v = showPlanned(r.type, r.unit, raw, r.key)
    return answerLine(v, raw, String(r.planned ?? ''))
  }
  return rows.map(r => ({
    ...r, a: show(r, r.a), b: show(r, r.b), planned: showPlanned(r.type, r.unit, String(r.planned ?? ''), r.key),
    roundLabel: '주간 질문',
  }))
}

export default function Queue() {
  const p = usePlanner()
  const qkey = apiKey('queue', p.couple.id)
  const cachedItems = () => { const r = remembered<{ items: any[] }>(qkey); return r ? toItems(r.items) : null }
  const [items, setItems] = useState<Item[] | null>(() => (p.live && p.pass ? cachedItems() : null))
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState<Record<string, Resolution>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    setErr('')
    try {
      const r = remember(qkey, await p.call<{ items: any[] }>('queue'))
      setItems(toItems(r.items))
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { if (p.live && p.pass) { setItems(cachedItems()); void load() } else setItems(null) }, [p.live, p.pass, p.couple.id])

  async function resolve(it: Item, r: Resolution) {
    if (p.live && p.pass) {
      setBusy(true)
      try { await p.call('resolve', { judgmentId: it.id, resolution: r, note: note[it.id] ?? '' }) }
      catch (e) { setErr((e as Error).message); setBusy(false); return }
      setBusy(false)
    }
    setDone(d => ({ ...d, [it.id]: r }))
  }

  async function summarize(it: Item) {
    setBusy(true)
    try {
      const { summary } = await p.call<{ summary: string }>('summarize', { judgmentId: it.id })
      setItems(list => (list ?? []).map(x => x.id === it.id ? { ...x, summary } : x))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }


  // 데모 항목 (live 가 아니거나 코드 전): 한 기기 데모 결과가 있으면 그것, 없으면 고정 데모
  const demoItems: Item[] = (() => {
    const local = loadLiveRound()
    const judgments: Record<string, Judgment> = local ? { ...DEMO_JUDGMENTS, ...local.judgments } : DEMO_JUDGMENTS
    const keys = local ? Object.keys(judgments).filter(k => judgments[k].verdict === 'red' || judgments[k].needsReview) : DEMO_QUEUE
    return keys.map(k => {
      const c = byKey(k), j = judgments[k]
      const l = local?.answers[k]
      const a = l?.husband && l?.wife ? { husband: l.husband.text, wife: l.wife.text } : DEMO_ANSWERS[k]
      return {
        id: k, key: k, category: c.category, label: c.label, planned: showAnswer(c, String(c.plannedValue)), type: c.type,
        verdict: j.verdict, redKind: j.redKind, needsReview: j.needsReview, method: j.method, promptVersion: j.promptVersion,
        a: asSaid(c, a.husband), b: asSaid(c, a.wife), reason: j.reason, summary: DEMO_SUMMARY[k], roundLabel: `${THEMES.find(t => t.category === c.category)?.week ?? 1}주차`,
      }
    })
  })()

  const liveMode = p.live && p.pass
  const showing: Item[] = liveMode ? (items ?? []) : demoItems
  const open = showing.filter(i => !done[i.id])

  return (
    <div className="console">
      <Rail count={open.length} />
      <main className="work">
        <h1 className="work-title">처리 대기 · {p.couple.label} {!(liveMode && items === null) && <span className="meta" style={{ fontSize: 15 }}>{open.length}건</span>}</h1>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        {msg && <p className="note" style={{ color: 'var(--agree)' }}>{msg}</p>}
        {liveMode && items === null && !err && <p className="note">불러오는 중…</p>}

        <div style={{ marginTop: 22 }}>
          {showing.map(it => {
            const cat = CATEGORIES[it.category]
            const res = done[it.id]
            const chip = res ? RESOLVED[res] : chipOf(it)
            // 한 칸 3줄 (11.14 팀 요청): AI 2줄(차이 · 함께 흔들리는 계획) + 팀이 정한 검토 기준 1줄. 질문 줄은 보이지 않는다
            const ai = it.summary
              ? it.summary.split('\n').map(l => l.trim().replace(/[.。]$/, '')).filter(l => l && !/[?？]$/.test(l)).slice(0, 2).join('\n')
              : (it.reason || '요약 없음 — 설계사가 두 답변을 직접 봅니다')
            const check = REVIEW[it.key]?.check
            const summary = check ? `${ai}\n검토 기준 — ${check}` : ai
            return (
              <div className="qcard" key={it.id} style={res ? { opacity: 0.6 } : undefined}>
                <div className="queue-top">
                  <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{it.label}</span>
                  <span className={`chip ${chip.cls}`}>{chip.text}</span>
                  <span className="meta">{it.method === 'llm' ? 'AI 판별' : '규칙 판별'}</span>
                  <span className="queue-couple">{p.couple.label} · {it.roundLabel}</span>
                </div>
                <dl className="pair" style={{ gridTemplateColumns: '72px 1fr' }}>
                  <dt className="meta" style={{ paddingTop: 3 }}>계획</dt><dd style={{ color: 'var(--muted)' }}>{it.planned}</dd>
                  <dt><span className="avatar avatar-him">{p.couple.husband.slice(0, 1)}</span></dt><dd>{it.a}</dd>
                  <dt><span className="avatar avatar-her">{p.couple.wife.slice(0, 1)}</span></dt><dd>{it.b}</dd>
                </dl>
                <p className="summary" style={{ whiteSpace: 'pre-line' }}>
                  <span className="summary-by">
                    {it.summary ? 'AI 요약' : it.needsReview ? '자동 판정 불가' : 'AI 판별 사유'}
                    {liveMode && !it.summary && !res && (
                      <button className="btn btn-quiet btn-small" style={{ marginLeft: 10, padding: '2px 10px', fontSize: 11 }} disabled={busy} onClick={() => summarize(it)}>
                        AI 요약 만들기
                      </button>
                    )}
                  </span>
                  {summary}
                </p>
                {!res && (
                  <>
                    {liveMode && (
                      <input className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)', marginTop: 12 }}
                        value={note[it.id] ?? ''} onChange={e => setNote(n => ({ ...n, [it.id]: e.target.value }))} placeholder="메모 (선택)" />
                    )}
                    <div className="actions">
                      <button className="btn btn-small" disabled={busy} title="봤다는 표시와 메모가 사이클 정리에 남습니다. 상담 때 함께 봅니다"
                        onClick={() => resolve(it, 'consult')}>확인함</button>
                      {/* AI 오판 기록 — 고른 보기를 규칙이 비교한 건에는 오판이 없다 (11.05 객관식) */}
                      {it.method === 'llm' && (
                        <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }} disabled={busy}
                          title="AI가 잘못 판단한 건으로 기록합니다"
                          onClick={() => resolve(it, 'false_positive')}>이건 같은 뜻이에요</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {!open.length && (!liveMode || items !== null) && <p className="note">처리할 건이 없습니다.</p>}
        </div>

        {liveMode && (
          <div className="actions" style={{ marginTop: 28 }}>
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={load}>새로고침</button>
          </div>
        )}
      </main>
    </div>
  )
}
