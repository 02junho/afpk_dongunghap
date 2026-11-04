import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Rail from './Rail'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { parseWon, parseCount, type Card } from '../../judge/index'
import { rowToCard } from '../../lib/cards'
import { usePlanner } from './planner'
import AddCard from './AddCard'
import ExtractCards from './ExtractCards'
import { clearPendingImport, peekPendingImport, type ImportFiles } from './pendingImport'
import type { NewCard } from '../../lib/card-form'
import type { ExistingCard } from '../../extract/diff'
import { linkedNames, readLinked } from '../../lib/fileLinks'
import { copyText } from '../../lib/copy'
import { questionsMessage } from '../../lib/install'

/**
 * 카테고리별 카드 목록 + 1장 수정. 수정 = 새 버전 (card_versions insert, 동의 대기). 사유 필수.
 * 저장하면 그 카드 하나로 '먼저 묻기'(factcheck) 라운드가 부부 폰에 열리고, 둘 다 새 전제와 맞게 답하면
 * 서버가 activated_at 을 찍어 전제가 된다 — docs/03 §갱신 흐름 (10.14).
 *
 * 허용 범위는 타입에 따라 의미가 다르다 (number ±%, date ±개월). 같은 칸에 0.05와 6을 받으면 사고가 난다.
 */
function toleranceField(card: Card) {
  if (card.type === 'number')
    return { label: '허용 범위 (±%)', toInput: (t?: number) => ((t ?? 0.1) * 100).toFixed(1), fromInput: (s: string) => Number(s) / 100 }
  if (card.type === 'date')
    return { label: '허용 범위 (±개월)', toInput: (t?: number) => String(t ?? 6), fromInput: (s: string) => Number(s) }
  return null
}

function describeValue(card: Card, raw: string) {
  if (card.type !== 'number') return ''
  const n = (card.unit ?? 'krw') === 'krw' ? parseWon(raw) : parseCount(raw)
  if (isNaN(n)) return '해석할 수 없는 값입니다 (예: 6억, 8천만원, 60)'
  return (card.unit ?? 'krw') === 'krw' ? `${n.toLocaleString()}원` : `${n}${card.unit === 'age' ? '세' : ''}`
}

/** pending = 아직 전제가 아닌 최신 버전. awaiting = 그중 열린 먼저 묻기에서 답을 기다리는 중 (아니면 "동의 안 됨") */
/**
 * 10.23 팀 결정(Q2): 앱 안에서 전제를 바꾸지 않는다. 카드는 보기 전용이고, 두 분 생각이 달라지면
 * 처리 대기에서 "재설계 필요" → 앱 밖에서 다시 설계한다. 먼저 묻기(factcheck) 코드는 지우지 않고 이 스위치로 끈다.
 */
const ALLOW_PREMISE_CHANGE = false

/** 두 분께 질문 보내기 = 정기 맞춰보기. 11.04 팀 결정: 무조건 3문항 (서버 api/planner.ts QUESTIONS_PER_ROUND 와 같게) */
const QUESTIONS = 3

interface Row { cardId: string; versionId: string; version: number; pending: boolean; awaiting: boolean; inOpenRound?: boolean; card: Card }

const DEMO_ROWS: Row[] = CARDS.map(c => ({ cardId: c.key, versionId: c.key, version: 1, pending: false, awaiting: false, card: c }))

