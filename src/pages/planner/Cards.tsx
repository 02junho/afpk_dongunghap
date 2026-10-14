import { useState } from 'react'
import Rail from './Rail'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { parseWon, parseCount, type Card } from '../../judge/index'

/**
 * 카테고리별로 묶어 보여준다. 세부 카드는 설계안에서 추출(초안) → 설계사가 확정·추가.
 * 수정 = 새 버전 (card_versions insert). 사유 필수.
 * 저장하면 이 카드 하나로 factcheck 라운드가 생긴다 — docs/03 §갱신 흐름 (10.14).
 *
 * 허용 범위는 카드 타입에 따라 의미가 다르다 (number ±%, date ±개월).
 * 같은 칸에 0.05와 6을 받으면 반드시 사고가 난다 → 타입별로 라벨·단위를 다르게 보여준다.
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

const INITIAL = CARDS.find(c => c.key === 'raise_plan')!

export default function Cards() {
  const [sel, setSel] = useState<Card>(INITIAL)
  const [value, setValue] = useState('남편 2027년 상반기 이직 예정. 연봉 약 20% 상승 가정')
  const [tol, setTol] = useState('')
  const [allowCondition, setAllowCondition] = useState(false)
  const [reason, setReason] = useState('0회차에서 두 분 모두 이직을 전제로 답함. 소득 재산정 필요.')
  const [pending, setPending] = useState<Record<string, string>>({})

  function pick(c: Card) {
    setSel(c)
    setValue(String(c.plannedValue))
    const f = toleranceField(c)
    setTol(f ? f.toInput(c.tolerance) : '')
    setAllowCondition(!!c.allowCondition)
    setReason('')
  }

  const f = toleranceField(sel)
  const changed =
    value !== String(sel.plannedValue) ||
    (f ? f.fromInput(tol) !== (sel.tolerance ?? (sel.type === 'date' ? 6 : 0.1)) : false) ||
    allowCondition !== !!sel.allowCondition
  const cat = CATEGORIES[sel.category]
  const nextVersion = pending[sel.key] ? 3 : 2

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">가정 카드</h1>
        <p className="meta">값을 고치면 새 버전이 생기고, 두 분이 동의해야 반영됩니다. 이전 버전은 지워지지 않습니다.</p>
        <div className="cards-layout" style={{ marginTop: 20 }}>
          <div>
            {CATEGORY_ORDER.filter(k => CARDS.some(c => c.category === k)).map(k => (
              <div key={k}>
                <p className="cat-head">{CATEGORIES[k].label}</p>
                {CARDS.filter(c => c.category === k).map(c => (
                  <button key={c.key} className={`card-row ${sel.key === c.key ? 'card-row-on' : ''}`} onClick={() => pick(c)}>
                    <span className="cat" style={{ background: CATEGORIES[c.category].bg, color: CATEGORIES[c.category].fg, width: 36, height: 36, borderRadius: 11 }}>{CATEGORIES[c.category].short}</span>
                    <div>
                      <div className="card-name">{c.label}</div>
                      <div className="card-val">v1 · {showValue(c)}</div>
                      {pending[c.key] && <div className="card-val"><span className="chip chip-talk" style={{ fontSize: 11, padding: '2px 8px' }}>v2 동의 대기</span> {pending[c.key]}</div>}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn btn-quiet btn-small">카드 추가</button>
              <button className="btn btn-quiet btn-small">설계안에서 뽑기(초안)</button>
            </div>
          </div>

          <div className="editor">
            <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
            <p className="editor-title" style={{ marginTop: 10 }}>{sel.label}</p>
            <p className="meta">{sel.stake}</p>

            <label className="label" htmlFor="v">전제 값</label>
            <textarea id="v" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={3} value={value} onChange={e => setValue(e.target.value)} />
            <p className="was">v1 · {showValue(sel)}{sel.type === 'number' && value !== String(sel.plannedValue) ? ` → ${describeValue(sel, value)}` : ''}{sel.type === 'date' ? ' · 형식 YYYY-MM' : ''}</p>

            {f && (
              <>
                <label className="label" htmlFor="t">{f.label}</label>
                <input id="t" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)', maxWidth: 160 }} inputMode="decimal" value={tol} onChange={e => setTol(e.target.value)} />
                <p className="was">
                  이 범위 안이면 🟢, 두 배 안이면 🟡, 넘으면 🔴
                  {sel.type === 'number' && !isNaN(parseWon(value)) && (sel.unit ?? 'krw') === 'krw'
                    ? ` · 지금 값 기준 ±${Math.round(parseWon(value) * f.fromInput(tol)).toLocaleString()}원`
                    : ''}
                </p>
              </>
            )}

            {sel.type === 'date' && (
              <label className="label" style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={allowCondition} onChange={e => setAllowCondition(e.target.checked)} />
                "정확한 시점 대신 조건으로" 답하는 것을 허용 — 조건부 답변은 자동 판정 없이 처리 대기로 옵니다
              </label>
            )}

            <label className="label" htmlFor="r">바꾸는 이유</label>
            <textarea id="r" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="두 분에게 그대로 보입니다" />
            <p className="will">저장하면 이 카드만 두 분께 다시 묻습니다 — "이 전제가 맞나요? 이걸로 설계를 조정해도 될까요?" 둘 다 동의하면 v{nextVersion}가 활성화되고, 연동 수치는 공식대로 다시 계산됩니다.</p>
            <div className="actions">
              <button className="btn btn-small" disabled={!reason.trim() || !changed}
                onClick={() => { setPending(p => ({ ...p, [sel.key]: value })); setReason('') }}>
                두 분께 먼저 묻고 v{nextVersion} 저장
              </button>
              <button className="btn btn-quiet btn-small" onClick={() => pick(sel)}>되돌리기</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
