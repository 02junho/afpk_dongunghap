import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import seed from '../../data/seed-cards.json'
import type { Card } from '../../judge/index'

const BASELINE_KEYS = ['home_when', 'raise_plan', 'family_help']

/**
 * 1주차: 한 폰에서 남편→아내 순서로 답해 흐름을 본다 (데모용).
 * 2주차: 각자 폰, answers 테이블, 상대 제출 전 잠금 (Realtime).
 */
export default function Round() {
  const { id } = useParams()
  const nav = useNavigate()
  const cards = (seed as Card[]).filter(c => BASELINE_KEYS.includes(c.key))
  const [who, setWho] = useState<'husband' | 'wife'>('husband')
  const [i, setI] = useState(0)
  const [draft, setDraft] = useState('')
  const [answers, setAnswers] = useState<Record<string, { husband?: string; wife?: string }>>({})
  const card = cards[i]

  function submit() {
    const next = { ...answers, [card.key]: { ...answers[card.key], [who]: draft } }
    setAnswers(next); setDraft('')
    if (i + 1 < cards.length) return setI(i + 1)
    if (who === 'husband') { setWho('wife'); setI(0); return }
    sessionStorage.setItem(`round:${id}`, JSON.stringify(next))
    nav(`/c/result/${id}`)
  }

  return (
    <main className="couple">
      <p className="muted">{who === 'husband' ? '남편' : '아내'} · {i + 1} / {cards.length}</p>
      <h1>{card.question}</h1>
      <p className="muted">{card.label}</p>
      {card.type === 'choice'
        ? <select value={draft} onChange={e => setDraft(e.target.value)}><option value="">선택</option>{card.options!.map(o => <option key={o}>{o}</option>)}</select>
        : <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder="편하게 적어주세요" />}
      <button disabled={!draft.trim()} onClick={submit}>제출</button>
      <p className="muted">제출하면 수정할 수 없고, 상대방 답은 둘 다 제출한 뒤 보입니다.</p>
    </main>
  )
}
