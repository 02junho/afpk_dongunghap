import { useState } from 'react'
import { Link } from 'react-router-dom'
import seed from '../../data/seed-cards.json'
import { parseWon, parseCount, type Card } from '../../judge/index'
import { selectedCouple } from './demo'

/**
 * 카드 목록 + 1장 수정. 수정 = 새 버전 (card_versions insert). 사유 필수.
 * 저장하면 부부에게 재합의 라운드(kind='reconfirm')가 생긴다 — docs/03 §갱신 흐름 6번.
 *
 * 사용친화의 핵심은 '파일을 안 만진다'는 것: 카드 1장씩 폼으로, 사유 한 줄 필수, 저장하면 끝.
 * CMS처럼 키우지 않는다.
 */

/** 허용 범위는 카드 타입에 따라 의미가 다르다. 같은 칸에 0.05와 6을 받으면 반드시 사고가 난다. */
function toleranceField(card: Card) {
  if (card.type === 'number')
    return { label: '허용 범위 (±%)', suffix: '%', toInput: (t?: number) => String(((t ?? 0.1) * 100).toFixed(1)), fromInput: (s: string) => Number(s) / 100 }
  if (card.type === 'date')
    return { label: '허용 범위 (±개월)', suffix: '개월', toInput: (t?: number) => String(t ?? 6), fromInput: (s: string) => Number(s) }
  return null
}

function describeValue(card: Card, raw: string) {
  if (card.type === 'number') {
    const n = (card.unit ?? 'won') === 'won' ? parseWon(raw) : parseCount(raw)
    if (isNaN(n)) return '해석할 수 없는 값입니다'
    return (card.unit ?? 'won') === 'won' ? `${n.toLocaleString()}원` : `${n}${card.unit === 'age' ? '세' : ''}`
  }
  return ''
}

export default function Cards() {
  const couple = selectedCouple()
  const cards = seed as Card[]
  const [sel, setSel] = useState<Card | null>(null)
  const [value, setValue] = useState('')
  const [tol, setTol] = useState('')
  const [allowCondition, setAllowCondition] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<Record<string, { value: string; reason: string }>>({})

  function pick(c: Card) {
    setSel(c)
    setValue(String(c.plannedValue))
    const f = toleranceField(c)
    setTol(f ? f.toInput(c.tolerance) : '')
    setAllowCondition(!!c.allowCondition)
    setReason('')
  }

  function save() {
    if (!sel) return
    setPending(p => ({ ...p, [sel.key]: { value, reason } }))
    setSel(null)
  }

  const f = sel ? toleranceField(sel) : null
  const changed = !!sel && (
    value !== String(sel.plannedValue) ||
    (f ? f.fromInput(tol) !== (sel.tolerance ?? (sel.type === 'date' ? 6 : 0.1)) : false) ||
    allowCondition !== !!sel.allowCondition
  )

  return (
    <main className="planner">
      <h1>카드 · {couple.label}</h1>
      <p className="muted">
        값을 고치면 새 버전이 생기고, <b>부부가 동의해야 활성화됩니다</b>. 이전 버전은 지워지지 않습니다.
        · <Link to="/p/couples">커플 바꾸기</Link>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          {cards.map(c => {
            const p = pending[c.key]
            return (
              <div className="card" key={c.key}
                style={{ cursor: 'pointer', borderColor: sel?.key === c.key ? '#1f2937' : undefined }}
                onClick={() => pick(c)}>
                <span className="muted">{c.type}{c.unit ? `·${c.unit}` : ''}</span> <b>{c.label}</b>
                <div className="muted">
                  v1 · {String(c.plannedValue)}
                  {p && <><br /><span className="pill yellow">v2 동의 대기</span> {p.value}</>}
                </div>
              </div>
            )
          })}
        </div>
        <div>
          {sel ? (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{sel.label} → v{pending[sel.key] ? 3 : 2}</h2>
              <p className="muted">{sel.stake}</p>

              <label className="muted">전제 값</label>
              <input value={value} onChange={e => setValue(e.target.value)} />
              {sel.type === 'number' && <p className="muted">{describeValue(sel, value)}</p>}
              {sel.type === 'date' && <p className="muted">형식 YYYY-MM</p>}
              {sel.type === 'choice' && <p className="muted">선택지: {sel.options?.join(' / ')}</p>}

              {f && (
                <>
                  <label className="muted">{f.label}</label>
                  <input inputMode="decimal" value={tol} onChange={e => setTol(e.target.value)} />
                  <p className="muted">
                    이 범위 안이면 🟢, 두 배 안이면 🟡, 넘으면 🔴입니다
                    {sel.type === 'number' && !isNaN(parseWon(value))
                      ? ` (현재 ±${Math.round(parseWon(value) * f.fromInput(tol)).toLocaleString()}원)`
                      : ''}
                  </p>
                </>
              )}

              {sel.type === 'date' && (
                <label className="muted" style={{ display: 'block', margin: '12px 0' }}>
                  <input type="checkbox" style={{ width: 'auto', marginRight: 8 }}
                    checked={allowCondition} onChange={e => setAllowCondition(e.target.checked)} />
                  "정확한 시점 대신 조건으로" 답하는 것을 허용 (조건부 답변은 🟡 + 설계사 확인)
                </label>
              )}

              <label className="muted">변경 사유 (필수 · 부부에게 그대로 보입니다)</label>
              <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="예: 남편 이직 확정으로 소득 재산정" />
              <button disabled={!reason.trim() || !changed} onClick={save}>새 버전 저장</button>
              <p className="muted">
                저장하면: card_versions 새 행 → 부부 양쪽에 알림 → 이 카드만 재합의 라운드 →
                둘 다 동의하면 activated_at 기록 (2~3주차에 DB 연결)
              </p>
            </div>
          ) : <p className="muted">왼쪽에서 카드를 고르세요</p>}
        </div>
      </div>
    </main>
  )
}
