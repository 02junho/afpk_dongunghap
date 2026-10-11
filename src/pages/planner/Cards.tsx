import { useState } from 'react'
import seed from '../../data/seed-cards.json'
import type { Card } from '../../judge/index'

/**
 * 카드 목록 + 1장 수정. 수정 = 새 버전 (card_versions insert). 사유 필수.
 * 저장하면 부부에게 재합의 라운드(kind='reconfirm')가 생긴다 — docs/03 §갱신 흐름 6번.
 */
export default function Cards() {
  const cards = seed as Card[]
  const [sel, setSel] = useState<Card | null>(null)
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  return (
    <main className="planner">
      <h1>카드 · 김현우·박지우</h1>
      <p className="muted">값을 고치면 새 버전이 생기고, 부부가 동의해야 활성화됩니다. 이전 버전은 지워지지 않습니다.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          {cards.map(c => (
            <div className="card" key={c.key} style={{ cursor: 'pointer', borderColor: sel?.key === c.key ? '#1f2937' : undefined }} onClick={() => { setSel(c); setValue(String(c.plannedValue)); setReason('') }}>
              <span className="muted">{c.type}</span> <b>{c.label}</b>
              <div className="muted">v1 · {String(c.plannedValue)}</div>
            </div>
          ))}
        </div>
        <div>
          {sel ? (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{sel.label} → v2</h2>
              <p className="muted">{sel.stake}</p>
              <label className="muted">전제 값</label>
              <input value={value} onChange={e => setValue(e.target.value)} />
              <label className="muted">변경 사유 (필수 · 부부에게 그대로 보입니다)</label>
              <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 남편 이직 확정으로 소득 재산정" />
              <button disabled={!reason.trim() || value === String(sel.plannedValue)} onClick={() => alert('card_versions v2 insert → reconfirm 라운드 생성 → 푸시 (2~3주차)')}>새 버전 저장</button>
            </div>
          ) : <p className="muted">왼쪽에서 카드를 고르세요</p>}
        </div>
      </div>
    </main>
  )
}
