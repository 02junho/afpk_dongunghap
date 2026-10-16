import { useEffect, useState } from 'react'
import Rail from './Rail'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { parseWon, parseCount, type Card } from '../../judge/index'
import { rowToCard } from '../../lib/cards'
import { usePlanner } from './planner'

/**
 * 카테고리별 카드 목록 + 1장 수정. 수정 = 새 버전 (card_versions insert, 동의 대기). 사유 필수.
 * 저장하면 그 카드 하나로 '먼저 묻기'(factcheck) 라운드가 부부 폰에 열리고, 둘 다 새 전제와 맞게 답하면
 * 서버가 activated_at 을 찍어 전제가 된다 — docs/03 §갱신 흐름 (10.14).
 *
 * 허용 범위는 타입에 따라 의미가 다르다 (number ±%, date ±개월). 같은 칸에 0.05와 6을 받으면 사고가 난다.
 */
function toleranceField(card: Card) {
  if (card.type === 'number')
    return { label: '허용 범위 (±%)', toInput: (t?: number) => ((t ?? 0.1) * 100).toFixed(1), fromInput: (s: string) => Number(s) / 100 }
  if (card.type === 'date')
    return { label: '허용 범위 (±개월)', toInput: (t?: number) => String(t ?? 6), fromInput: (s: string) => Number(s) }
  return null
}

function describeValue(card: Card, raw: string) {
  if (card.type !== 'number') return ''
  const n = (card.unit ?? 'krw') === 'krw' ? parseWon(raw) : parseCount(raw)
  if (isNaN(n)) return '해석할 수 없는 값입니다 (예: 6억, 8천만원, 60)'
  return (card.unit ?? 'krw') === 'krw' ? `${n.toLocaleString()}원` : `${n}${card.unit === 'age' ? '세' : ''}`
}

interface Row { cardId: string; versionId: string; version: number; pending: boolean; card: Card }

const DEMO_ROWS: Row[] = CARDS.map(c => ({ cardId: c.key, versionId: c.key, version: 1, pending: false, card: c }))

