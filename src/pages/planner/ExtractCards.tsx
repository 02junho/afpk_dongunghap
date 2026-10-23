import { useState } from 'react'
import { CATEGORIES, showValue } from '../../data/demo'
import { normalizeNewCard, type NewCard } from '../../lib/card-form'
import type { SheetText } from '../../extract/sheet-text'
import type { ExtractDraft } from '../../extract/prompt'
import type { Card } from '../../judge/index'

/**
 * 재무제표 엑셀 → 질문 카드 초안 → 설계사 확인 → 고른 카드만 저장 (10.23 팀 결정 Q3, AI 활용 3번).
 * 엑셀 파일은 브라우저에서 글로 바뀌고, 글만 서버를 거쳐 AI 로 간다 (파일은 저장하지 않는다).
 * AI 초안은 그대로 들어가지 않는다 — 카드마다 설계사가 확인 체크를 해야 저장된다.
 */
type Row = ExtractDraft['raw'] & { checked: boolean; source: string; note: string }

const fieldStyle = { boxShadow: 'none', border: '2px solid var(--line)', padding: '8px 10px', fontSize: 14 } as const

function check(r: Row) {
  return normalizeNewCard({ ...r, tolerance: null })
}

export default function ExtractCards({ live, call, onSaved, onCancel }: {
  live: boolean
  call: <T>(action: string, params?: Record<string, unknown>) => Promise<T>
  onSaved: (n: number) => void
  onCancel: () => void
}) {
  const [sheet, setSheet] = useState<(SheetText & { file: string }) | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  async function pick(f: File | undefined) {
    if (!f) return
    setErr(''); setRows(null)
    // 엑셀 라이브러리는 크다 — 부부 폰 번들에 넣지 않으려고 이 버튼을 쓸 때만 불러온다
    try {
      const { workbookToText } = await import('../../extract/sheet-text')
      setSheet({ ...workbookToText(await f.arrayBuffer()), file: f.name })
    }
    catch (e) { setErr(`엑셀을 읽지 못했습니다: ${(e as Error).message}`) }
  }

  async function extract() {
    if (!sheet) return
    setBusy('reading'); setErr('')
    try {
      const r = await call<{ drafts: ExtractDraft[]; dropped: number; promptVersion: string }>('extract_cards', { sheetText: sheet.text })
      setRows(r.drafts.map(d => ({ ...d.raw, source: d.source, note: d.note, checked: !!d.card })))
      setInfo(`AI 초안 ${r.drafts.length}장${r.dropped ? ` · 출처가 없어 버린 카드 ${r.dropped}장` : ''} · 프롬프트 extract ${r.promptVersion}`)
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  async function save() {
    if (!rows) return
    const picked = rows.map(check).filter((r, i) => rows[i].checked && r.ok) as { ok: true; card: NewCard }[]
    setBusy('saving'); setErr('')
    let n = 0
    for (const r of picked) {
      try { await call('add_card', { card: r.card }); n++ }
      catch (e) { setErr(`${n}장 저장 뒤 멈춤: ${(e as Error).message}`); break }
    }
    setBusy('')
    if (n) onSaved(n)
  }

  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const okCount = rows ? rows.filter(r => r.checked && check(r).ok).length : 0

  return (
    <>
      <p className="editor-title">재무제표 엑셀로 질문 카드 만들기</p>
      <p className="meta">우리 조 재무제표 양식(상담 내용 · 고객정보 시트)을 올리면 AI가 질문 카드 초안을 만듭니다. 확인하고 고른 카드만 저장됩니다.</p>

      {!live && <p className="note" style={{ color: 'var(--escalate)' }}>왼쪽에 설계사 코드를 넣어야 쓸 수 있습니다.</p>}

      <label className="label" htmlFor="xlsx">엑셀 파일 (.xlsx)</label>
      <input id="xlsx" type="file" accept=".xlsx,.xls" disabled={!live || !!busy} onChange={e => void pick(e.target.files?.[0])} />
      {sheet && (
        <p className="was">
          {sheet.file} · 시트 {sheet.sheets.length}개 · 칸 {sheet.cells}개 읽음{sheet.truncated ? ' · 너무 길어 앞부분만 보냅니다' : ''}
        </p>
      )}
      <p className="will">실제 고객이면 이름·연락처·주민번호는 지우고 올려 주세요. 엑셀 파일은 저장하지 않고, 칸의 글만 AI에 보냅니다. AI는 엑셀에 적힌 값만 옮기고 계산하지 않습니다.</p>

      {sheet && !rows && (
        <div className="actions">
          <button className="btn btn-small" disabled={!live || !!busy} onClick={() => void extract()}>
            {busy === 'reading' ? 'AI가 읽는 중… (30초~1분)' : 'AI로 질문 카드 초안 만들기'}
          </button>
          <button className="btn btn-quiet btn-small" onClick={onCancel}>취소</button>
        </div>
      )}
      {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}

      {rows && (
        <>
          <p className="meta" style={{ marginTop: 14 }}>{info}</p>
          {!rows.length && <p className="note">뽑을 전제를 찾지 못했습니다. 상담 내용 시트가 들어 있는지 확인해 주세요.</p>}
          {rows.map((r, i) => {
            const v = check(r)
            const cat = CATEGORIES[r.category as Card['category']]
            return (
              <div key={i} className="qcard" style={{ padding: 14, marginTop: 10, opacity: r.checked ? 1 : 0.65 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
                  <input type="checkbox" checked={r.checked} disabled={!v.ok} onChange={e => set(i, { checked: e.target.checked })} />
                  {cat && <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>}
                  <input className="field" style={{ ...fieldStyle, flex: 1 }} value={r.label} onChange={e => set(i, { label: e.target.value })} aria-label="카드 이름" />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '6px 10px', marginTop: 8, alignItems: 'center' }}>
                  <span className="meta">설계 전제</span>
                  <div>
                    {r.type === 'choice' && r.options ? (
                      <select className="field" style={fieldStyle} value={r.plannedValue} onChange={e => set(i, { plannedValue: e.target.value })}>
                        <option value="">고르기</option>
                        {r.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="field" style={fieldStyle} value={r.plannedValue} onChange={e => set(i, { plannedValue: e.target.value })}
                        placeholder={r.type === 'date' ? '예: 2031-06' : r.type === 'number' ? '예: 3억, 6,700만원' : ''} />
                    )}
                    {v.ok && r.type !== 'text' && <span className="was">→ {showValue({ ...v.card, key: '', unit: v.card.unit ?? undefined, options: v.card.options ?? undefined, tolerance: undefined, plannedValue: v.card.type === 'number' ? Number(v.card.plannedValue) : v.card.plannedValue })}</span>}
                  </div>
                  <span className="meta">질문</span>
                  <input className="field" style={fieldStyle} value={r.question} onChange={e => set(i, { question: e.target.value })} />
                  <span className="meta">흔들리면</span>
                  <input className="field" style={fieldStyle} value={r.stake} onChange={e => set(i, { stake: e.target.value })} />
                </div>
                <p className="was" style={{ marginTop: 6 }}>출처: {r.source}{r.note ? ` · 메모: ${r.note}` : ''}</p>
                {!v.ok && <p className="note" style={{ color: 'var(--talk)', margin: '4px 0 0' }}>저장하려면: {v.error}</p>}
              </div>
            )
          })}
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn btn-small" disabled={!okCount || !!busy} onClick={() => void save()}>
              {busy === 'saving' ? '저장 중…' : `확인한 ${okCount}장 저장`}
            </button>
            <button className="btn btn-quiet btn-small" onClick={onCancel}>닫기</button>
          </div>
        </>
      )}
    </>
  )
}
