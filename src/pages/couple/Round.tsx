import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BASELINE, byKey } from '../../data/demo'

/**
 * 1주차: 한 기기에서 남편 → 아내 순으로 답해 흐름을 본다.
 * 2주차: 각자 기기, answers 테이블, Realtime으로 상대 제출 감지.
 */
export default function Round() {
  const { id } = useParams()
  const nav = useNavigate()
  const cards = BASELINE.map(byKey)
  const [who, setWho] = useState<'husband' | 'wife'>('husband')
  const [i, setI] = useState(0)
  const [draft, setDraft] = useState('')
  const [answers, setAnswers] = useState<Record<string, Partial<Record<'husband' | 'wife', string>>>>({})
  const card = cards[i]

  function submit() {
    const next = { ...answers, [card.key]: { ...answers[card.key], [who]: draft } }
    setAnswers(next)
    setDraft('')
    if (i + 1 < cards.length) return setI(i + 1)
    sessionStorage.setItem(`round:${id}`, JSON.stringify(next))
    if (who === 'husband') return nav(`/c/wait/${id}`)
    nav(`/c/result/${id}`)
  }

  return (
    <main className="phone">
      <div className="phone-top">
        <p className="meta">{i + 1} / {cards.length}</p>
        <p className="meta">{who === 'husband' ? '현우' : '지우'}</p>
      </div>
      <div className="phone-body">
        <h2 className="q">{card.question}</h2>
        <p className="card-label">{card.label}</p>
        <div style={{ marginTop: 30 }}>
          {card.type === 'choice' ? (
            <select className="field" value={draft} onChange={e => setDraft(e.target.value)} aria-label={card.label}>
              <option value="">고르기</option>
              {card.options!.map(o => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <textarea
              className="field"
              rows={4}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="편하게 적어주세요"
              aria-label={card.label}
            />
          )}
        </div>
        <p className="note">제출하면 고칠 수 없어요. 상대방 답은 두 분 다 끝난 뒤에 열립니다.</p>
      </div>
      <button className="btn btn-wide" disabled={!draft.trim()} onClick={submit}>제출</button>
    </main>
  )
}