export default function Cards() {
  const p = usePlanner()
  const [rows, setRows] = useState<Row[]>(DEMO_ROWS)
  const [sel, setSel] = useState<Row | null>(null)
  const [value, setValue] = useState('')
  const [tol, setTol] = useState('')
  const [allowCondition, setAllowCondition] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    if (!p.live || !p.pass) { setRows(DEMO_ROWS); return }
    try {
      const { cards } = await p.call<{ cards: any[] }>('cards')
      setRows(cards.map(r => ({ cardId: r.card_id, versionId: r.id, version: r.version, pending: r.pending, card: rowToCard(r, r) })))
      setErr('')
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { void load() }, [p.live, p.pass, p.couple.id])

  function pick(r: Row) {
    setSel(r)
    const c = r.card
    setValue(String(c.plannedValue))
    const f = toleranceField(c)
    setTol(f ? f.toInput(c.tolerance) : '')
    setAllowCondition(!!c.allowCondition)
    setReason(''); setMsg('')
  }

  async function save() {
    if (!sel) return
    const f = toleranceField(sel.card)
    if (!p.live || !p.pass) {
      setRows(rs => rs.map(r => r.cardId === sel.cardId ? { ...r, pending: true, version: r.version + 1, card: { ...r.card, plannedValue: sel.card.type === 'number' ? Number(value) : value } } : r))
      setMsg('(데모) v' + (sel.version + 1) + ' 동의 대기 — 실제로는 두 분께 먼저 묻기 라운드가 열립니다')
      setSel(null)
      return
    }
    setBusy(true)
    try {
      const r = await p.call<{ version: number; roundId: string }>('save_card', {
        cardId: sel.cardId,
        plannedValue: sel.card.type === 'number' ? String((sel.card.unit ?? 'krw') === 'krw' ? parseWon(value) : parseCount(value)) : value,
        tolerance: f ? f.fromInput(tol) : null,
        allowCondition,
        reason,
      })
      setMsg(`v${r.version} 저장 — 두 분 폰에 "먼저 묻기" 1문항이 열렸습니다. 둘 다 새 전제와 맞게 답하면 활성화됩니다.`)
      setSel(null)
      await load()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const f = sel ? toleranceField(sel.card) : null
  const changed = !!sel && (
    value !== String(sel.card.plannedValue) ||
    (f ? f.fromInput(tol) !== (sel.card.tolerance ?? (sel.card.type === 'date' ? 6 : 0.1)) : false) ||
    allowCondition !== !!sel.card.allowCondition
  )
  const invalidNumber = !!sel && sel.card.type === 'number' && describeValue(sel.card, value).startsWith('해석')

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">가정 카드 · {p.couple.label}</h1>
        <p className="meta">값을 고치면 새 버전이 생기고, 두 분이 동의해야 반영됩니다. 이전 버전은 지워지지 않습니다.</p>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        {msg && <p className="note" style={{ color: 'var(--agree)' }}>{msg}</p>}

        <div className="cards-layout" style={{ marginTop: 20 }}>
          <div>
            {CATEGORY_ORDER.filter(k => rows.some(r => r.card.category === k)).map(k => (
              <div key={k}>
                <p className="cat-head">{CATEGORIES[k].label}</p>
                {rows.filter(r => r.card.category === k).map(r => {
                  const c = r.card, cat = CATEGORIES[c.category]
                  return (
                    <button key={r.cardId} className={`card-row ${sel?.cardId === r.cardId ? 'card-row-on' : ''}`} onClick={() => pick(r)}>
                      <span className="cat" style={{ background: cat.bg, color: cat.fg, width: 36, height: 36, borderRadius: 11 }}>{cat.short}</span>
                      <div>
                        <div className="card-name">{c.label}</div>
                        <div className="card-val">v{r.version} · {showValue(c)}{r.pending && <> <span className="chip chip-talk" style={{ fontSize: 11, padding: '2px 8px' }}>동의 대기</span></>}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn btn-quiet btn-small" disabled title="공모전 후">카드 추가</button>
              <button className="btn btn-quiet btn-small" disabled title="scripts/extract-cards.ts — UI 는 공모전 후">설계안에서 뽑기(초안)</button>
            </div>
          </div>

          <div className="editor">
            {sel ? (() => {
              const c = sel.card, cat = CATEGORIES[c.category]
              return (
                <>
                  <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
                  <p className="editor-title" style={{ marginTop: 10 }}>{c.label}</p>
                  <p className="meta">{c.stake}</p>
                  {sel.pending && <p className="will" style={{ color: 'var(--talk)' }}>v{sel.version}이 동의 대기 중입니다. 두 분이 먼저 묻기에 답한 뒤 다시 고칠 수 있습니다.</p>}

                  <label className="label" htmlFor="v">전제 값</label>
                  <textarea id="v" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={3} value={value} onChange={e => setValue(e.target.value)} />
                  <p className="was">v{sel.version} · {showValue(c)}{c.type === 'number' && value !== String(c.plannedValue) ? ` → ${describeValue(c, value)}` : ''}{c.type === 'date' ? ' · 형식 YYYY-MM' : ''}</p>

                  {f && (
                    <>
                      <label className="label" htmlFor="t">{f.label}</label>
                      <input id="t" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)', maxWidth: 160 }} inputMode="decimal" value={tol} onChange={e => setTol(e.target.value)} />
                      <p className="was">
                        이 범위 안이면 🟢, 두 배 안이면 🟡, 넘으면 🔴
                        {c.type === 'number' && !isNaN(parseWon(value)) && (c.unit ?? 'krw') === 'krw' ? ` · 지금 값 기준 ±${Math.round(parseWon(value) * f.fromInput(tol)).toLocaleString()}원` : ''}
                      </p>
                    </>
                  )}

                  {c.type === 'date' && (
                    <label className="label" style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={allowCondition} onChange={e => setAllowCondition(e.target.checked)} />
                      "정확한 시점 대신 조건으로" 답하는 것을 허용 — 조건부 답변은 자동 판정 없이 처리 대기로 옵니다
                    </label>
                  )}

                  <label className="label" htmlFor="r">바꾸는 이유 (필수 · 두 분에게 그대로 보입니다)</label>
                  <textarea id="r" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 0회차에서 두 분 모두 이직을 전제로 답함. 소득 재산정 필요." />
                  <p className="will">저장하면 이 카드만 두 분께 다시 묻습니다 — "{c.question}" 둘 다 새 전제와 맞게 답하면 v{sel.version + 1}이 활성화되고, 연동 수치는 공식대로 다시 계산됩니다. 어긋나면 처리 대기로 옵니다.</p>
                  <div className="actions">
                    <button className="btn btn-small" disabled={busy || sel.pending || !reason.trim() || !changed || invalidNumber} onClick={save}>
                      {busy ? '저장 중…' : `두 분께 먼저 묻고 v${sel.version + 1} 저장`}
                    </button>
                    <button className="btn btn-quiet btn-small" onClick={() => pick(sel)}>되돌리기</button>
                  </div>
                </>
              )
            })() : <p className="meta">왼쪽에서 카드를 고르세요.</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
