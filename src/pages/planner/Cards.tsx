import { useState } from 'react'
import Rail from './Rail'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import type { Card } from '../../judge/index'

/** 카테고리별로 묶어 보여준다. 세부 카드는 설계안에서 추출(초안) → 설계사가 확정·추가. */
export default function Cards() {
  const [sel, setSel] = useState<Card>(CARDS.find(c => c.key === 'raise_plan')!)
  const [value, setValue] = useState('남편 2027년 상반기 이직 예정. 연봉 약 20% 상승 가정')
  const [reason, setReason] = useState('0회차에서 두 분 모두 이직을 전제로 답함. 소득 재산정 필요.')
  const changed = value !== String(sel.plannedValue)
  const cat = CATEGORIES[sel.category]

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
                  <button key={c.key} className={`card-row ${sel.key === c.key ? 'card-row-on' : ''}`}
                    onClick={() => { setSel(c); setValue(String(c.plannedValue)); setReason('') }}>
                    <span className="cat" style={{ background: CATEGORIES[c.category].bg, color: CATEGORIES[c.category].fg, width: 36, height: 36, borderRadius: 11 }}>{CATEGORIES[c.category].short}</span>
                    <div><div className="card-name">{c.label}</div><div className="card-val">v1 · {showValue(c)}</div></div>
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
            <p className="was">v1 · {showValue(sel)}</p>
            <label className="label" htmlFor="r">바꾸는 이유</label>
            <textarea id="r" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="두 분에게 그대로 보입니다" />
            <p className="will">저장하면 이 카드만 두 분께 다시 묻습니다 — "이 전제가 맞나요? 이걸로 설계를 조정해도 될까요?" 둘 다 동의하면 v2가 활성화되고, 연동 수치는 공식대로 다시 계산됩니다.</p>
            <div className="actions">
              <button className="btn btn-small" disabled={!reason.trim() || !changed}>두 분께 먼저 묻고 v2 저장</button>
              <button className="btn btn-quiet btn-small">되돌리기</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