export default function Cards() {
  const p = usePlanner()
  const [rows, setRows] = useState<Row[]>(DEMO_ROWS)
  const [sel, setSel] = useState<Row | null>(null)
  const [value, setValue] = useState('')
  const [tol, setTol] = useState('')
  const [allowCondition, setAllowCondition] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  // "재무설계 엑셀로 새 부부 등록"에서 넘어온 파일이 있으면 엑셀 화면을 바로 연다 (10.27)
  const [importFile, setImportFile] = useState<ImportFiles | null>(() => peekPendingImport())
  const [extracting, setExtracting] = useState(!!importFile)
  useEffect(() => { clearPendingImport() }, [])
  // 지금 카드를 DB 에서 다 읽었나 — 엑셀 화면은 이걸 보고 이미 있는 카드와 맞춰 본다 (두 벌 방지, 11.04)
  const [loaded, setLoaded] = useState(false)
  // 이 컴퓨터에 연결해 둔 엑셀 (크롬 · 엣지). 있으면 맨 위에 "엑셀 다시 읽기"
  const [linked, setLinked] = useState(false)
  // 두 분께 질문 보내기 (11.04): 카드 목록에 체크 칸이 생기고, 정확히 3장을 고르면 보낼 수 있다. 처리 대기에서 오면 ?send=1
  const [params] = useSearchParams()
  const [sending, setSending] = useState(params.get('send') === '1')
  const [chosen, setChosen] = useState<string[]>([])
  const [sent, setSent] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { void linkedNames(p.couple.id).then(n => setLinked(!!(n.statement || n.cashflow))) }, [p.couple.id, extracting])

  async function rereadLinked() {
    setErr(''); setMsg('')
    // 버튼을 누른 그 자리에서 읽어야 "읽어도 될까요?" 창이 뜬다 (lib/fileLinks.ts)
    try { const fs = await readLinked(p.couple.id); setImportFile(fs); setExtracting(true); setAdding(false); setSel(null) }
    catch (e) { setErr((e as Error).message) }
  }

  async function add(card: NewCard, askNow: boolean) {
    const asCard: Card = {
      ...card, key: '', unit: card.unit ?? undefined, options: card.options ?? undefined, tolerance: card.tolerance ?? undefined,
      plannedValue: card.type === 'number' ? Number(card.plannedValue) : card.plannedValue,
    }
    if (!p.live || !p.pass) {
      const id = `demo-${Date.now()}`
      setRows(rs => [...rs, { cardId: id, versionId: id, version: 1, pending: false, awaiting: false, card: { ...asCard, key: id } }])
      setMsg(`(예시) "${card.label}" 추가`)
      setAdding(false)
      return
    }
    setBusy(true); setErr('')
    try {
      const r = await p.call<{ roundId: string | null; askSkipped: string | null }>('add_card', { card, askNow })
      setMsg(`"${card.label}" 추가했습니다.` +
        (r.roundId ? ' 두 분 폰에 1문항이 열렸습니다.' : r.askSkipped ? ` ${r.askSkipped}` : ''))
      setAdding(false)
      await load()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  async function load() {
    if (!p.live || !p.pass) { setRows(DEMO_ROWS); setLoaded(true); return }
    setLoaded(false)
    try {
      const { cards } = await p.call<{ cards: any[] }>('cards')
      setRows(cards.map(r => ({ cardId: r.card_id, versionId: r.id, version: r.version, pending: r.pending, awaiting: r.awaiting ?? r.pending, inOpenRound: !!r.inOpenRound, card: rowToCard(r, r) })))
      setLoaded(true)
      setErr('')
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { void load() }, [p.live, p.pass, p.couple.id])

  function pick(r: Row) {
    setSel(r); setAdding(false); setExtracting(false)
    const c = r.card
    setValue(String(c.plannedValue))
    const f = toleranceField(c)
    setTol(f ? f.toInput(c.tolerance) : '')
    setAllowCondition(!!c.allowCondition)
    setReason(''); setMsg('')
  }

  async function save() {
    if (!sel) return
    const f = toleranceField(sel.card)
    if (!p.live || !p.pass) {
      setRows(rs => rs.map(r => r.cardId === sel.cardId ? { ...r, pending: true, awaiting: true, version: r.version + 1, card: { ...r.card, plannedValue: sel.card.type === 'number' ? Number(value) : value } } : r))
      setMsg('(데모) v' + (sel.version + 1) + ' 동의 대기 — 실제로는 두 분께 먼저 묻기 라운드가 열립니다')
      setSel(null)
      return
    }
    setBusy(true)
    try {
      const r = await p.call<{ version: number; roundId: string }>('save_card', {
        cardId: sel.cardId,
        plannedValue: sel.card.type === 'number' ? String((sel.card.unit ?? 'krw') === 'krw' ? parseWon(value) : parseCount(value)) : value,
        tolerance: f ? f.fromInput(tol) : null,
        allowCondition,
        reason,
      })
      setMsg(`v${r.version} 저장 — 두 분 폰에 "먼저 묻기" 1문항이 열렸습니다. 둘 다 새 전제와 맞게 답하면 활성화됩니다.`)
      setSel(null)
      await load()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  function startSending() {
    setSending(true); setChosen([]); setSel(null); setAdding(false); setExtracting(false); setMsg(''); setErr(''); setSent(null)
  }
  function toggle(r: Row) {
    setChosen(cs => cs.includes(r.cardId) ? cs.filter(x => x !== r.cardId) : cs.length >= QUESTIONS ? cs : [...cs, r.cardId])
  }
  async function sendQuestions() {
    if (chosen.length !== QUESTIONS) return
    setErr(''); setMsg('')
    if (!p.live || !p.pass) {
      setMsg(`(예시) 두 분께 질문 ${QUESTIONS}개를 보냈습니다.`); setSent(QUESTIONS); setSending(false); setChosen([]); return
    }
    setBusy(true)
    try {
      const r = await p.call<{ roundId: string; kind: string }>('send_questions', { cardIds: chosen })
      setMsg(`두 분께 질문 ${QUESTIONS}개를 보냈습니다${r.kind === 'baseline' ? ' (첫 맞춰보기)' : ''}.`)
      setSent(QUESTIONS); setSending(false); setChosen([])
      await load()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function copyNotice() {
    const ok = await copyText(questionsMessage({ husband: p.couple.husband, wife: p.couple.wife, count: sent ?? QUESTIONS, url: `${location.origin}/c/join?code=${p.couple.code}` }))
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) } else setErr('복사하지 못했습니다.')
  }
  // 지금 묻는 중인 맞춰보기가 있으면 새로 보낼 수 없다 (부부 폰에 두 개가 겹치지 않게)
  const hasOpenRound = rows.some(r => r.inOpenRound)
  const chosenRows = CATEGORY_ORDER.flatMap(k => rows.filter(r => r.card.category === k && chosen.includes(r.cardId)))

  const f = sel ? toleranceField(sel.card) : null
  const changed = !!sel && (
    value !== String(sel.card.plannedValue) ||
    (f ? f.fromInput(tol) !== (sel.card.tolerance ?? (sel.card.type === 'date' ? 6 : 0.1)) : false) ||
    allowCondition !== !!sel.card.allowCondition
  )
  const invalidNumber = !!sel && sel.card.type === 'number' && describeValue(sel.card, value).startsWith('해석')

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">질문 카드 · {p.couple.label}</h1>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        {msg && (
          <p className="note" style={{ color: 'var(--agree)' }}>{msg}
            {sent && <button className="btn btn-quiet btn-small" style={{ marginLeft: 10, padding: '2px 10px', fontSize: 12 }} onClick={() => void copyNotice()}>{copied ? '복사됨 ✓' : '카톡 알림 문구 복사'}</button>}
          </p>
        )}

        <div className="cards-layout" style={{ marginTop: 20 }}>
          <div>
            {/* 카드가 많아도 내리지 않고 바로 누르게 목록 맨 위에 (10.23 사용자 요청) */}
            <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
              <button className="btn btn-small" onClick={startSending}>두 분께 질문 보내기</button>
              <button className="btn btn-quiet btn-small" onClick={() => { setAdding(true); setExtracting(false); setSending(false); setSel(null); setMsg('') }}>카드 추가</button>
              <button className="btn btn-quiet btn-small" onClick={() => { setImportFile(null); setExtracting(true); setAdding(false); setSending(false); setSel(null); setMsg('') }}>엑셀로 만들기</button>
              {linked && <button className="btn btn-quiet btn-small" disabled={!(p.live && p.pass)} onClick={() => void rereadLinked()}
                title="연결해 둔 엑셀을 지금 내용으로 다시 읽어, 바뀐 숫자만 보여 줍니다">엑셀 다시 읽기</button>}
            </div>
            {CATEGORY_ORDER.filter(k => rows.some(r => r.card.category === k)).map(k => (
              <div key={k}>
                <p className="cat-head">{CATEGORIES[k].label}</p>
                {rows.filter(r => r.card.category === k).map(r => {
                  const c = r.card, cat = CATEGORIES[c.category]
                  const on = sending && chosen.includes(r.cardId)
                  const locked = sending && !on && (chosen.length >= QUESTIONS || hasOpenRound)
                  return (
                    <button key={r.cardId} className={`card-row ${(sending ? on : sel?.cardId === r.cardId) ? 'card-row-on' : ''}`}
                      style={locked ? { opacity: 0.45 } : undefined} aria-pressed={sending ? on : undefined}
                      onClick={() => sending ? (!locked && toggle(r)) : pick(r)}>
                      {sending && <span aria-hidden style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{on ? '☑' : '☐'}</span>}
                      <span className="cat" style={{ background: cat.bg, color: cat.fg, width: 36, height: 36, borderRadius: 11 }}>{cat.short}</span>
                      <div>
                        <div className="card-name">{c.label}</div>
                        <div className="card-val">v{r.version} · {showValue(c)}{r.awaiting ? <> <span className="chip chip-talk" style={{ fontSize: 11, padding: '2px 8px' }}>동의 대기</span></>
                          : r.pending ? <> <span className="chip chip-escalate" style={{ fontSize: 11, padding: '2px 8px' }}>동의 안 됨</span></>
                          : r.inOpenRound ? <> <span className="chip chip-talk" style={{ fontSize: 11, padding: '2px 8px' }}>묻는 중</span></> : null}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="editor">
            {sending ? (
              <>
                <p className="editor-title">두 분께 질문 보내기 <span className="meta" style={{ fontSize: 14 }}>{chosen.length} / {QUESTIONS}장</span></p>
                {hasOpenRound ? (
                  <p className="will" style={{ color: 'var(--talk)' }}>진행 중인 질문이 있습니다. 두 분이 다 답한 뒤 보낼 수 있습니다.</p>
                ) : (
                  <>
                    {!chosenRows.length && <p className="meta">왼쪽에서 물어볼 카드 {QUESTIONS}장을 고르세요.</p>}
                    {chosenRows.map((r, i) => (
                      <p key={r.cardId} style={{ margin: '8px 0 0' }}><span className="sn-inline">{i + 1}</span> <b>{r.card.label}</b> · {showValue(r.card)}</p>
                    ))}
                    {chosen.length === QUESTIONS && <p className="meta" style={{ marginTop: 8 }}>3장을 모두 골랐습니다.</p>}
                    {chosenRows[0] && (
                      <>
                        <p className="label">두 분 폰에는 이렇게 나갑니다 (1번)</p>
                        <div className="will" style={{ marginTop: 0 }}>
                          <span className="meta">설계사님과 정한 계획</span><br />
                          <b>{chosenRows[0].card.label} · {showValue(chosenRows[0].card)}</b><br />
                          지금도 그렇게 생각하시나요? — 네, 그대로예요 / 아니요, 바뀌었어요
                        </div>
                      </>
                    )}
                  </>
                )}
                <div className="actions">
                  {!hasOpenRound && (
                    <button className="btn btn-small" disabled={busy || chosen.length !== QUESTIONS} onClick={() => void sendQuestions()}>
                      {busy ? '보내는 중…' : `고른 ${QUESTIONS}장으로 질문 보내기`}
                    </button>
                  )}
                  <button className="btn btn-quiet btn-small" onClick={() => { setSending(false); setChosen([]) }}>취소</button>
                </div>
              </>
            ) : extracting ? (
              <ExtractCards live={!!(p.live && p.pass)} call={p.call} initialFiles={importFile} onCancel={() => setExtracting(false)}
                coupleId={p.couple.id}
                existing={loaded ? rows.map((r): ExistingCard => ({ cardId: r.cardId, key: r.card.key, label: r.card.label, type: r.card.type, plannedValue: r.card.plannedValue, inOpenRound: r.inOpenRound })) : null}
                onSaved={(added, applied) => {
                  setExtracting(false)
                  setMsg([applied && `바뀐 숫자 ${applied}건 반영`, added && `질문 카드 ${added}장 추가`].filter(Boolean).join(' · ') + '.')
                  void load()
                }} />
            ) : adding ? <AddCard busy={busy} onSave={add} onCancel={() => setAdding(false)} /> : sel ? (() => {
              const c = sel.card, cat = CATEGORIES[c.category]
              return (
                <>
                  <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
                  <p className="editor-title" style={{ marginTop: 10 }}>{c.label}</p>
                  <p className="meta"><b>이 계획이 바뀌면 생기는 일</b> · {c.stake}</p>
                  {sel.awaiting && <p className="will" style={{ color: 'var(--talk)' }}>v{sel.version} 동의 대기 중</p>}
                  {sel.pending && !sel.awaiting && <p className="will" style={{ color: 'var(--escalate)' }}>v{sel.version}은 두 분 동의를 받지 못했습니다.</p>}

                  {!ALLOW_PREMISE_CHANGE ? (
                    <>
                      <dl className="pair" style={{ gridTemplateColumns: '92px 1fr', marginTop: 14 }}>
                        <dt className="meta">설계 전제</dt><dd><b>{showValue(c)}</b> <span className="meta">v{sel.version}</span></dd>
                        {f && <><dt className="meta">{f.label}</dt><dd>{f.toInput(c.tolerance)}</dd></>}
                        {c.type === 'choice' && <><dt className="meta">보기</dt><dd>{(c.options ?? []).join(' · ')} · 기타(직접 입력)</dd></>}
                      </dl>
                      <p className="label">두 분 폰에는 이렇게 나갑니다</p>
                      <div className="will" style={{ marginTop: 0 }}>
                        <span className="meta">설계사님과 정한 계획</span><br />
                        <b>{c.label} · {showValue(c)}</b><br />
                        지금도 그렇게 생각하시나요? — 네, 그대로예요 / 아니요, 바뀌었어요
                      </div>
                    </>
                  ) : (
                  <>
                  <label className="label" htmlFor="v">전제 값</label>
                  <textarea id="v" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={3} value={value} onChange={e => setValue(e.target.value)} />
                  <p className="was">v{sel.version} · {showValue(c)}{c.type === 'number' && value !== String(c.plannedValue) ? ` → ${describeValue(c, value)}` : ''}{c.type === 'date' ? ' · 형식 YYYY-MM' : ''}</p>

                  {f && (
                    <>
                      <label className="label" htmlFor="t">{f.label}</label>
                      <input id="t" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)', maxWidth: 160 }} inputMode="decimal" value={tol} onChange={e => setTol(e.target.value)} />
                      <p className="was">
                        이 범위 안이면 🟢, 두 배 안이면 🟡, 넘으면 🔴
                        {c.type === 'number' && !isNaN(parseWon(value)) && (c.unit ?? 'krw') === 'krw' ? ` · 지금 값 기준 ±${Math.round(parseWon(value) * f.fromInput(tol)).toLocaleString()}원` : ''}
                      </p>
                    </>
                  )}

                  {c.type === 'date' && (
                    <label className="label" style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={allowCondition} onChange={e => setAllowCondition(e.target.checked)} />
                      "정확한 시점 대신 조건으로" 답하는 것을 허용 — 조건부 답변은 자동 판정 없이 처리 대기로 옵니다
                    </label>
                  )}

                  <label className="label" htmlFor="r">바꾸는 이유 (필수 · 두 분에게 그대로 보입니다)</label>
                  <textarea id="r" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 0회차에서 두 분 모두 이직을 전제로 답함. 소득 재산정 필요." />
                  <p className="will">저장하면 이 카드만 두 분께 다시 묻습니다 — "{c.question}" 둘 다 새 전제와 맞게 답하면 v{sel.version + 1}이 활성화되고, 연동 수치는 공식대로 다시 계산됩니다. 어긋나면 처리 대기로 옵니다.</p>
                  <div className="actions">
                    <button className="btn btn-small" disabled={busy || sel.awaiting || !reason.trim() || !changed || invalidNumber} onClick={save}>
                      {busy ? '저장 중…' : `두 분께 먼저 묻고 v${sel.version + 1} 저장`}
                    </button>
                    <button className="btn btn-quiet btn-small" onClick={() => pick(sel)}>되돌리기</button>
                  </div>
                  </>
                  )}
                </>
              )
            })() : <p className="meta">왼쪽에서 카드를 고르세요.</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
