import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Rail from './Rail'
import { DEMO_COUPLE, usePlanner, type CoupleRow } from './planner'
import { inviteMessage } from '../../lib/install'

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
  { id: 'demo-3', label: '오재민 · 류하경', code: '619478', husband: '재민', wife: '하경', state: '설계 직후 · 0회차 대기', lastAt: null, pending: 0 },
  { id: 'demo-4', label: '배준서 · 문예린', code: '305126', husband: '준서', wife: '예린', state: '정기 7회차', lastAt: null, pending: 1 },
]

/**
 * 설계사 콘솔 첫 화면. 설계사 1명 : 커플 N쌍 — 여기서 고른 커플이 나머지 화면의 컨텍스트다.
 * 입장 코드 발급이 "설계사 경유 설치"의 시작점. live 면 DB(couples/members), 아니면 데모 4쌍.
 */
export default function Couples() {
  const nav = useNavigate()
  const p = usePlanner()
  const [rows, setRows] = useState<CoupleRow[]>(DEMO_ROWS)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ label: '', husband: '', wife: '' })
  const [issued, setIssued] = useState<{ label: string; code: string; husband: string; wife: string } | null>(null)
  // 이름 고치기: 한 번에 한 부부만 펼친다
  const [edit, setEdit] = useState<{ id: string; label: string; husband: string; wife: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')  // '<code>:link' | '<code>:msg'

  async function load() {
    if (!p.live || !p.pass) { setRows(DEMO_ROWS); return }
    try { setRows((await p.call<{ items: CoupleRow[] }>('couples')).items); setErr('') }
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
      setRows(r => [...r, { id: `demo-${Date.now()}`, label, code, husband: form.husband || '남편', wife: form.wife || '아내', state: '설계 직후 · 0회차 대기', lastAt: null, pending: 0 }])
      setIssued({ label, code, husband: form.husband.trim() || '남편', wife: form.wife.trim() || '아내' }); setForm({ label: '', husband: '', wife: '' })
      return
    }
    setBusy(true)
    try {
      const { code } = await p.call<{ coupleId: string; code: string }>('new_couple', { label, husband: form.husband, wife: form.wife })
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

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">담당 부부</h1>
        <p className="meta">부부를 고르면 처리 대기·가정 카드·변경 이력이 그 부부 기준으로 열립니다. 입장 코드를 발급하면 두 분이 각자 휴대폰에서 바로 시작할 수 있습니다.</p>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}

        <div style={{ marginTop: 22 }}>
          {rows.map(r => (
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
                </dd>
              </dl>
              <div className="actions">
                <button className="btn btn-small" onClick={() => open(r, '/p/queue')}>처리 대기</button>
                <button className="btn btn-quiet btn-small" onClick={() => open(r, '/p/cards')}>가정 카드</button>
                <button className="btn btn-quiet btn-small" onClick={() => open(r, '/p/history')}>변경 이력</button>
                <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }}
                  onClick={() => setEdit(edit?.id === r.id ? null : { id: r.id, label: r.label, husband: r.husband, wife: r.wife })}>
                  {edit?.id === r.id ? '닫기' : '이름 고치기'}
                </button>
              </div>
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
          <p className="will">
            {needPass
              ? '⚠ 지금은 예시 모드입니다. 왼쪽 레일에 설계사 코드를 넣어야 실제로 발급됩니다.'
              : '발급하면 기본 가정 카드 10장(데모 세트)이 v1으로 들어가고 0회차가 열립니다. 설계안 문서에서 카드를 뽑는 건 공모전 후.'}
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
      </main>
    </div>
  )
}
