import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BASELINE, byKey, CATEGORIES, answerKey, judgmentKey, type RoundAnswers } from '../../data/demo'
import { parseWon, parseCount, type Card, type Judgment } from '../../judge/index'
import { requestJudgment } from '../../lib/api'

const UNITS = ['억', '천만', '백만', '만']
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

/**
 * 입력 UI가 파서의 구멍을 메운다:
 *   · 금액 — 숫자 + 단위 버튼. 입력한 값이 원 단위로 얼마인지 그 자리에서 보여준다
 *     ("6천"이 6천원인지 6천만원인지 모르는 상태로 제출되지 않게)
 *   · 시점 — 연·월 선택. 단, "정확한 시점 대신 조건으로" 답하는 길을 남긴다
 *     (docs/02 의 "애 낳고 나서"가 사는 자리. 조건부 답변은 🟡 + 설계사 확인으로 간다)
 *
 * 부부는 판정을 보지 않는다 (10.14). 제출 → 대기/전달 화면으로 끝.
 */
export default function Round() {
  const { id = 'baseline' } = useParams()
  const nav = useNavigate()
  const me = JSON.parse(sessionStorage.getItem('me') ?? '{"role":"husband"}') as { role: 'husband' | 'wife' }
  const him = me.role !== 'wife'
  const cards = BASELINE.map(byKey)
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [condition, setCondition] = useState(false)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('06')
  const card = cards[i]
  const cat = CATEGORIES[card.category]

  const years = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, k) => String(y + k))
  }, [])

  const value = card.type === 'date' && !condition ? (year ? `${year}-${month}` : '') : text
  const preview = card.type === 'number'
    ? (() => {
        if (!text.trim()) return ''
        const n = (card.unit ?? 'krw') === 'krw' ? parseWon(text) : parseCount(text)
        if (isNaN(n)) return '단위를 골라주세요 (예: 6억, 8천만)'
        return (card.unit ?? 'krw') === 'krw' ? `${n.toLocaleString()}원` : `${n}`
      })()
    : ''
  const ready = value.trim().length > 0 && !preview.startsWith('단위')

  function reset() {
    setText(''); setCondition(false); setYear(''); setMonth('06')
  }

  function submit() {
    const prev = JSON.parse(sessionStorage.getItem(answerKey(id)) ?? '{}') as RoundAnswers
    prev[card.key] = { ...prev[card.key], [me.role]: { text: value, isCondition: condition } }
    sessionStorage.setItem(answerKey(id), JSON.stringify(prev))
    reset()
    if (i + 1 < cards.length) return setI(i + 1)

    // 1주차 한 기기 데모: 두 사람 답이 다 모이면 여기서 판정해 설계사 콘솔이 읽는 자리에 둔다.
    // 부부 화면은 그 결과를 읽지 않는다. 2주차엔 서버가 한다 (docs/04 §A).
    const complete = cards.every(c => prev[c.key]?.husband && prev[c.key]?.wife)
    if (complete) void judgeAll(id, cards, prev)
    nav(complete ? `/c/done/${id}` : `/c/wait/${id}`)
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
          {card.type === 'choice' && (
            <select className="field" value={text} onChange={e => setText(e.target.value)} aria-label={card.label}>
              <option value="">고르기</option>
              {card.options!.map(o => <option key={o}>{o}</option>)}
            </select>
          )}

          {card.type === 'number' && (
            <>
              <input className="field" inputMode="decimal" value={text} onChange={e => setText(e.target.value)}
                placeholder="숫자를 쓰고 단위를 누르세요" aria-label={card.label} />
              {(card.unit ?? 'krw') === 'krw' && (
                <div className="actions" style={{ marginTop: 10 }}>
                  {UNITS.map(u => (
                    <button key={u} className="btn btn-quiet btn-small" onClick={() => setText(t => t + u)}>{u}</button>
                  ))}
                </div>
              )}
              <p className="note">{preview || ' '}</p>
            </>
          )}

          {card.type === 'date' && !condition && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <select className="field" value={year} onChange={e => setYear(e.target.value)} aria-label="연도">
                  <option value="">연도</option>
                  {years.map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select className="field" value={month} onChange={e => setMonth(e.target.value)} aria-label="월">
                  {MONTHS.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
                </select>
              </div>
              {card.allowCondition && (
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="btn btn-quiet btn-small" onClick={() => { setCondition(true); setYear('') }}>
                    정확한 시점 대신 조건으로 답하기
                  </button>
                </div>
              )}
            </>
          )}

          {((card.type === 'date' && condition) || card.type === 'text') && (
            <>
              <textarea className="field" rows={4} value={text} onChange={e => setText(e.target.value)}
                placeholder={condition ? '예: 애 낳고 나서, 전세 만기 때' : '편하게 적어주세요'} aria-label={card.label} />
              {condition && (
                <>
                  <p className="note">조건으로 답하면 설계사님이 직접 확인해요.</p>
                  <div className="actions">
                    <button className="btn btn-quiet btn-small" onClick={() => setCondition(false)}>연·월로 고르기</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <p className="note">제출하면 고칠 수 없어요. {him ? '지우' : '현우'}님에게는 보이지 않아요.</p>
      </div>
      <button className="btn btn-wide" disabled={!ready} onClick={submit}>제출</button>
    </main>
  )
}

async function judgeAll(id: string, cards: Card[], answers: RoundAnswers) {
  const out: Record<string, Judgment> = {}
  for (const c of cards) {
    const a = answers[c.key]!
    out[c.key] = await requestJudgment(c, a.husband!.text, a.wife!.text)
  }
  sessionStorage.setItem(judgmentKey(id), JSON.stringify(out))
}
