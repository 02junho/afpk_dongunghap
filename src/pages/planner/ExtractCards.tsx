import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, showPlanned, showValue } from '../../data/demo'
import { normalizeNewCard, type NewCard } from '../../lib/card-form'
import type { SheetText } from '../../extract/sheet-text'
import type { ExtractDraft } from '../../extract/prompt'
import type { Card } from '../../judge/index'
import { KIND_LABEL, type SheetKind } from '../../extract/names'
import { matchCandidates, sheetKey, type ExistingCard, type Matched } from '../../extract/diff'
import { canLinkFiles, linkedNames, linkFile, readLinked, unlinkFile } from '../../lib/fileLinks'
import type { ImportFiles } from './pendingImport'

/**
 * 재무제표 · 현금흐름표 엑셀 두 칸(10.27, 하나만 있어도 됨) → 질문 카드 후보 → 설계사 확인 → 고른 카드만 저장.
 * 표는 규칙으로 읽는다(AI 안 씀). 표가 아닌 상담 글일 때만 아래 AI 초안 길로 간다.
 *
 * 재무제표 엑셀 → 질문 카드 초안 → 설계사 확인 → 고른 카드만 저장 (10.23 팀 결정 Q3, AI 활용 3번).
 * 엑셀 파일은 브라우저에서 글로 바뀌고, 글만 서버를 거쳐 AI 로 간다 (파일은 저장하지 않는다).
 * AI 초안은 그대로 들어가지 않는다 — 카드마다 설계사가 확인 체크를 해야 저장된다.
 *
 * 다시 읽기 (11.04, docs/16): 표로 읽은 항목은 이미 있는 카드와 맞춰 본다 (src/extract/diff.ts).
 *   새 항목 → 지금처럼 골라 추가 / 금액이 바뀐 항목 → "반영"을 고르면 새 버전 / 그대로인 항목 → 다시 만들지 않는다.
 *   크롬 · 엣지 컴퓨터에서는 파일을 "연결"해 두면 다음부터 다시 올리지 않고 "다시 읽기"만 누른다.
 */
type Row = ExtractDraft['raw'] & {
  checked: boolean; source: string; note: string
  /** 표로 읽은 줄만: 엑셀 자리와 원 단위 값. 규칙이 붙인 처음 카드 이름 (다시 읽을 때 이름으로도 찾는다) */
  item?: { table: string; label: string; value: number }
  origLabel?: string
}

const fieldStyle = { boxShadow: 'none', border: '2px solid var(--line)', padding: '8px 10px', fontSize: 14 } as const

function check(r: Row) {
  return normalizeNewCard({ ...r, tolerance: null })
}

