import type { Card } from '../../judge/index'
import { NON_VALUE, slotByKey } from '../../data/template'
import { wonText } from '../../lib/answer-options'
import { numValue, type AnswerState } from '../../lib/answer-input'

export { EMPTY_ANSWER, answerValue, type AnswerState } from '../../lib/answer-input'

/**
 * 목표 질문의 답 칸 (11.05 밤 사용자 결정 — 계획 값을 보여 주지 않는다).
 *  · 보기 질문: 모든 고객에게 같은 보기 + 아직 모름 · 해당 없음 + 말로 적기
 *  · 숫자 질문: 숫자 칸(금액은 만 원) + 아직 모름 · 해당 없음 + 말로 적기
 * 다른 답 후보는 쓰지 않는다 — 후보가 계획 값에서 나오면 답을 알려 주게 된다.
 * 저장 값은 src/lib/answer-input.ts 가 만든다.
 */
const OTHER_LABEL = '말로 적기'

/** 숫자 칸 뒤에 붙는 단위 */
function unitText(card: Card): string {
  const slot = slotByKey(card.key)
  if ((card.unit ?? 'krw') === 'krw') return slot?.per === 'month' ? '만 원 / 매달' : slot?.per === 'year' ? '만 원 / 매년' : '만 원'
  if (card.unit === 'age') return '세'
  if (card.unit === 'percent') return '%'
  return slot?.suffix ?? ''
}

export default function AnswerInput({ card, state: s, onChange }: { card: Card; state: AnswerState; onChange: (s: AnswerState) => void }) {
  const options = card.options ?? []
  const choices = card.type === 'choice' ? options.filter(o => !NON_VALUE.includes(o)) : []
  const extras = options.filter(o => NON_VALUE.includes(o))
  const isMoney = card.type === 'number' && (card.unit ?? 'krw') === 'krw'
  const preview = s.mode === 'num' && isMoney ? numValue(card, s.num) : ''

  const optButton = (o: string) => (
    <button key={o} role="radio" aria-checked={s.mode === 'opt' && s.opt === o} className={`pick ${s.mode === 'opt' && s.opt === o ? 'pick-on' : ''}`}
      onClick={() => onChange({ ...s, mode: 'opt', opt: o })}>{o}</button>
  )

  return (
    <div style={{ marginTop: 20 }}>
      {card.type === 'number' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <input className="field" style={{ flex: 1, fontSize: 20, fontWeight: 700 }} inputMode={isMoney ? 'text' : 'numeric'}
            value={s.num} placeholder="숫자로 적기" aria-label={`${card.label} (${unitText(card)})`}
            onFocus={() => onChange({ ...s, mode: 'num' })}
            onChange={e => onChange({ ...s, mode: 'num', num: e.target.value })} />
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{unitText(card)}</span>
        </div>
      )}
      {isMoney && s.mode === 'num' && s.num.trim() && (
        <p className="meta" style={{ margin: '-4px 0 12px' }}>{preview ? `= ${wonText(Number(preview))}` : '숫자로 적어 주세요 (예: 300 · 4억 8천)'}</p>
      )}
      <div className="pick-list" role="radiogroup" aria-label={card.label}>
        {choices.map(optButton)}
        {extras.map(optButton)}
        <button role="radio" aria-checked={s.mode === 'other'} className={`pick pick-other ${s.mode === 'other' ? 'pick-on' : ''}`}
          onClick={() => onChange({ ...s, mode: 'other' })}>{OTHER_LABEL}</button>
      </div>
      {s.mode === 'other' && (
        <textarea className="field" rows={2} style={{ marginTop: 10 }} value={s.other} autoFocus
          onChange={e => onChange({ ...s, other: e.target.value })} placeholder="생각을 짧게 적어 주세요" aria-label={OTHER_LABEL} />
      )}
    </div>
  )
}
