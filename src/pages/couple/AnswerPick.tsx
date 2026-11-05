import { useMemo } from 'react'
import type { Card } from '../../judge/index'
import { answerChoices, otherValue } from '../../lib/answer-options'

export const OTHER = '__other'

/**
 * "아니요, 바뀌었어요" 다음 — 다른 답 후보에서 고른다 (11.05 객관식).
 * 후보는 이 부부의 계획 값에서 규칙으로 만든다 (src/lib/answer-options.ts). 맞는 게 없으면 "기타 — 직접 적기".
 */
export interface PickState { pick: string; other: string }
export const EMPTY_PICK: PickState = { pick: '', other: '' }

/** 고른 것 → 저장할 답 */
export const pickValue = (s: PickState) => (s.pick === OTHER ? otherValue(s.other) : s.pick)

export default function AnswerPick({ card, state: s, onChange }: { card: Card; state: PickState; onChange: (s: PickState) => void }) {
  const choices = useMemo(() => answerChoices(card), [card])
  return (
    <div style={{ marginTop: 22 }}>
      <p className="meta" style={{ margin: '0 0 10px' }}>어떻게 바뀌었나요? <span style={{ opacity: 0.7 }}>— {card.question}</span></p>
      <div className="pick-list" role="radiogroup" aria-label={card.label}>
        {choices.map(c => (
          <button key={c.value} role="radio" aria-checked={s.pick === c.value} className={`pick ${s.pick === c.value ? 'pick-on' : ''}`}
            onClick={() => onChange({ ...s, pick: c.value })}>{c.label}</button>
        ))}
        <button role="radio" aria-checked={s.pick === OTHER} className={`pick pick-other ${s.pick === OTHER ? 'pick-on' : ''}`}
          onClick={() => onChange({ ...s, pick: OTHER })}>기타 — 직접 적기</button>
      </div>
      {s.pick === OTHER && (
        <textarea className="field" rows={2} style={{ marginTop: 10 }} value={s.other} autoFocus
          onChange={e => onChange({ ...s, other: e.target.value })} placeholder="보기에 없으면 직접 적어 주세요" aria-label="기타 직접 적기" />
      )}
    </div>
  )
}
