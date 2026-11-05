import { useEffect, useState } from 'react'
import { copyText } from '../../lib/copy'
import { useNavigate } from 'react-router-dom'
import Rail from './Rail'
import { DEMO_COUPLE, usePlanner, type CoupleRow } from './planner'
import { inviteMessage } from '../../lib/install'
import QrView from './QrView'
import { setPendingWord } from './pendingImport'
import { namesFromFilename } from '../../extract/names'


const DEMO_ROWS: CoupleRow[] = [
  DEMO_COUPLE,
  { id: 'demo-2', label: '정도윤 · 한서현', code: '730254', husband: '도윤', wife: '서현', state: '정기 3회차', lastAt: null, pending: 0 },
  { id: 'demo-3', label: '오재민 · 류하경', code: '619478', husband: '재민', wife: '하경', state: '첫 맞춰보기 대기', lastAt: null, pending: 0 },
  { id: 'demo-4', label: '배준서 · 문예린', code: '305126', husband: '준서', wife: '예린', state: '정기 7회차', lastAt: null, pending: 1 },
]

/**
 * 설계사 콘솔 첫 화면. 설계사 1명 : 커플 N쌍 — 여기서 고른 커플이 나머지 화면의 컨텍스트다.
 * 입장 코드 발급이 "설계사 경유 설치"의 시작점. live 면 DB(couples/members), 아니면 데모 4쌍.
 */
