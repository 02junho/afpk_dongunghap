import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BASELINE, byKey, CATEGORIES } from '../../data/demo'

export default function Round() {
  const { id } = useParams()
  const nav = useNavigate()
  const me = JSON.parse(sessionStorage.getItem('me') ?? '{"role":"husband"}')
  const him = me.role !== 'wife'
  const cards = BASELINE.map(byKey)
  const [i, setI] = useState(0)
  const [draft, setDraft] = useState('')
  const card = cards[i]
  const cat = CATEGORIES[card.category]

  function submit() {
    const prev = JSON.parse(sessionStorage.getItem(`round:${id}`) ?? '{}')
    prev[card.key] = { ...prev[card.key], [me.role]: draft }
    sessionStorage.setItem(`round:${id}`, JSON.stringify(prev))
    setDraft('')
    if (i + 1 < cards.length) return setI(i + 1)
    nav(`/c/wait/${id}`)
  }

  return (
    <main className="phone">
      <div className="phone-top">
        <p className="meta">{i + 1} / {cards.length}</p>
        <span className={`avatar ${him ? 'avatar-him' : 'avatar-her'}`}>{him ? '현' : '지'}</span>
      </div>
      <div className="phone-body">
        <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
        <h2 className="q" style={{ marginTop: 14 }}>{card.question}</h2>
        <div style={{ marginTop: 26 }}>
          {card.type === 'choice' ? (
            <select className="field" value={draft} onChange={e => setDraft(e.target.value)} aria-label={card.label}>
              <option value="">고르기</option>{card.options!.map(o => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <textarea className="field" rows={4} value={draft} onChange={e => setDraft(e.target.value)} placeholder="편하게 적어주세요" aria-label={card.label} />
          )}
        </div>
        <p className="note">제출하면 고칠 수 없어요. {him ? '지우' : '현우'}님에게는 보이지 않아요.</p>
      </div>
      <button className="btn btn-wide" disabled={!draft.trim()} onClick={submit}>제출</button>
    </main>
  )
}