export default function ExtractCards({ live, call, onSaved, onCancel, initialFiles, existing, coupleId }: {
  live: boolean
  /** "재무설계 엑셀로 새 부부 등록"·"엑셀 다시 읽기"에서 넘어온 파일들 — 열리자마자 읽는다 */
  initialFiles?: ImportFiles | null
  /** 이 부부의 지금 카드. null = 아직 불러오는 중 (그동안은 저장하지 않는다 — 두 벌이 되지 않게) */
  existing: ExistingCard[] | null
  coupleId: string
  call: <T>(action: string, params?: Record<string, unknown>) => Promise<T>
  onSaved: (added: number, applied: number) => void
  onCancel: () => void
}) {
  const [files, setFiles] = useState<ImportFiles>({})
  const [linked, setLinked] = useState<Partial<Record<SheetKind, string>>>({})
  const [skip, setSkip] = useState<Record<number, boolean>>({})
  const canLink = canLinkFiles()
  useEffect(() => { void linkedNames(coupleId).then(setLinked) }, [coupleId])
  const [sheet, setSheet] = useState<(SheetText & { file: string }) | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  // rules = 재무제표 표를 규칙으로 읽음 (AI 안 씀, 10.27) / ai = 표가 아닌 상담 글 → AI 초안
  const [mode, setMode] = useState<'rules' | 'ai' | null>(null)

  async function pick(next: ImportFiles) {
    setFiles(next)
    const list = (Object.entries(next) as [SheetKind, File][]).filter(([, f]) => f)
    if (!list.length) return
    setErr(''); setRows(null); setMode(null); setSkip({})
    // 엑셀 라이브러리는 크다 — 부부 폰 번들에 넣지 않으려고 이 버튼을 쓸 때만 불러온다
    try {
      const bufs = await Promise.all(list.map(async ([kind, f]) => ({ kind, data: await f.arrayBuffer(), name: f.name })))
      const [{ workbookToText, MAX_SHEET_TEXT }, { statementCandidates }] = await Promise.all([import('../../extract/sheet-text'), import('../../extract/statement')])
      const texts = bufs.map(b => workbookToText(b.data))
      const text = texts.map(t => t.text).join('\n')
      setSheet({
        text: text.slice(0, MAX_SHEET_TEXT), truncated: text.length > MAX_SHEET_TEXT || texts.some(t => t.truncated),
        sheets: texts.flatMap(t => t.sheets), cells: texts.reduce((n, t) => n + t.cells, 0),
        file: bufs.map(b => `${KIND_LABEL[b.kind]}: ${b.name}`).join(' / '),
      })
      // 1순위: 설계사가 완성한 표 — "항목 | 금액" 을 규칙으로 읽는다. 숫자를 AI 가 만지지 않는다
      const cs = statementCandidates(bufs)
      if (cs.length >= 3) {
        setRows(cs.map(c => ({
          category: c.category, type: 'number', unit: 'krw', label: c.label, question: c.question,
          plannedValue: String(c.item.value), options: null, stake: c.stake,
          source: `${c.item.sheet} ${c.item.cell}`,
          note: `${c.item.table} · ${c.item.group} · 엑셀 "${c.item.label}" ${(c.item.value / (c.item.unitNote === '만원' ? 10_000 : 1)).toLocaleString()}${c.item.unitNote}${c.known ? '' : ' · 새 항목'}`,
          checked: c.pick,
          item: { table: c.item.table, label: c.item.label, value: c.item.value }, origLabel: c.label,
        })))
        setInfo(`엑셀 표에서 항목 ${cs.length}개를 읽었습니다 · 기본 선택 ${cs.filter(c => c.pick).length}개`)
        setMode('rules')
      } else setMode('ai')
    }
    catch (e) { setErr(`엑셀을 읽지 못했습니다: ${(e as Error).message}`) }
  }
  useEffect(() => { if (initialFiles) void pick(initialFiles) }, [initialFiles])

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

  // 표로 읽은 줄을 지금 카드와 맞춰 본다. AI 초안 줄은 맞춰 보지 않는다 (전부 새 카드)
  const matched: Matched[] | null = useMemo(() => {
    if (!rows) return null
    if (mode !== 'rules') return rows.map(() => ({ status: 'new' as const }))
    if (!existing) return null
    return matchCandidates(rows.map(r => ({ item: r.item!, label: r.origLabel ?? r.label })), existing)
  }, [rows, mode, existing])
  const statusOf = (i: number) => matched?.[i]?.status ?? 'new'
  // 엑셀로 만든 카드인데 이번 엑셀에 없는 것 — 알려만 주고 그대로 둔다 (지우기는 설계사가 판단)
  const missing = mode === 'rules' && matched && existing
    ? existing.filter(e => e.key.startsWith('xl:') && !matched.some(m => m.existing?.cardId === e.cardId)) : []

  const willAdd = (i: number) => statusOf(i) === 'new' && rows![i].checked && check(rows![i]).ok
  // 바뀐 숫자는 기본으로 반영 쪽 — 설계사가 엑셀을 고쳐서 다시 읽은 것이니까. 빼려면 체크를 끈다
  const willApply = (i: number) => statusOf(i) === 'changed' && !skip[i] && !matched![i].existing!.inOpenRound

  async function save() {
    if (!rows || !matched) return
    setBusy('saving'); setErr('')
    let added = 0, applied = 0
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (willAdd(i)) {
          const v = check(r) as { ok: true; card: NewCard }
          await call('add_card', { card: v.card, sourceKey: r.item ? sheetKey({ item: r.item }) : undefined }); added++
        } else if (willApply(i)) {
          const e = matched[i].existing!
          const was = showPlanned('number', 'krw', String(e.plannedValue)), now = showPlanned('number', 'krw', String(r.item!.value))
          await call('apply_sheet_value', { cardId: e.cardId, plannedValue: String(r.item!.value), reason: `엑셀 다시 읽기 (${r.source}): ${was} → ${now}` }); applied++
        }
      }
    } catch (e) { setErr(`새 카드 ${added}장 · 반영 ${applied}건 뒤 멈춤: ${(e as Error).message}`) }
    setBusy('')
    if (added || applied) onSaved(added, applied)
  }

  async function connect(k: SheetKind) {
    setErr('')
    try {
      const f = await linkFile(coupleId, k)
      setLinked(await linkedNames(coupleId))
      if (f) void pick({ ...files, [k]: f })
    } catch (e) { setErr(`파일을 연결하지 못했습니다: ${(e as Error).message}`) }
  }
  async function reread() {
    setErr('')
    try { const fs = await readLinked(coupleId); if (Object.keys(fs).length) void pick(fs) }
    catch (e) { setErr((e as Error).message) }
  }

  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const count = (s: Matched['status']) => (matched ?? []).filter(m => m.status === s).length
  const addCount = rows && matched ? rows.filter((_, i) => willAdd(i)).length : 0
  const applyCount = rows && matched ? rows.filter((_, i) => willApply(i)).length : 0

  return (
    <>
      <p className="editor-title">재무설계 엑셀로 질문 카드 만들기</p>

      {!live && <p className="note" style={{ color: 'var(--escalate)' }}>왼쪽에 설계사 코드를 넣어야 쓸 수 있습니다.</p>}

      {(['statement', 'cashflow'] as const).map(k => (
        <div key={k}>
          <label className="label" htmlFor={`xlsx-${k}`}>{KIND_LABEL[k]} 엑셀 (.xlsx){files[k] ? ` — ${files[k]!.name}` : ''}</label>
          {linked[k] ? (
            <p className="was" style={{ margin: 0 }}>
              연결됨: <b>{linked[k]}</b>
              <button className="btn btn-quiet btn-small" style={{ marginLeft: 8, padding: '2px 10px', fontSize: 11 }} disabled={!!busy}
                onClick={() => void unlinkFile(coupleId, k).then(() => linkedNames(coupleId)).then(setLinked)}>연결 끊기</button>
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input id={`xlsx-${k}`} type="file" accept=".xlsx,.xls" disabled={!live || !!busy} onChange={e => { const f = e.target.files?.[0]; if (f) void pick({ ...files, [k]: f }) }} />
              {canLink && (
                <button className="btn btn-quiet btn-small" style={{ padding: '2px 10px', fontSize: 11 }} disabled={!live || !!busy} onClick={() => void connect(k)}
                  title="다음부터는 엑셀을 고쳐 저장한 뒤 '다시 읽기'만 누르면 됩니다 (크롬 · 엣지 컴퓨터)">이 컴퓨터 파일로 연결</button>
              )}
            </div>
          )}
        </div>
      ))}
      {(linked.statement || linked.cashflow) && (
        <div className="actions">
          <button className="btn btn-small" disabled={!live || !!busy} onClick={() => void reread()}>연결된 엑셀 다시 읽기</button>
        </div>
      )}
      {sheet && (
        <p className="was">
          {sheet.file} · 시트 {sheet.sheets.length}개 · 칸 {sheet.cells}개 읽음{sheet.truncated ? ' · 너무 길어 앞부분만 보냅니다' : ''}
        </p>
      )}
      <p className="will">{mode === 'rules'
        ? '금액은 엑셀의 "만원"을 원으로 바꾼 값입니다.'
        : '실제 고객이면 이름·연락처·주민번호는 지우고 올려 주세요.'}</p>

      {sheet && !rows && mode === 'ai' && (
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
          {mode === 'rules' && !matched && <p className="note">이미 있는 질문 카드와 맞춰 보는 중…</p>}
          {mode === 'rules' && matched && (count('same') > 0 || count('changed') > 0) && (
            <p className="will">
              바뀐 숫자 <b>{count('changed')}</b>건 · 새 항목 {count('new')}개 · 그대로 {count('same')}개
            </p>
          )}
          {missing.length > 0 && (
            <p className="was">이번 엑셀에서 찾지 못한 카드 {missing.length}장: {missing.map(m => m.label).join(', ')} (카드는 그대로 둡니다)</p>
          )}
          {rows.map((r, i) => {
            const st = statusOf(i)
            if (st === 'same') return null
            if (st === 'changed') {
              const e = matched![i].existing!
              const on = !skip[i] && !e.inOpenRound
              return (
                <div key={i} className="qcard" style={{ padding: 14, marginTop: 10, opacity: on ? 1 : 0.65, borderColor: 'var(--talk)' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
                    <input type="checkbox" checked={on} disabled={!!e.inOpenRound} onChange={ev => setSkip(s => ({ ...s, [i]: !ev.target.checked }))} />
                    <span className="chip chip-talk">바뀐 숫자</span>
                    {e.label}
                  </label>
                  <p style={{ margin: '8px 0 0' }}>
                    <span className="meta">지금 카드</span> {showPlanned('number', 'krw', String(e.plannedValue))}
                    <span className="meta"> → 엑셀</span> <b>{showPlanned('number', 'krw', String(r.item!.value))}</b>
                  </p>
                  <p className="was" style={{ marginTop: 6 }}>출처: {r.source} · 반영하면 새 버전으로 남고, 예전 값은 변경 이력에 남습니다</p>
                  {e.inOpenRound && <p className="note" style={{ color: 'var(--talk)', margin: '4px 0 0' }}>맞춰보기 중이라 지금은 반영할 수 없습니다.</p>}
                </div>
              )
            }
            const v = check(r)
            const cat = CATEGORIES[r.category as Card['category']]
            return (
              <div key={i} className="qcard" style={{ padding: 14, marginTop: 10, opacity: r.checked ? 1 : 0.65 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
                  <input type="checkbox" checked={r.checked} disabled={!v.ok} onChange={e => set(i, { checked: e.target.checked })} />
                  {cat && <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>}
                  <input className="field" style={{ ...fieldStyle, flex: 1 }} value={r.label} onChange={e => set(i, { label: e.target.value })} aria-label="카드 이름" />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '6px 10px', marginTop: 8, alignItems: 'center' }}>
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
                  <span className="meta">바뀌면 생기는 일</span>
                  <input className="field" style={fieldStyle} value={r.stake} onChange={e => set(i, { stake: e.target.value })} />
                </div>
                <p className="was" style={{ marginTop: 6 }}>출처: {r.source}{r.note ? ` · 메모: ${r.note}` : ''}</p>
                {!v.ok && <p className="note" style={{ color: 'var(--talk)', margin: '4px 0 0' }}>저장하려면: {v.error}</p>}
              </div>
            )
          })}
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn btn-small" disabled={!(addCount + applyCount) || !!busy} onClick={() => void save()}>
              {busy === 'saving' ? '저장 중…'
                : applyCount ? `바뀐 숫자 ${applyCount}건 반영${addCount ? ` · 새 카드 ${addCount}장 저장` : ''}`
                : `확인한 ${addCount}장 저장`}
            </button>
            <button className="btn btn-quiet btn-small" onClick={onCancel}>닫기</button>
          </div>
        </>
      )}
    </>
  )
}
