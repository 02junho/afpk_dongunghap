import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Rail from './Rail'
import {
  byKey, CATEGORIES, DEMO_ANSWERS, DEMO_JUDGMENTS, DEMO_QUEUE, DEMO_SUMMARY, KIND_CHIP, loadLiveRound, showAnswer,
} from '../../data/demo'
import { PLANNER_PASS_KEY, plannerApi } from '../../lib/api'
import { isLive } from '../../lib/db'
import type { Card, Judgment, RedKind } from '../../judge/index'

/** 큐를 닫는 버튼 셋 = judgments.resolution 값 그대로 */
type Resolution = 'factcheck' | 'consult' | 'false_positive'
const RESOLVED = {
  factcheck: { text: '두 분께 묻는 중', cls: 'chip-talk' },
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
 * live: /api/planner (service_role, 설계사 코드). 데모: 고정 데이터 또는 한 기기 데모 결과.
 * "이건 같은 뜻이에요"(AI 오판 표시)는 부부가 아니라 설계사가 누른다 — 부부는 판정을 보지 않으므로.
 */
export default function Queue() {
  const live = isLive()
  const [pass, setPass] = useState(() => sessionStorage.getItem(PLANNER_PASS_KEY) ?? '')
  const [passDraft, setPassDraft] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Record<string, Resolution>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    setErr('')
    try {
      const { items } = await plannerApi<{ items: any[] }>('queue')
      setItems(items.map(r => ({ ...r, roundLabel: r.roundKind === 'baseline' ? '0회차' : r.roundKind === 'factcheck' ? '먼저 묻기' : '정기' })))
    } catch (e) {
      setErr((e as Error).message)
      if ((e as Error).message.includes('틀립니다')) { sessionStorage.removeItem(PLANNER_PASS_KEY); setPass('') }
    }
  }

  useEffect(() => {
    if (live && pass) void load()
  }, [live, pass])

  function enter() {
    sessionStorage.setItem(PLANNER_PASS_KEY, passDraft.trim())
    setPass(passDraft.trim())
  }

  async function resolve(it: Item, r: Resolution) {
    if (live) {
      setBusy(true)
      try { await plannerApi('resolve', { judgmentId: it.id, resolution: r, note: note[it.id] ?? '' }) }
      catch (e) { setErr((e as Error).message); setBusy(false); return }
      setBusy(false)
    }
    setDone(d => ({ ...d, [it.id]: r }))
  }

  async function newRound() {
    setBusy(true)
    try { await plannerApi('new_round'); setErr('새 0회차를 열었습니다. 부부 홈에서 시작할 수 있어요.') }
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

  const showing: Item[] = live && pass ? (items ?? []) : demoItems
  const open = showing.filter(i => !done[i.id])

  return (
    <div className="console">
      <Rail count={open.length} />
      <main className="work">
        <h1 className="work-title">처리 대기 <span className="meta" style={{ fontSize: 15 }}>{open.length}건</span></h1>
        <p className="meta">전제가 깨진 건과, 자동으로 판정하지 못한 건만 올라옵니다. 두 분이 같게 본 항목은 여기 오지 않습니다.</p>

        {live && !pass && (
          <div className="qcard" style={{ marginTop: 22, maxWidth: 420 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>설계사 코드</p>
            <input className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} type="password" value={passDraft}
              onChange={e => setPassDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()} placeholder="상담소 코드" />
            <div className="actions"><button className="btn btn-small" onClick={enter} disabled={!passDraft.trim()}>들어가기</button></div>
            <p className="note">아래는 코드 입력 전 보이는 예시입니다.</p>
          </div>
        )}
        {err && <p className="note" style={{ color: err.startsWith('새 0회차') ? 'var(--agree)' : 'var(--escalate)' }}>{err}</p>}
        {live && pass && items === null && !err && <p className="note">불러오는 중…</p>}

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
                  <span className="queue-couple">김현우 · 박지우 · {it.roundLabel}</span>
                </div>
                <dl className="pair" style={{ gridTemplateColumns: '72px 1fr' }}>
                  <dt className="meta" style={{ paddingTop: 3 }}>설계 전제</dt><dd style={{ color: 'var(--muted)' }}>{it.planned}</dd>
                  <dt><span className="avatar avatar-him">현</span></dt><dd>{it.a}</dd>
                  <dt><span className="avatar avatar-her">지</span></dt><dd>{it.b}</dd>
                </dl>
                <p className="summary">
                  <span className="summary-by">{it.needsReview ? '자동 판정 불가 · ' : it.summary ? 'AI 요약 · ' : 'AI 판별 사유 · '}설계사 확인 필요</span>
                  {summary}
                </p>
                {!res && (
                  <>
                    {live && pass && (
                      <input className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)', marginTop: 12 }}
                        value={note[it.id] ?? ''} onChange={e => setNote(n => ({ ...n, [it.id]: e.target.value }))} placeholder="메모 (선택) — 왜 이렇게 닫는지 한 줄" />
                    )}
                    <div className="actions">
                      <Link to="/p/cards"><button className="btn btn-small" disabled={busy} onClick={() => resolve(it, 'factcheck')}>두 분께 먼저 묻기</button></Link>
                      <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => resolve(it, 'consult')}>상담 때 다루기</button>
                      <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }} disabled={busy}
                        title="AI 오판 표시 — golden set 후보로 기록됩니다"
                        onClick={() => resolve(it, 'false_positive')}>이건 같은 뜻이에요</button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {!open.length && items !== null && <p className="note">처리할 건이 없습니다.</p>}
        </div>

        {live && pass && (
          <div className="actions" style={{ marginTop: 28 }}>
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={newRound}>0회차 다시 열기 (리허설)</button>
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={load}>새로고침</button>
          </div>
        )}
      </main>
    </div>
  )
}
