import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Rail from './Rail'
import { usePlanner } from './planner'
import { CATEGORIES, showPlanned } from '../../data/demo'
import { SLOTS, THEMES, type Slot } from '../../data/template'
import { planValue } from '../../lib/plan-values'
import type { PlanFind } from '../../extract/plan'
import { clearPendingWord, peekPendingWord } from './pendingImport'

/**
 * 질문 틀 (11.04 새 방향, docs/20 · 21). 틀 30칸(6테마 × 5문항)은 모든 고객이 같고, 계획 값만 채운다.
 *  · Word 에서 채우기: AI 가 재무설계 결과에서 값을 찾아 원문과 함께 보여 준다 → 설계사가 칸마다 "원문과 맞음"을 눌러야 저장된다
 *  · 숫자 · 날짜는 AI 가 아니라 규칙(plan-values)이 바꾼다. 저장은 덮어쓰지 않고 새 버전
 *  · 30칸이 다 차면 여기서 사이클을 시작한다
 */
interface Saved { planned: string; version: number; inOpenRound: boolean }
interface CycleBrief { cycle: { week: number | null; closedAt: string | null; nextAt: string } | null; filled: number; total: number }

/** 저장된 값 → 입력칸에 보이는 글 (설계사가 그대로 고쳐 쓸 수 있게 — 금액은 쉼표, 날짜는 YYYY-MM) */
function toInput(s: Slot, planned: string): string {
  if (s.type === 'number' && (s.unit ?? 'krw') === 'krw' && /^\d+$/.test(planned)) return Number(planned).toLocaleString('ko-KR')
  return planned
}

/** 예시 모드에서 Word 에 없다고 보여 줄 칸 (docs/20 의 "(Word에서)" 칸 일부) */
const DEMO_NOT_FOUND = ['t2_edu_monthly', 't4_child_policy', 't6_emergency', 't6_invest_ratio']

