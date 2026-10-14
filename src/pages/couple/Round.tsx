import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import seed from '../../data/seed-cards.json'
import { parseWon, parseCount, type Card } from '../../judge/index'

const BASELINE_KEYS = ['home_when', 'raise_plan', 'family_help']
const UNITS = [
  { label: '억', add: '억' },
  { label: '천만', add: '천만' },
  { label: '백만', add: '백만' },
  { label: '만', add: '만' },
]
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
export const answerKey = (id: string) => `round:v2:${id}`

export interface DraftAnswer { text: string; isCondition: boolean }

/**
 * 1주차: 한 폰에서 남편→아내 순서로 답해 흐름을 본다 (데모용).
 * 2주차: 각자 폰, answers 테이블, 상대 제출 전 잠금.
 *
 * 입력 UI가 파서의 구멍을 메운다:
 *   · 금액 — 숫자 + 단위 버튼. 입력한 값이 원 단위로 얼마인지 그 자리에서 보여준다
 *     ("6천"이 6천원인지 6천만원인지 모르는 상태로 제출되지 않게)
 *   · 시점 — 연·월 선택. 단, "정확한 시점 대신 조건으로" 답하는 길을 남긴다
 *     (docs/02 의 "애 낳고 나서"가 사는 자리. 조건부 답변은 🟡 + 설계사 확인으로 간다)
 */
export default function Round() {
  const { id = 'baseline' } = useParams()
  const nav = useNavigate()
  const cards = (seed as Card[]).filter(c => BASELINE_KEYS.includes(c.key))
  const [who, setWho] = useState<'husband' | 'wife'>('husband')
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [condition, setCondition] = useState(false)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('06')
  const [answers, setAnswers] = useState<Record<string, Partial<Record<'husband' | 'wife', DraftAnswer>>>>({})
  const card = cards[i]

  const years = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, k) => String(y + k))
  }, [])

  const value = card.type === 'date' && !condition ? (year ? `${year}-${month}` : '') : text
  const preview = card.type === 'number'
    ? (() => {
        const n = (card.unit ?? 'won') === 'won' ? parseWon(text) : parseCount(text)
        if (!text.trim()) return ''
        if (isNaN(n)) return '단위를 골라주세요 (예: 6억, 8천만)'
        return (card.unit ?? 'won') === 'won' ? `${n.toLocaleString()}원` : `${n}`
      })()
    : ''
  const ready = value.trim().length > 0 && !(card.type === 'number' && preview.startsWith('단위'))

  function reset() {
    setText(''); setCondition(false); setYear(''); setMonth('06')
  }

  function submit() {
    const next = {
      ...answers,
      [card.key]: { ...answers[card.key], [who]: { text: value, isCondition: condition } },
    }
    setAnswers(next)
    reset()
    if (i + 1 < cards.length) return setI(i + 1)
    if (who === 'husband') { setWho('wife'); setI(0); return }
    sessionStorage.setItem(answerKey(id), JSON.stringify(next))
    nav(`/c/result/${id}`)
  }

  return (
    <main className="couple">
      <p className="muted">{who === 'husband' ? '남편' : '아내'} · {i + 1} / {cards.length}</p>
      <h1>{card.question}</h1>
      <p className="muted">{card.label}</p>

      {card.type === 'choice' && (
        <select value={text} onChange={e => setText(e.target.value)}>
          <option value="">선택</option>
          {card.options!.map(o => <option key={o}>{o}</option>)}
        </select>
      )}

      {card.type === 'number' && (
        <>
          <input inputMode="decimal" value={text} onChange={e => setText(e.target.value)} placeholder="숫자를 쓰고 단위를 누르세요" />
          {(card.unit ?? 'won') === 'won' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {UNITS.map(u => (
                <button key={u.label} className="ghost" style={{ marginTop: 0 }} onClick={() => setText(t => t + u.add)}>{u.label}</button>
              ))}
            </div>
          )}
          <p className="muted" style={{ marginTop: 8 }}>{preview || ' '}</p>
        </>
      )}

      {card.type === 'date' && !condition && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={year} onChange={e => setYear(e.target.value)}>
              <option value="">연도</option>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => setMonth(e.target.value)}>
              {MONTHS.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
            </select>
          </div>
          {card.allowCondition && (
            <button className="ghost" onClick={() => { setCondition(true); setYear('') }}>
              정확한 시점 대신 조건으로 답하기
            </button>
          )}
        </>
      )}

      {((card.type === 'date' && condition) || card.type === 'text') && (
        <>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)}
            placeholder={condition ? '예: 애 낳고 나서, 전세 만기 때' : '편하게 적어주세요'} />
          {condition && (
            <>
              <p className="muted">조건으로 답하면 설계사가 직접 확인합니다. 자동으로 🟢이 되지 않습니다.</p>
              <button className="ghost" onClick={() => setCondition(false)}>연·월로 고르기</button>
            </>
          )}
        </>
      )}

      <button disabled={!ready} onClick={submit}>제출</button>
      <p className="muted">제출하면 수정할 수 없고, 상대방 답은 둘 다 제출한 뒤 보입니다.</p>
    </main>
  )
}
