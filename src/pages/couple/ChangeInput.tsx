import { useMemo } from 'react'
import { OTHER_PREFIX, parseWon, parseCount, type Card } from '../../judge/index'

const UNITS = ['억', '천만', '백만', '만']
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const OTHER = '__other'

/**
 * "어떻게 바뀌었나요?" 입력 — 맞춰보기(Round)와 "바뀐 게 있어요"(Change, 11.04)가 같이 쓴다.
 * 입력 UI가 파서의 구멍을 메운다:
 *   · 금액 — 숫자 + 단위 버튼. 입력한 값이 원 단위로 얼마인지 그 자리에서 보여준다
 *   · 시점 — 연·월 선택. 단, "정확한 시점 대신 조건으로" 답하는 길을 남긴다 (조건부는 🟡 + 설계사 확인)
 *   · 선택 — 보기 끝에 "기타 — 직접 입력"(Q1). 기타 답은 추측하지 않고 설계사 확인으로 간다
 */
export interface ChangeState { text: string; condition: boolean; year: string; month: string; other: string }

// 월은 처음엔 비워 둔다 — 6월이 미리 골라져 있으면 연도만 고르고 넘어가 원치 않은 6월이 저장됐다 (10.27)
export const EMPTY_CHANGE: ChangeState = { text: '', condition: false, year: '', month: '', other: '' }

/** 입력 상태 → 저장할 값. preview 가 "단위…"로 시작하면 아직 저장할 수 없다 */
export function changeValue(card: Card, s: ChangeState): { value: string; isCondition: boolean; preview: string } {
  const value = card.type === 'date' && !s.condition ? (s.year && s.month ? `${s.year}-${s.month}` : '')
    : card.type === 'choice' && s.text === OTHER ? (s.other.trim() ? OTHER_PREFIX + s.other.trim() : '')
    : s.text
  const preview = card.type === 'number' && s.text.trim()
    ? (() => {
        const n = (card.unit ?? 'krw') === 'krw' ? parseWon(s.text) : parseCount(s.text)
        if (isNaN(n)) return '단위를 골라주세요 (예: 6억, 8천만)'
        return (card.unit ?? 'krw') === 'krw' ? `${n.toLocaleString()}원` : `${n}`
      })()
    : ''
  return { value, isCondition: s.condition, preview }
}

export default function ChangeInput({ card, state: s, onChange }: { card: Card; state: ChangeState; onChange: (s: ChangeState) => void }) {
  const set = (patch: Partial<ChangeState>) => onChange({ ...s, ...patch })
  const { preview } = changeValue(card, s)
  const years = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, k) => String(y + k))
  }, [])

  return (
    <div style={{ marginTop: 22 }}>
      <p className="meta" style={{ margin: '0 0 10px' }}>어떻게 바뀌었나요? <span style={{ opacity: 0.7 }}>— {card.question}</span></p>
      {card.type === 'choice' && (
        <>
          <select className="field" value={s.text} onChange={e => set({ text: e.target.value })} aria-label={card.label}>
            <option value="">고르기</option>
            {card.options!.map(o => <option key={o}>{o}</option>)}
            <option value={OTHER}>기타 — 직접 입력</option>
          </select>
          {s.text === OTHER && (
            <textarea className="field" rows={2} style={{ marginTop: 10 }} value={s.other} onChange={e => set({ other: e.target.value })}
              placeholder="보기에 없으면 직접 적어 주세요" aria-label="기타 직접 입력" />
          )}
        </>
      )}
      {card.type === 'number' && (
        <>
          <input className="field" inputMode="decimal" value={s.text} onChange={e => set({ text: e.target.value })}
            placeholder="숫자를 쓰고 단위를 누르세요" aria-label={card.label} />
          {(card.unit ?? 'krw') === 'krw' && (
            <div className="actions" style={{ marginTop: 10 }}>
              {UNITS.map(u => (
                <button key={u} className="btn btn-quiet btn-small" onClick={() => set({ text: s.text + u })}>{u}</button>
              ))}
            </div>
          )}
          <p className="note">{preview || ' '}</p>
        </>
      )}

      {card.type === 'date' && !s.condition && (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="field" value={s.year} onChange={e => set({ year: e.target.value })} aria-label="연도">
              <option value="">연도</option>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="field" value={s.month} onChange={e => set({ month: e.target.value })} aria-label="월">
              <option value="">월</option>
              {MONTHS.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
            </select>
          </div>
          {card.allowCondition && (
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn btn-quiet btn-small" onClick={() => set({ condition: true, year: '' })}>
                정확한 시점 대신 조건으로 답하기
              </button>
            </div>
          )}
        </>
      )}

      {((card.type === 'date' && s.condition) || card.type === 'text') && (
        <>
          <textarea className="field" rows={4} value={s.text} onChange={e => set({ text: e.target.value })}
            placeholder={s.condition ? '예: 애 낳고 나서, 전세 만기 때' : '편하게 적어주세요'} aria-label={card.label} />
          {s.condition && (
            <>
              <p className="note">조건으로 답하면 설계사님이 직접 확인해요.</p>
              <div className="actions">
                <button className="btn btn-quiet btn-small" onClick={() => set({ condition: false })}>연·월로 고르기</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