/** archivedView: 왼쪽 메뉴 "지운 부부 보기" — 지운(보관한) 부부만 모아 되돌리기 (10.27) */
export default function Couples({ archivedView = false }: { archivedView?: boolean }) {
  const nav = useNavigate()
  const p = usePlanner()
  const [rows, setRows] = useState<CoupleRow[]>(DEMO_ROWS)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ label: '', husband: '', wife: '' })
  // 10.25: 새 부부는 빈 카드로 시작할 수 있다 — 연습용 카드와 엑셀로 만든 카드가 두 벌 되지 않게
  // 재무설계 결과 Word (11.04 새 방향) — 등록하면 그 부부의 질문 틀 화면에서 AI 가 계획 값을 찾는다
  const [word, setWord] = useState<File | null>(null)
  const [importNote, setImportNote] = useState('')
  function chooseWord(f: File | undefined) {
    if (!f) return
    setWord(f)
    const n = namesFromFilename(f.name)
    if (n) { setForm(x => ({ ...x, husband: n.husband, wife: n.wife })); setImportNote(`파일 이름에서 남편 "${n.husband}", 아내 "${n.wife}"를 채웠습니다.`) }
    else if (!form.husband && !form.wife) setImportNote('파일 이름이 "남편이름_아내이름_재무설계.docx" 모양이 아니라 이름을 채우지 못했습니다. 아래에 직접 적어 주세요.')
  }
  const [issued, setIssued] = useState<{ label: string; code: string; husband: string; wife: string } | null>(null)
  // 이름 고치기: 한 번에 한 부부만 펼친다
  const [edit, setEdit] = useState<{ id: string; label: string; husband: string; wife: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<{ code: string; title: string } | null>(null)
  // 부부 지우기(보관, 10.27): 한 번 더 확인 → 목록·입장에서 빠짐. 기록은 남아 되돌릴 수 있다
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [copied, setCopied] = useState('')  // '<code>:link' | '<code>:msg'

  async function load() {
    if (!p.live || !p.pass) { setRows(DEMO_ROWS); return }
    try {
      const items = (await p.call<{ items: CoupleRow[] }>('couples')).items
      setRows(items); setErr('')
      // 이 노트북이 기억하는 '보는 중' 부부의 이름이 DB 와 다르면(이름 고치기·데이터 정리 뒤) 최신으로
      const cur = items.find(r => r.id === p.couple.id)
      if (cur && (cur.label !== p.couple.label || cur.husband !== p.couple.husband || cur.wife !== p.couple.wife)) p.setCouple(cur)
    }
    catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { void load() }, [p.live, p.pass])

  function open(c: CoupleRow, to: string) { p.setCouple(c); nav(to) }

  const needPass = p.live && !p.pass

  async function create() {
    const label = form.label.trim() || [form.husband.trim(), form.wife.trim()].filter(Boolean).join(' · ')
    if (!label) return
    if (needPass) { setErr('왼쪽에 설계사 코드를 넣어야 발급됩니다.'); return }
    if (!p.live) {
      const code = String(100000 + Math.floor(Math.random() * 900000))
      setRows(r => [...r, { id: `demo-${Date.now()}`, label, code, husband: form.husband || '남편', wife: form.wife || '아내', state: '질문 틀 0 / 30', lastAt: null, pending: 0 }])
      setIssued({ label, code, husband: form.husband.trim() || '남편', wife: form.wife.trim() || '아내' }); setForm({ label: '', husband: '', wife: '' })
      return
    }
    setBusy(true)
    try {
      const { code, coupleId } = await p.call<{ coupleId: string; code: string }>('new_couple', { label, husband: form.husband, wife: form.wife })
      const husband = form.husband.trim() || '남편', wife = form.wife.trim() || '아내'
      setIssued({ label, code, husband, wife }); setForm({ label: '', husband: '', wife: '' })
      // 등록하자마자 그 부부의 질문 틀 화면으로 — Word 를 골랐으면 바로 계획 값을 찾는다
      setPendingWord(word); setWord(null); setImportNote(''); setBusy(false)
      p.setCouple({ id: coupleId, label, code, husband, wife, state: '질문 틀 0 / 30', lastAt: null, pending: 0 })
      nav('/p/template')
      return
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const joinUrl = (code: string) => `${location.origin}/c/join?code=${code}`
  /** 안내문은 부부가 받는 글 — 설계사용 표시 이름이 아니라 남편·아내 이름으로 인사한다 */
  async function copy(code: string, n: { husband: string; wife: string }, what: 'link' | 'msg') {
    const ok = await copyText(what === 'link' ? joinUrl(code) : inviteMessage({ ...n, code, url: joinUrl(code) }))
    setCopied(ok ? `${code}:${what}` : '')
    if (!ok) setErr('복사하지 못했습니다. 링크를 직접 길게 눌러 복사해 주세요.')
    else setTimeout(() => setCopied(c => (c === `${code}:${what}` ? '' : c)), 2000)
  }
  const copyBtn = (code: string, n: { husband: string; wife: string }, what: 'link' | 'msg') => (
    <button className="btn btn-quiet btn-small" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
      title={what === 'msg' ? '링크 + 홈 화면 추가 방법 + 입장 코드가 든 카톡용 안내문' : undefined}
      onClick={() => void copy(code, n, what)}>
      {copied === `${code}:${what}` ? '복사됨 ✓' : what === 'link' ? '링크 복사' : '안내문 복사'}
    </button>
  )

  async function saveName() {
    if (!edit) return
    const husband = edit.husband.trim(), wife = edit.wife.trim()
    if (!husband || !wife) { setErr('남편·아내 이름을 모두 넣어 주세요.'); return }
    const label = edit.label.trim() || `${husband} · ${wife}`
    if (p.live && p.pass) {
      setBusy(true)
      try { await p.call('rename_couple', { coupleId: edit.id, husband, wife, label }) }
      catch (e) { setErr((e as Error).message); setBusy(false); return }
      setBusy(false)
    }
    setRows(rs => rs.map(r => (r.id === edit.id ? { ...r, label, husband, wife } : r)))
    // 지금 보고 있는 부부면 레일·다른 화면 제목도 바로 바뀌게
    if (p.couple.id === edit.id) p.setCouple({ ...p.couple, label, husband, wife })
    setErr(''); setEdit(null)
    if (p.live && p.pass) await load()
  }
  const fieldStyle = { boxShadow: 'none', border: '2px solid var(--line)' } as const

  async function setArchived(r: CoupleRow, archive: boolean) {
    if (p.live && p.pass) {
      setBusy(true)
      try { await p.call(archive ? 'archive_couple' : 'restore_couple', { coupleId: r.id }) }
      catch (e) { setErr((e as Error).message); setBusy(false); return }
      setBusy(false)
    }
    const at = archive ? new Date().toISOString() : null
    setRows(rs => rs.map(x => (x.id === r.id ? { ...x, archivedAt: at } : x)))
    // 지금 보고 있던 부부를 지우면 남은 첫 부부로 옮긴다
    if (archive && p.couple.id === r.id) {
      const next = rows.find(x => x.id !== r.id && !x.archivedAt)
      if (next) p.setCouple(next)
    }
    setConfirmDel(null); setErr('')
    if (p.live && p.pass) await load()
  }
  const visible = rows.filter(r => !r.archivedAt)
  const archived = rows.filter(r => r.archivedAt)

  return (
    <div className="console">
      <Rail />
      <main className="work">
        {archivedView ? (
          <>
            <h1 className="work-title">지운 부부</h1>
            {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
            <div style={{ marginTop: 22 }}>
              {archived.map(r => (
                <div key={r.id} className="qcard">
                  <div className="queue-top">
                    <span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.label}</span>
                    <span className="queue-couple">지운 날 {new Date(r.archivedAt!).toLocaleDateString('ko-KR')}</span>
                  </div>
                  <dl className="pair" style={{ gridTemplateColumns: '80px 1fr' }}>
                    <dt className="meta">이름</dt><dd>{r.husband} · {r.wife}</dd>
                    <dt className="meta">진행</dt><dd>{r.state}</dd>
                    <dt className="meta">입장 코드</dt><dd><span style={{ letterSpacing: '0.12em', fontWeight: 700 }}>{r.code}</span> <span className="meta">(지금은 입장 불가)</span></dd>
                  </dl>
                  <div className="actions">
                    <button className="btn btn-small" disabled={busy} onClick={() => void setArchived(r, false)}>{busy ? '되돌리는 중…' : '되돌리기'}</button>
                  </div>
                </div>
              ))}
              {!archived.length && <p className="note">지운 부부가 없습니다.</p>}
            </div>
          </>
        ) : (<>
        <h1 className="work-title">담당 부부</h1>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}

        <div style={{ marginTop: 22 }}>
          {visible.map(r => (
            <div className="qcard" key={r.id} style={r.id === p.couple.id ? { outline: '2px solid var(--ink)' } : undefined}>
              <div className="queue-top">
                <span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>
                <button onClick={() => open(r, '/p/queue')} style={{ font: 'inherit', fontSize: 15, fontWeight: 700, color: 'var(--ink)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>{r.label}</button>
                {r.pending > 0 && <span className="chip chip-escalate">처리 대기 {r.pending}</span>}
                {r.id === p.couple.id && <span className="chip chip-agree">보는 중</span>}
                <span className="queue-couple">{r.lastAt ? `마지막 판정 ${new Date(r.lastAt).toLocaleDateString('ko-KR')}` : '아직 판정 없음'}</span>
              </div>
              <dl className="pair" style={{ gridTemplateColumns: '80px 1fr' }}>
                <dt className="meta">이름</dt><dd>{r.husband} · {r.wife}</dd>
                <dt className="meta">진행</dt><dd>{r.state}</dd>
                <dt className="meta">입장 코드</dt>
                <dd>
                  <span style={{ letterSpacing: '0.12em', fontWeight: 700 }}>{r.code}</span>
                  <span className="meta" style={{ marginLeft: 12 }}>{joinUrl(r.code)}</span>
                  {copyBtn(r.code, r, 'link')}
                  {copyBtn(r.code, r, 'msg')}
                  <button className="btn btn-quiet btn-small" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => setQr({ code: r.code, title: r.label })}>QR</button>
                </dd>
              </dl>
              <div className="actions">
                <button className="btn btn-small" onClick={() => open(r, '/p/queue')}>처리 대기</button>
                <button className="btn btn-quiet btn-small" onClick={() => open(r, '/p/template')}>질문 틀</button>
                <button className="btn btn-quiet btn-small" onClick={() => open(r, '/p/history')}>변경 이력</button>
                <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }}
                  onClick={() => setEdit(edit?.id === r.id ? null : { id: r.id, label: r.label, husband: r.husband, wife: r.wife })}>
                  {edit?.id === r.id ? '닫기' : '이름 고치기'}
                </button>
                <button className="btn btn-quiet btn-small" style={{ color: 'var(--escalate)' }} onClick={() => setConfirmDel(confirmDel === r.id ? null : r.id)}>지우기</button>
              </div>
              {confirmDel === r.id && (
                <div className="will" role="alertdialog" aria-label={`${r.label} 지우기 확인`} style={{ borderLeft: '4px solid var(--escalate)' }}>
                  <b>{r.label}</b> 부부를 목록에서 지울까요?<br />
                  두 분 폰에서도 열리지 않습니다. 기록은 보관되고 "지운 부부 보기"에서 되돌릴 수 있습니다.
                  <div className="actions" style={{ marginTop: 10 }}>
                    <button className="btn btn-small" style={{ background: 'var(--escalate)' }} disabled={busy} onClick={() => void setArchived(r, true)}>{busy ? '지우는 중…' : '지우기'}</button>
                    <button className="btn btn-quiet btn-small" onClick={() => setConfirmDel(null)}>취소</button>
                  </div>
                </div>
              )}
              {edit?.id === r.id && (
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', maxWidth: 560 }}>
                  <div>
                    <label className="label" htmlFor={`eh-${r.id}`}>남편 이름</label>
                    <input id={`eh-${r.id}`} className="field" style={fieldStyle} value={edit.husband} maxLength={20} onChange={e => setEdit({ ...edit, husband: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`ew-${r.id}`}>아내 이름</label>
                    <input id={`ew-${r.id}`} className="field" style={fieldStyle} value={edit.wife} maxLength={20} onChange={e => setEdit({ ...edit, wife: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="label" htmlFor={`el-${r.id}`}>표시 이름 (선택)</label>
                    <input id={`el-${r.id}`} className="field" style={fieldStyle} value={edit.label} maxLength={40} onChange={e => setEdit({ ...edit, label: e.target.value })} />
                    <div className="actions">
                      <button className="btn btn-small" disabled={busy || !edit.husband.trim() || !edit.wife.trim()} onClick={() => void saveName()}>{busy ? '저장 중…' : '저장'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <h2 className="work-title" style={{ fontSize: 18, marginTop: 32 }}>새 부부</h2>
        <div className="editor" style={{ maxWidth: 560 }}>
          <p className="label">재무설계 결과 Word (선택)</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <label className={`btn btn-quiet btn-small${busy ? ' btn-off' : ''}`} htmlFor="imp-word" style={{ cursor: 'pointer' }}>파일 선택</label>
            <input id="imp-word" type="file" accept=".docx" hidden disabled={busy} onChange={e => chooseWord(e.target.files?.[0])} />
            <span className="meta">{word ? word.name : '선택된 파일 없음'}</span>
          </div>
          <p className="was">파일 이름이 "남편이름_아내이름_재무설계.docx"면 이름이 채워집니다.</p>
          {importNote && <p className="note" style={{ color: importNote.startsWith('파일 이름에서') ? 'var(--agree)' : 'var(--talk)' }}>{importNote}</p>}
          <label className="label" htmlFor="h">남편 이름</label>
          <input id="h" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} value={form.husband} onChange={e => setForm(f => ({ ...f, husband: e.target.value }))} placeholder="예: 현우" />
          <label className="label" htmlFor="w">아내 이름</label>
          <input id="w" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} value={form.wife} onChange={e => setForm(f => ({ ...f, wife: e.target.value }))} placeholder="예: 지우" />
          <label className="label" htmlFor="l">표시 이름 (선택)</label>
          <input id="l" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="예: 김현우 · 박지우" />
          {needPass && <p className="will">⚠ 예시 모드입니다. 왼쪽에 설계사 코드를 넣어야 발급됩니다.</p>}
          <div className="actions">
            <button className="btn btn-small" disabled={busy || needPass || !(form.label.trim() || form.husband.trim() || form.wife.trim())} onClick={create}>
              {busy ? '발급 중…' : '새 부부 등록하고 질문 틀 채우기'}
            </button>
          </div>
          {issued && (
            <div style={{ marginTop: 18 }}>
              <p className="meta">{issued.label}</p>
              <p style={{ fontSize: 32, letterSpacing: '0.2em', fontWeight: 700, margin: '4px 0' }}>{issued.code}</p>
              <p className="note">{joinUrl(issued.code)}</p>
              <div className="actions" style={{ marginTop: 10 }}>
                {copyBtn(issued.code, issued, 'link')}
                {copyBtn(issued.code, issued, 'msg')}
              </div>
            </div>
          )}
        </div>
        {qr && <QrView url={joinUrl(qr.code)} code={qr.code} title={qr.title} onClose={() => setQr(null)} />}
        </>)}
      </main>
    </div>
  )
}
