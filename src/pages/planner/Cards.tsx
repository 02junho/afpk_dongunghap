import { useState } from 'react'
import Rail from './Rail'
import { CARDS, typeLabel, showValue } from '../../data/demo'
import type { Card } from '../../judge/index'

export default function Cards() {
  const [sel, setSel] = useState<Card>(CARDS.find(c => c.key === 'raise_plan')!)
  const [value, setValue] = useState('남편 2027년 상반기 이직 예정. 연봉 약 20% 상승 가정')
  const [reason, setReason] = useState('0회차에서 두 분 모두 이직을 전제로 답함. 소득 재산정 필요.')
  const changed = value !== String(sel.plannedValue)

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">가정 카드</h1>
        <p className="meta">값을 고치면 새 버전이 생기고, 두 분이 동의해야 반영됩니다. 이전 버전은 지워지지 않습니다.</p>
        <div className="cards-layout" style={{ marginTop: 24 }}>
          <div>
            {CARDS.map(c => (
              <button
                key={c.key}
                className={`card-row ${sel.key === c.key ? 'card-row-on' : ''}`}
                onClick={() => { setSel(c); setValue(String(c.plannedValue)); setReason('') }}
              >
                <span className="card-name"><span className="type-mark">{typeLabel(c)}</span>{c.label}</span>
                <div className="card-val">v1 · {showValue(c)}</div>
              </button>
            ))}
          </div>

          <div className="editor">
            <p className="editor-title">{sel.label}</p>
            <p className="meta">{sel.stake}</p>

            <label className="label" htmlFor="v">전제 값</label>
            <textarea id="v" className="field" rows={3} value={value} onChange={e => setValue(e.target.value)} />
            <p className="was">v1 · {showValue(sel)}</p>

            <label className="label" htmlFor="r">바꾸는 이유</label>
            <textarea id="r" className="field" rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="두 분에게 그대로 보입니다" />

            <p className="will">
              저장하면 v2가 만들어지고, 현우·지우 두 분께 바뀐 내용과 이유가 전달됩니다.
              이 카드만 다시 여쭤보고, 두 분 다 동의하셔야 설계 전제로 반영됩니다.
            </p>

            <div className="actions">
              <button className="btn btn-small" disabled={!reason.trim() || !changed}>v2로 저장</button>
              <button className="btn btn-quiet btn-small">되돌리기</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
