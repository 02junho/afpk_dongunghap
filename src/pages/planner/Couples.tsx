import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Rail from './Rail'
import { DEMO_COUPLE, usePlanner, type CoupleRow } from './planner'
import { inviteMessage } from '../../lib/install'
import QrView from './QrView'

/** 클립보드 복사. https·localhost 가 아니거나 권한이 없으면 숨은 textarea 로 한 번 더 시도 */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* 아래로 */ }
  try {
    const t = document.createElement('textarea')
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  } catch { return false }
}

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
  const [startEmpty, setStartEmpty] = useState(true)
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
    if (needPass) { setErr('설계사 코드를 먼저 넣어야 실제로 발급됩니다 (왼쪽 레일).'); return }
    if (!p.live) {
      const code = String(100000 + Math.floor(Math.random() * 900000))
      setRows(r => [...r, { id: `demo-${Date.now()}`, label, code, husband: form.husband || '남편', wife: form.wife || '아내', state: startEmpty ? '질문 카드 준비 중' : '첫 맞춰보기 시작 전', lastAt: null, pending: 0 }])
      setIssued({ label, code, husband: form.husband.trim() || '남편', wife: form.wife.trim() || '아내' }); setForm({ label: '', husband: '', wife: '' })
      return
    }
    setBusy(true)
    try {
      const { code } = await p.call<{ coupleId: string; code: string }>('new_couple', { label, husband: form.husband, wife: form.wife, cloneDemoCards: !startEmpty })
      setIssued({ label, code, husband: form.husband.trim() || '남편', wife: form.wife.trim() || '아내' }); setForm({ label: '', husband: '', wife: '' })
      await load()
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
            <p className="meta">목록에서 지운 부부입니다. 답변·판정·카드 기록은 그대로 보관돼 있고, 되돌리면 담당 부부 목록에 다시 나타납니다. 두 분은 같은 코드로 다시 입장하면 됩니다.</p>
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
        <p className="meta">부부를 고르면 처리 대기·질문 카드·변경 이력이 그 부부 기준으로 열립니다. 입장 코드를 발급하면 두 분이 각자 휴대폰에서 바로 시작할 수 있습니다.</p>
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
                <dt className="meta">이름</dt><dd>{r.husband} · {r.wife} <span className="meta">(부부 화면·안내문에 쓰임)</span></dd>
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
                <button className="btn btn-quiet btn-small" onClick={() => open(r, '/p/cards')}>질문 카드</button>
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
                  두 분 폰에서도 더 이상 열리지 않고, 진행 중인 맞춰보기는 닫힙니다.
                  답변·판정·카드 기록은 지우지 않고 보관해서, 왼쪽 메뉴 "지운 부부 보기"에서 되돌릴 수 있습니다.
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
                    <label className="label" htmlFor={`el-${r.id}`}>표시 이름 (설계사 화면에만 · 비우면 "남편 · 아내")</label>
                    <input id={`el-${r.id}`} className="field" style={fieldStyle} value={edit.label} maxLength={40} onChange={e => setEdit({ ...edit, label: e.target.value })} />
                    <p className="note">남편·아내 이름은 두 분 휴대폰 화면과 안내문에 그대로 나갑니다. 이미 입장한 폰은 다음에 앱을 열 때 바뀝니다.</p>
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
          <label className="label" htmlFor="h">남편 이름</label>
          <input id="h" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} value={form.husband} onChange={e => setForm(f => ({ ...f, husband: e.target.value }))} placeholder="예: 현우" />
          <label className="label" htmlFor="w">아내 이름</label>
          <input id="w" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} value={form.wife} onChange={e => setForm(f => ({ ...f, wife: e.target.value }))} placeholder="예: 지우" />
          <label className="label" htmlFor="l">표시 이름 (설계사 화면에만 · 비우면 "남편 · 아내")</label>
          <input id="l" className="field" style={{ boxShadow: 'none', border: '2px solid var(--line)' }} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="예: 김현우 · 박지우" />
          <p className="label">질문 카드</p>
          <div className="role-row">
            <button type="button" className={`role ${startEmpty ? 'role-on' : ''}`} style={{ padding: '12px 10px', fontSize: 14 }} onClick={() => setStartEmpty(true)}>빈 카드로 시작</button>
            <button type="button" className={`role ${!startEmpty ? 'role-on' : ''}`} style={{ padding: '12px 10px', fontSize: 14 }} onClick={() => setStartEmpty(false)}>연습용 카드 10장으로 시작</button>
          </div>
          <p className="will">
            {needPass
              ? '⚠ 지금은 예시 모드입니다. 왼쪽 레일에 설계사 코드를 넣어야 실제로 발급됩니다.'
              : startEmpty
                ? '카드 없이 시작합니다. 발급한 뒤 질문 카드 화면에서 "카드 추가"나 "재무제표 엑셀로 만들기"로 넣으세요. 이렇게 시작한 부부는 아직 맞춰보기를 열 수 없습니다 (카드를 골라 여는 기능은 준비 중).'
                : '연습용 질문 카드 10장이 들어가고 첫 맞춰보기(3문항)가 바로 열립니다.'}
          </p>
          <div className="actions">
            <button className="btn btn-small" disabled={busy || needPass || !(form.label.trim() || form.husband.trim() || form.wife.trim())} onClick={create}>
              {busy ? '발급 중…' : '새 부부 등록하고 코드 발급'}
            </button>
          </div>
          {issued && (
            <div style={{ marginTop: 18 }}>
              <p className="meta">{issued.label}</p>
              <p style={{ fontSize: 32, letterSpacing: '0.2em', fontWeight: 700, margin: '4px 0' }}>{issued.code}</p>
              <p className="note">이 코드를 두 분께 알려주세요. 링크로 보내면 코드가 채워진 채 열립니다: <b>{joinUrl(issued.code)}</b></p>
              <div className="actions" style={{ marginTop: 10 }}>
                {copyBtn(issued.code, issued, 'link')}
                {copyBtn(issued.code, issued, 'msg')}
              </div>
              <p className="note">안내문에는 두 분 이름("{[issued.husband, issued.wife].join(' · ')} 님"), 링크, 홈 화면에 추가하는 방법, 입장 코드가 들어 있습니다. 카톡에 그대로 붙여 넣으세요.</p>
            </div>
          )}
        </div>
        {qr && <QrView url={joinUrl(qr.code)} code={qr.code} title={qr.title} onClose={() => setQr(null)} />}
        </>)}
      </main>
    </div>
  )
}
