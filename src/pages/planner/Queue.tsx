import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Rail from './Rail'
import {
  byKey, CATEGORIES, DEMO_ANSWERS, DEMO_JUDGMENTS, DEMO_QUEUE, DEMO_SUMMARY, KIND_CHIP, loadLiveRound, showAnswer,
} from '../../data/demo'
import type { Card, Judgment, RedKind } from '../../judge/index'
import { usePlanner } from './planner'

/** 큐를 닫는 버튼 셋 = judgments.resolution 값 그대로 */
type Resolution = 'factcheck' | 'consult' | 'false_positive'
const RESOLVED = {
  factcheck: { text: '카드 고치러 감', cls: 'chip-talk' },
  consult: { text: '상담 안건', cls: 'chip-agree' },
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
export default function Queue() {
  const nav = useNavigate()
  const p = usePlanner()
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState<Record<string, Resolution>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    setErr('')
    try {
      const { items } = await p.call<{ items: any[] }>('queue')
      setItems(items.map(r => ({ ...r, roundLabel: r.roundKind === 'baseline' ? '0회차' : r.roundKind === 'factcheck' ? '먼저 묻기' : '정기' })))
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { if (p.live && p.pass) void load(); else setItems(null) }, [p.live, p.pass, p.couple.id])

  async function resolve(it: Item, r: Resolution) {
    if (p.live && p.pass) {
      setBusy(true)
      try { await p.call('resolve', { judgmentId: it.id, resolution: r, note: note[it.id] ?? '' }) }
      catch (e) { setErr((e as Error).message); setBusy(false); return }
      setBusy(false)
    }
    setDone(d => ({ ...d, [it.id]: r }))
    if (r === 'factcheck') nav('/p/cards')
  }

  async function summarize(it: Item) {
    setBusy(true)
    try {
      const { summary } = await p.call<{ summary: string }>('summarize', { judgmentId: it.id })
      setItems(list => (list ?? []).map(x => x.id === it.id ? { ...x, summary } : x))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  async function newRound() {
    setBusy(true)
    try { await p.call('new_round'); setMsg('새 0회차를 열었습니다. 부부 홈에서 시작할 수 있어요.') }
    catch (e) { setErr((e as Error).message) }
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
        a: showAnswer(c, a.husband), b: showAnswer(c, a.wife), reason: j.reason, summary: DEMO_SUMMARY[k], roundLabel: '0회차',
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
        <h1 className="work-title">처리 대기 · {p.couple.label} <span className="meta" style={{ fontSize: 15 }}>{open.length}건</span></h1>
        <p className="meta">전제가 깨진 건과, 자동으로 판정하지 못한 건만 올라옵니다. 두 분이 같게 본 항목은 여기 오지 않습니다.</p>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        {msg && <p className="note" style={{ color: 'var(--agree)' }}>{msg}</p>}
        {liveMode && items === null && !err && <p className="note">불러오는 중…</p>}

        <div style={{ marginTop: 22 }}>
          {showing.map(it => {
            const cat = CATEGORIES[it.category]
            const res = done[it.id]
            const chip = res ? RESOLVED[res] : it.verdict === 'red' ? KIND_CHIP[(it.redKind ?? 'couple_conflict') as RedKind] : KIND_CHIP.needs_review
            const summary = it.summary ?? (it.reason || '요약 없음 — 설계사가 두 답변을 직접 봅니다')
            return (
              <div className="qcard" key={it.id} style={res ? { opacity: 0.6 } : undefined}>
                <div className="queue-top">
                  <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{it.label}</span>
                  <span className={`chip ${chip.cls}`}>{chip.text}</span>
                  <span className="meta">{it.method === 'llm' ? `AI 판별 · 프롬프트 ${it.promptVersion ?? '-'}` : '규칙 판별'}</span>
                  <span className="queue-couple">{p.couple.label} · {it.roundLabel}</span>
                </div>
                <dl className="pair" style={{ gridTemplateColumns: '72px 1fr' }}>
                  <dt className="meta" style={{ paddingTop: 3 }}>설계 전제</dt><dd style={{ color: 'var(--muted)' }}>{it.planned}</dd>
                  <dt><span className="avatar avatar-him">{p.couple.husband.slice(0, 1)}</span></dt><dd>{it.a}</dd>
                  <dt><span className="avatar avatar-her">{p.couple.wife.slice(0, 1)}</span></dt><dd>{it.b}</dd>
                </dl>
                <p className="summary" style={{ whiteSpace: 'pre-line' }}>
                  <span className="summary-by">
                    {it.summary ? 'AI 요약 · ' : it.needsReview ? '자동 판정 불가 · ' : 'AI 판별 사유 · '}설계사 확인 필요
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
                        value={note[it.id] ?? ''} onChange={e => setNote(n => ({ ...n, [it.id]: e.target.value }))} placeholder="메모 (선택) — 왜 이렇게 닫는지 한 줄" />
                    )}
                    <div className="actions">
                      <button className="btn btn-small" disabled={busy} title="가정 카드에서 전제를 고치면 두 분께 먼저 묻는 라운드가 열립니다"
                        onClick={() => resolve(it, 'factcheck')}>두 분께 먼저 묻기</button>
                      <button className="btn btn-quiet btn-small" disabled={busy} title="앱 밖에서. 다음 상담 안건으로"
                        onClick={() => resolve(it, 'consult')}>상담 때 다루기</button>
                      <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }} disabled={busy}
                        title="AI 오판 표시 — golden set 후보로 기록됩니다"
                        onClick={() => resolve(it, 'false_positive')}>이건 같은 뜻이에요</button>
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
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={newRound}>0회차 다시 열기 (리허설)</button>
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={load}>새로고침</button>
          </div>
        )}
      </main>
    </div>
  )
}
