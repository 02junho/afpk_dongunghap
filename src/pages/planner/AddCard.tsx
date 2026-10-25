import { useMemo, useState } from 'react'
import { CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { DEFAULT_TOLERANCE, KIND_OPTIONS, normalizeNewCard, splitOptions, type NewCard } from '../../lib/card-form'
import type { Card } from '../../judge/index'

/**
 * [카드 추가] 폼. 설계사가 설계안에 있는 전제 하나를 카드로 직접 만든다 (docs/08 A안).
 * v1 은 저장하는 즉시 전제가 된다. 부부 동의는 값을 바꿀 때만 (save_card → 먼저 묻기).
 * 검사 규칙은 src/lib/card-form.ts 하나 — 서버(add_card)도 같은 함수로 다시 검사한다.
 */
const fieldStyle = { boxShadow: 'none', border: '2px solid var(--line)' } as const

export default function AddCard({ busy, onSave, onCancel }: {
  busy: boolean
  onSave: (card: NewCard, askNow: boolean) => void
  onCancel: () => void
}) {
  const [category, setCategory] = useState<Card['category']>('housing')
  const [kind, setKind] = useState('krw')
  const [label, setLabel] = useState('')
  const [question, setQuestion] = useState('')
  const [value, setValue] = useState('')
  const [options, setOptions] = useState('')
  const [tol, setTol] = useState('')
  const [allowCondition, setAllowCondition] = useState(false)
  const [stake, setStake] = useState('')
  const [askNow, setAskNow] = useState(false)

  const k = KIND_OPTIONS.find(o => o.id === kind)!
  const opts = splitOptions(options)

  const result = useMemo(() => normalizeNewCard({
    category, type: k.type, unit: k.unit ?? null, label, question, plannedValue: value, options: opts, stake, allowCondition,
    tolerance: tol.trim() === '' ? null : k.type === 'number' ? Number(tol) / 100 : k.type === 'date' ? Number(tol) : null,
  }), [category, kind, label, question, value, options, tol, allowCondition, stake])

  // 첫 입력 전엔 빨간 글씨를 띄우지 않는다
  const touched = !!(label || question || value || stake)
  // 값 칸 미리보기는 다른 칸이 비어 있어도 보여준다 ("3억" → 3억원). 값만 따로 검사한다.
  const valueOnly = value.trim()
    ? normalizeNewCard({ category, type: k.type, unit: k.unit ?? null, label: '-', question: '-', stake: '-', plannedValue: value, options: opts })
    : null
  const preview = valueOnly?.ok
    ? showValue({ ...valueOnly.card, key: '', unit: valueOnly.card.unit ?? undefined, options: undefined, tolerance: undefined, plannedValue: valueOnly.card.type === 'number' ? Number(valueOnly.card.plannedValue) : valueOnly.card.plannedValue })
    : valueOnly ? `✗ ${valueOnly.error}` : ''

  return (
    <>
      <p className="editor-title">카드 추가</p>
      <p className="meta">설계안에 있는 전제를 한 장 더 만듭니다. 저장하면 v1이 바로 전제가 됩니다.</p>

      <label className="label" htmlFor="ac-cat">주제</label>
      <select id="ac-cat" className="field" style={fieldStyle} value={category} onChange={e => setCategory(e.target.value as Card['category'])}>
        {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
      </select>

      <label className="label" htmlFor="ac-kind">답의 형태</label>
      <select id="ac-kind" className="field" style={fieldStyle} value={kind} onChange={e => { setKind(e.target.value); setTol('') }}>
        {KIND_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <p className="was">{k.type === 'text' ? '서술형은 AI가 같은 뜻인지 판별합니다. 숫자·시점·선택으로 받을 수 있으면 그쪽이 정확합니다.' : '정해진 규칙으로 판정합니다 (AI 없이).'}</p>

      <label className="label" htmlFor="ac-label">카드 이름</label>
      <input id="ac-label" className="field" style={fieldStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="예: 전세 보증금" maxLength={40} />

      <label className="label" htmlFor="ac-q">두 분께 묻는 질문 (휴대폰에 그대로 나갑니다)</label>
      <textarea id="ac-q" className="field" style={fieldStyle} rows={2} value={question} onChange={e => setQuestion(e.target.value)} placeholder="예: 전세 보증금은 얼마로 생각하고 계세요?" />

      {k.type === 'choice' && (
        <>
          <label className="label" htmlFor="ac-opts">선택지 (쉼표나 줄바꿈으로 구분)</label>
          <textarea id="ac-opts" className="field" style={fieldStyle} rows={2} value={options} onChange={e => setOptions(e.target.value)} placeholder="예: 남편, 아내, 둘 다, 아직 모름" />
        </>
      )}

      <label className="label" htmlFor="ac-v">설계 전제 값</label>
      {k.type === 'choice' ? (
        <select id="ac-v" className="field" style={fieldStyle} value={value} onChange={e => setValue(e.target.value)} disabled={opts.length < 2}>
          <option value="">{opts.length < 2 ? '선택지를 먼저 두 개 이상' : '설계안의 전제를 고르세요'}</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : k.type === 'text' ? (
        <textarea id="ac-v" className="field" style={fieldStyle} rows={3} value={value} onChange={e => setValue(e.target.value)} placeholder="예: 현 직장 유지, 연봉 상승은 물가 수준" />
      ) : (
        <input id="ac-v" className="field" style={fieldStyle} value={value} onChange={e => setValue(e.target.value)} placeholder={k.hint} />
      )}
      {preview && k.type !== 'text' && k.type !== 'choice' && <p className="was">{preview.startsWith('✗') ? preview : `→ ${preview}`}</p>}

      {(k.type === 'number' || k.type === 'date') && (
        <>
          <label className="label" htmlFor="ac-tol">{k.type === 'number' ? '허용 범위 (±%)' : '허용 범위 (±개월)'}</label>
          <input id="ac-tol" className="field" style={{ ...fieldStyle, maxWidth: 160 }} inputMode="decimal" value={tol} onChange={e => setTol(e.target.value)}
            placeholder={k.type === 'number' ? String(DEFAULT_TOLERANCE.number * 100) : String(DEFAULT_TOLERANCE.date)} />
          <p className="was">비우면 기본값. 이 범위 안이면 🟢, 두 배 안이면 🟡, 넘으면 🔴</p>
        </>
      )}

      {k.type === 'date' && (
        <label className="label" style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={allowCondition} onChange={e => setAllowCondition(e.target.checked)} />
          "정확한 시점 대신 조건으로" 답하는 것을 허용 — 조건부 답변은 처리 대기로 옵니다
        </label>
      )}

      <label className="label" htmlFor="ac-stake">이 계획이 바뀌면 생기는 일 (설계사만 봅니다)</label>
      <textarea id="ac-stake" className="field" style={fieldStyle} rows={2} value={stake} onChange={e => setStake(e.target.value)} placeholder="예: 자기자금을 뺀 나머지가 대출 금액. 근거 숫자가 있으면 함께" />

      <label className="label" style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={askNow} onChange={e => setAskNow(e.target.checked)} />
        저장하고 이 카드 한 장을 두 분께 바로 묻기 (정기 맞춰보기)
      </label>

      {touched && !result.ok && <p className="note" style={{ color: 'var(--escalate)' }}>{result.error}</p>}
      <p className="will">
        저장하면 v1이 <b>바로 전제</b>가 됩니다 — 상담에서 합의한 설계안의 값이니까요. 나중에 값을 바꿀 때만 두 분께 먼저 묻습니다.
        {askNow ? ' 바로 묻기를 켰으니 두 분 폰에 1문항이 열립니다 (이미 진행 중인 맞춰보기가 있으면 열지 않습니다).' : ''}
      </p>
      <div className="actions">
        <button className="btn btn-small" disabled={busy || !result.ok} onClick={() => result.ok && onSave(result.card, askNow)}>
          {busy ? '저장 중…' : askNow ? '추가하고 바로 묻기' : '카드 추가'}
        </button>
        <button className="btn btn-quiet btn-small" onClick={onCancel}>취소</button>
      </div>
    </>
  )
}
