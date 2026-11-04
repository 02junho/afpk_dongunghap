import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { byKey, CATEGORIES, showValue } from '../../data/demo'
import type { Card } from '../../judge/index'
import { loadActiveCardRows, submitNotice } from '../../lib/db'
import { loadMe, nameOf, partnerRole } from '../../lib/session'
import ChangeInput, { changeValue, EMPTY_CHANGE, type ChangeState } from './ChangeInput'

/**
 * "바뀐 게 있어요" (11.04, docs/16 — 팀장님 질문 "고객이 엑셀을 고치게 할 수 있나"의 대안).
 * 고객은 계획을 고치지 않는다 — 바뀐 사정을 **알릴** 뿐이다. 계획은 설계사가 엑셀에서 다시 설계하고 반영한다.
 *   · 맞춰보기를 기다리지 않고 [내 설계]의 카드에서 바로 알린다
 *   · 설계사 처리 대기로만 간다. 배우자에게는 보이지 않는다 (10.14 팀 결정과 같다)
 *   · 판정하지 않는다 — 한 사람만 말한 것이라 셋을 비교할 수 없다. AI 도 쓰지 않는다
 */
export default function Change() {
  const { key = '' } = useParams()
  const nav = useNavigate()
  const me = loadMe()
  const him = me.role !== 'wife'
  const [row, setRow] = useState<{ versionId: string; card: Card } | null | 'loading'>(() => {
    if (me.live) return 'loading'
    const c = byKey(key)
    return c ? { versionId: key, card: c } : null
  })
  const [change, setChange] = useState<ChangeState>(EMPTY_CHANGE)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!me.live || !me.coupleId) return
    loadActiveCardRows(me.coupleId).then(rs => setRow(rs.find(r => r.card.key === key) ?? null)).catch(e => { setErr((e as Error).message); setRow(null) })
  }, [me.live, me.coupleId, key])

  const top = (
    <div className="phone-top">
      <button className="btn btn-quiet btn-small" onClick={() => nav('/c/home')}>← 내 설계</button>
      <span className={`avatar ${him ? 'avatar-him' : 'avatar-her'}`}>{nameOf(me, me.role).slice(0, 1)}</span>
    </div>
  )
  if (row === 'loading') return <main className="phone">{top}<div className="phone-body"><p className="note">불러오는 중…</p></div></main>
  if (!row) return <main className="phone">{top}<div className="phone-body"><p className="note">{err || '이 계획을 찾지 못했어요.'}</p></div></main>

  const { card, versionId } = row
  const cat = CATEGORIES[card.category]
  const v = changeValue(card, change)
  const ready = v.value.trim().length > 0 && !v.preview.startsWith('단위') && !busy

  async function send() {
    if (!me.live) { setSent(true); return }   // 예시 화면 — 저장하지 않는다
    setBusy(true); setErr('')
    try { await submitNotice(me.coupleId!, me.memberId!, versionId, v.value.trim(), v.isCondition); setSent(true) }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  if (sent) return (
    <main className="phone">
      {top}
      <div className="phone-body">
        <div className="done-mark"><span className="pair-mark lg"><span className="p p-him" /><span className="p p-her" /></span></div>
        <h2 className="q" style={{ textAlign: 'center' }}>설계사님께<br />전달됐어요</h2>
        <p className="note" style={{ textAlign: 'center' }}>
          설계사님이 확인하고 연락드릴 거예요.
        </p>
      </div>
      <button className="btn btn-wide" onClick={() => nav('/c/home')}>내 설계 보러 가기</button>
    </main>
  )

  return (
    <main className="phone">
      {top}
      <div className="phone-body">
        <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
        <div className="bubble" style={{ marginTop: 14 }}>
          <p className="meta">설계사님과 정한 계획</p>
          <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{card.label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>{showValue(card)}</p>
        </div>
        <h2 className="q" style={{ marginTop: 22 }}>바뀐 게 있으면<br />알려 주세요</h2>
        <ChangeInput card={card} state={change} onChange={setChange} />
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        <p className="note">보내면 고칠 수 없어요. {nameOf(me, partnerRole(me.role))}님에게는 보이지 않아요.</p>
      </div>
      <button className="btn btn-wide" disabled={!ready} onClick={() => void send()}>{busy ? '보내는 중…' : '설계사님께 알리기'}</button>
    </main>
  )
}