export default function Template() {
  const p = usePlanner()
  const liveMode = !!(p.live && p.pass)
  const [saved, setSaved] = useState<Record<string, Saved>>({})
  const [input, setInput] = useState<Record<string, string>>({})
  const [finds, setFinds] = useState<Record<string, PlanFind>>({})
  const [ok, setOk] = useState<Record<string, boolean>>({})        // Word 에서 온 값: 설계사가 원문과 맞다고 확인
  const [source, setSource] = useState<'manual' | 'word' | 'example'>('manual')
  const [brief, setBrief] = useState<CycleBrief | null>(null)
  const [period, setPeriod] = useState<3 | 6>(3)
  const [busy, setBusy] = useState<'' | 'load' | 'word' | 'save' | 'start'>('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    if (!liveMode) {
      const s: Record<string, Saved> = {}
      for (const x of SLOTS) s[x.key] = { planned: x.example, version: 1, inOpenRound: x.week === 3 }
      setSaved(s); setInput(Object.fromEntries(SLOTS.map(x => [x.key, toInput(x, x.example)])))
      setBrief({ cycle: { week: 3, closedAt: null, nextAt: '' }, filled: 30, total: 30 })
      return
    }
    setBusy('load')
    try {
      const [t, c] = await Promise.all([
        p.call<{ values: Record<string, Saved> }>('template'),
        p.call<CycleBrief>('cycle').catch(e => { setErr((e as Error).message); return null }),
      ])
      setSaved(t.values)
      setInput(Object.fromEntries(SLOTS.map(x => [x.key, t.values[x.key] ? toInput(x, t.values[x.key].planned) : ''])))
      setFinds({}); setOk({}); setSource('manual')
      setBrief(c)
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }
  useEffect(() => { void load() }, [liveMode, p.couple.id])

  // 새 부부 등록에서 Word 를 골라 왔으면 바로 찾는다
  useEffect(() => {
    const f = peekPendingWord()
    if (f && liveMode) { clearPendingWord(); void readWord(f) }
  }, [liveMode])

  async function readWord(f: File) {
    setErr(''); setMsg('')
    if (!liveMode) {
      // 예시 모드(흐름도 · 시연): AI 를 부르지 않고 가상고객 값으로 "찾은 모양"만 보여 준다. 원문 칸은 예시 문장이다
      const byKey: Record<string, PlanFind> = {}
      for (const s of SLOTS) {
        if (DEMO_NOT_FOUND.includes(s.key)) continue
        const shown = showPlanned(s.type, s.unit, s.example, s.key)
        byKey[s.key] = { key: s.key, found: shown, quote: `${s.find}: ${shown}`, note: '', quoteInDoc: true, value: s.example }
      }
      setSaved({}); setFinds(byKey); setOk({}); setSource('word')
      setInput(Object.fromEntries(SLOTS.map(x => [x.key, byKey[x.key] ? toInput(x, x.example) : ''])))
      setBrief({ cycle: null, filled: 0, total: SLOTS.length })
      setMsg(`(예시) "${f.name}"에서 ${Object.keys(byKey).length}칸을 찾았습니다. 칸마다 원문을 보고 "원문과 맞음"을 눌러 주세요. 못 찾은 ${DEMO_NOT_FOUND.length}칸은 직접 채웁니다.`)
      return
    }
    setBusy('word')
    try {
      const { docxToText } = await import('../../lib/docx-text')
      const { text, truncated } = await docxToText(await f.arrayBuffer())
      if (!text.trim()) throw new Error('재무설계 결과 파일에서 글을 읽지 못했습니다')
      const r = await p.call<{ finds: PlanFind[]; promptVersion: string; error?: string }>('extract_plan', { docText: text })
      if (r.error) throw new Error(r.error)
      const byKey: Record<string, PlanFind> = {}
      const next = { ...input }
      for (const fd of r.finds) {
        if (!fd.found) continue
        byKey[fd.key] = fd
        const s = SLOTS.find(x => x.key === fd.key)!
        next[fd.key] = fd.value ? toInput(s, fd.value) : fd.found
      }
      setFinds(byKey); setOk({}); setInput(next); setSource('word')
      const n = Object.keys(byKey).length
      setMsg(`"${f.name}"에서 ${n}칸을 찾았습니다${truncated ? ' (글이 길어 앞부분만 읽음)' : ''}. 칸마다 원문을 보고 "원문과 맞음"을 눌러 주세요. 못 찾은 ${SLOTS.length - n}칸은 직접 채웁니다.`)
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  function fillExample() {
    setInput(Object.fromEntries(SLOTS.map(x => [x.key, saved[x.key]?.inOpenRound ? toInput(x, saved[x.key].planned) : toInput(x, x.example)])))
    setFinds({}); setOk({}); setSource('example'); setMsg('가상고객 예시 값을 넣었습니다. 저장을 눌러야 반영됩니다.')
  }

  // 칸마다 상태: 저장할 것 / 확인 기다림 / 오류
  const rows = useMemo(() => SLOTS.map(s => {
    const raw = input[s.key] ?? ''
    const v = raw.trim() ? planValue(s, raw) : null
    const cur = saved[s.key]
    const fromWord = !!finds[s.key]
    const waiting = fromWord && !ok[s.key]
    const changed = !!v && v.ok && v.value !== cur?.planned
    return { s, raw, v, cur, fromWord, waiting, changed, locked: !!cur?.inOpenRound }
  }), [input, saved, finds, ok])
  const toSave = rows.filter(r => r.changed && !r.waiting && !r.locked)
  const waitingCount = rows.filter(r => r.changed && r.waiting).length
  const savedCount = SLOTS.filter(s => saved[s.key]).length

  async function save() {
    setErr(''); setMsg('')
    const values = Object.fromEntries(toSave.map(r => [r.s.key, (r.v as { value: string }).value]))
    if (!liveMode) { setSaved(x => ({ ...x, ...Object.fromEntries(toSave.map(r => [r.s.key, { planned: (r.v as { value: string }).value, version: (x[r.s.key]?.version ?? 0) + 1, inOpenRound: false }])) })); setMsg(`(예시) ${toSave.length}칸 저장`); return }
    setBusy('save')
    try {
      const r = await p.call<{ saved: number; changed: string[]; skipped: string[]; errors: { key: string; error: string }[] }>('template_save', { values, source })
      const parts = [`${r.saved}칸 저장했습니다`]
      if (r.skipped.length) parts.push(`지금 묻는 중이라 건너뜀: ${r.skipped.join(', ')}`)
      if (r.errors.length) parts.push(`저장 못 함 ${r.errors.length}칸`)
      if (waitingCount) parts.push(`원문 확인 안 한 ${waitingCount}칸은 저장하지 않음`)
      await load()
      setMsg(parts.join(' · '))
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  async function startCycle() {
    setErr(''); setMsg('')
    if (!liveMode) { setMsg('(예시) 사이클을 시작했습니다'); return }
    setBusy('start')
    try {
      await p.call('cycle_start', { periodMonths: period })
      await load()
      setMsg('사이클을 시작했습니다. 1주차 주택 질문 5개가 두 분 폰에 열렸습니다.')
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  const active = brief?.cycle && !brief.cycle.closedAt
  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">질문 틀 · {p.couple.label} <span className="meta" style={{ fontSize: 15 }}>{savedCount} / {SLOTS.length}칸</span></h1>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        {msg && <p className="note" style={{ color: 'var(--agree)' }}>{msg}</p>}

        <div className="actions" style={{ marginTop: 14 }}>
          <label className={`btn btn-small${busy ? ' btn-off' : ''}`} htmlFor="tpl-word" style={{ cursor: 'pointer' }}>{busy === 'word' ? 'AI가 찾는 중… (30초~1분)' : '재무설계 결과에서 채우기'}</label>
          <input id="tpl-word" type="file" accept=".docx" hidden disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readWord(f) }} />
          <button className="btn btn-quiet btn-small" disabled={!!busy} onClick={fillExample}>예시 값으로 채우기 (테스트용)</button>
          <button className="btn btn-small" style={{ marginLeft: 'auto' }} disabled={!!busy || !toSave.length} onClick={() => void save()}>
            {busy === 'save' ? '저장 중…' : `저장 (${toSave.length}칸)`}
          </button>
        </div>

        {THEMES.map(t => {
          const cat = CATEGORIES[t.category]
          return (
            <div key={t.week} style={{ marginTop: 22 }}>
              <p className="cat-head"><span className="chip" style={{ background: cat.bg, color: cat.fg, fontSize: 12, padding: '3px 10px' }}>{t.week}주</span> {t.label}</p>
              {rows.filter(r => r.s.week === t.week).map((r, i) => (
                <div key={r.s.key} className="qcard" style={{ padding: '12px 16px', marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 260px 120px', gap: 12, alignItems: 'center' }}>
                    <span className="meta">{t.week}-{i + 1}</span>
                    <div>
                      <b>{r.s.label}</b>
                      <p className="meta" style={{ margin: '2px 0 0' }}>{r.s.question}</p>
                    </div>
                    {r.s.type === 'choice' ? (
                      <select className="field" style={{ padding: '8px 10px', fontSize: 14, boxShadow: 'none', border: '2px solid var(--line)' }} disabled={r.locked || !!busy}
                        value={r.raw} onChange={e => { setInput(x => ({ ...x, [r.s.key]: e.target.value })); setFinds(f => { const n = { ...f }; delete n[r.s.key]; return n }) }}>
                        <option value="">고르기</option>
                        {r.s.options!.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="field" style={{ padding: '8px 10px', fontSize: 14, boxShadow: 'none', border: '2px solid var(--line)' }} disabled={r.locked || !!busy}
                        value={r.raw} placeholder={r.s.find}
                        onChange={e => { setInput(x => ({ ...x, [r.s.key]: e.target.value })); setFinds(f => { const n = { ...f }; delete n[r.s.key]; return n }) }} />
                    )}
                    <span className="meta" style={{ fontSize: 12 }}>
                      {r.locked ? '묻는 중 🔒'
                        : r.v && !r.v.ok ? <span style={{ color: 'var(--escalate)' }}>{r.v.error}</span>
                        : r.waiting ? <span style={{ color: 'var(--talk)' }}>원문 확인 필요</span>
                        : r.changed ? <span style={{ color: 'var(--agree)' }}>{r.cur ? '바뀜' : '새로'} · {showPlanned(r.s.type, r.s.unit, (r.v as { value: string }).value)}</span>
                        : r.cur ? `저장됨 v${r.cur.version}` : '비어 있음'}
                    </span>
                  </div>
                  {r.fromWord && (
                    <div className="will" style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ flex: 1, fontSize: 13 }}>
                        <span className="meta">원문</span> “{finds[r.s.key].quote ?? '—'}”
                        {finds[r.s.key].problem && <b style={{ color: 'var(--escalate)', marginLeft: 6 }}>{finds[r.s.key].problem}</b>}
                      </span>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!ok[r.s.key]} disabled={!finds[r.s.key].quoteInDoc}
                          onChange={e => setOk(o => ({ ...o, [r.s.key]: e.target.checked }))} /> 원문과 맞음
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}

        <div className="editor" style={{ marginTop: 26, maxWidth: 620 }}>
          <p className="editor-title">6주 사이클</p>
          {active ? (
            <p style={{ margin: '6px 0 0' }}>진행 중 · {brief!.cycle!.week}주차. <Link to="/p/cycle">사이클 보기 →</Link></p>
          ) : (
            <>
              <p className="meta" style={{ margin: '4px 0 10px' }}>시작한 날부터 매주 테마 하나씩, 5문항이 두 분 폰에 열립니다 (주택 → 출산/육아 → 노후 → 보험 → 부채 → 투자).</p>
              <div className="role-row">
                <button type="button" className={`role ${period === 3 ? 'role-on' : ''}`} style={{ padding: '10px', fontSize: 14 }} onClick={() => setPeriod(3)}>분기마다 (3개월)</button>
                <button type="button" className={`role ${period === 6 ? 'role-on' : ''}`} style={{ padding: '10px', fontSize: 14 }} onClick={() => setPeriod(6)}>반기마다 (6개월)</button>
              </div>
              <div className="actions">
                <button className="btn btn-small" disabled={!!busy || savedCount < SLOTS.length || toSave.length > 0} onClick={() => void startCycle()}>
                  {busy === 'start' ? '시작하는 중…' : '사이클 시작'}
                </button>
                {savedCount < SLOTS.length && <span className="meta">{SLOTS.length - savedCount}칸을 더 채워 저장하면 시작할 수 있습니다</span>}
                {savedCount === SLOTS.length && toSave.length > 0 && <span className="meta">바꾼 칸을 먼저 저장하세요</span>}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

