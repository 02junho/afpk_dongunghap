import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { THEMES, themeOfWeek } from '../../data/template'
import { loadActiveCardRows, loadMyNextRound, loadNames, myAccessToken, tickCycle } from '../../lib/db'
import { clearMe, loadMe, nameOf, saveMe } from '../../lib/session'
import InstallGuide from './InstallGuide'
import { canPush, pushBlocked, pushOn, turnOnPush } from '../../lib/push'
import type { Card } from '../../judge/index'

/**
 * 탭 두 개 — [내 설계] 재무설계 결과(6테마) / [맞춰보기] 이번 주 질문 (11.04 새 방향, docs/21).
 * 매주 테마 하나씩 5문항이 열린다. 지난주에 못 다 한 질문이 있으면 그것부터.
 * 판정 · 상대의 답은 여기 나오지 않는다 — 앱은 듣고, 설계사가 말한다.
 */
type RoundBrief = { id: string; kind: string; week: number | null; count: number; category: Card['category'] }

export default function Home() {
  const nav = useNavigate()
  const [me, setMe] = useState(loadMe)
  const him = me.role !== 'wife'
  const [tab, setTab] = useState<'plan' | 'match'>('match')
  const [cards, setCards] = useState<Card[]>(CARDS)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})
  // 내가 답할 질문 / 배우자를 기다리는 질문 / 열린 질문 수
  const [round, setRound] = useState<RoundBrief | null | 'loading'>(me.live ? 'loading' : { id: 'baseline', kind: 'baseline', week: 1, count: 5, category: 'housing' })
  const [waitingId, setWaitingId] = useState<string | null>(null)
  const [openCount, setOpenCount] = useState(me.live ? 0 : 1)
  // 폰 알림 (11.04): 질문이 오면 알림. 아직 안 켰으면 버튼 하나 — 누른 자리에서만 허락을 묻는다
  const [push, setPush] = useState<'unknown' | 'off' | 'on' | 'busy'>('unknown')
  const [pushErr, setPushErr] = useState('')
  useEffect(() => { if (me.live && canPush() && !pushBlocked()) void pushOn('member').then(on => setPush(on ? 'on' : 'off')) }, [me.live])
  async function enablePush() {
    setPush('busy'); setPushErr('')
    try { await turnOnPush('member', { accessToken: (await myAccessToken()) ?? '' }); setPush('on') }
    catch (e) { setPushErr((e as Error).message); setPush('off') }
  }

  useEffect(() => {
    if (!me.live || !me.coupleId) return
    loadActiveCardRows(me.coupleId)
      .then(rs => setCards(rs.map(r => r.card).sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.key.localeCompare(b.key))))
      .catch(() => {})
    // 이번 주 질문이 열릴 때가 됐나 먼저 서버에 물어본 뒤 (6주 사이클), 내가 답할 질문을 찾는다
    ;(async () => {
      await tickCycle()
      try {
        const r = await loadMyNextRound(me.coupleId!, me.memberId!)
        setRound(r.round ? { id: r.round.id, kind: r.round.kind, week: r.round.week, count: r.round.cards.length, category: r.round.cards[0]?.card.category ?? 'housing' } : null)
        setWaitingId(r.waitingId); setOpenCount(r.openCount)
      } catch { setRound(null) }
    })()
    // 설계사가 이름을 고쳤으면 이 폰에도 반영
    loadNames(me.coupleId).then(n => {
      // 두 분 이름이 하나도 안 읽히면 설계사가 이 부부를 지웠거나(보관) 연결이 풀린 것 — 입장 화면으로 (10.27)
      if (!n.husband && !n.wife) { clearMe(); nav('/c/join?removed=1', { replace: true }); return }
      if (n.husband === me.names.husband && n.wife === me.names.wife) return
      const next = { ...me, names: { ...me.names, ...n } }
      saveMe(next); setMe(next)
    }).catch(() => {})
  }, [me.live, me.coupleId])

  const canStart = round !== null && round !== 'loading'
  const waiting = !canStart && round !== 'loading' && !!waitingId
  const theme = canStart ? (round.week ? themeOfWeek(round.week).label : CATEGORIES[round.category].label) : ''
  const carried = canStart && openCount > 1   // 지난주 질문이 아직 남아 있다
  const groups = THEMES.map(t => ({ k: t.category, cards: cards.filter(c => c.category === t.category) })).filter(g => g.cards.length)
  const isOpen = (k: string) => openCats[k] ?? false

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <span className={`avatar ${him ? 'avatar-him' : 'avatar-her'}`}>{nameOf(me, me.role).slice(0, 1)}</span>
      </div>
      <div className="phone-body">
        {me.live && <InstallGuide code={me.code} compact />}
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'plan' ? 'tab-on' : ''}`} onClick={() => setTab('plan')}>내 설계</button>
          <button role="tab" className={`tab ${tab === 'match' ? 'tab-on' : ''}`} onClick={() => setTab('match')}>맞춰보기{canStart && <span className="dot-alert" />}</button>
        </div>

        {tab === 'plan' ? (
          <>
            {/* 6테마. 누르면 펼쳐진다 — 설계사님과 정한 계획(재무설계 결과) */}
            {groups.map(({ k, cards: cs }) => {
              const cat = CATEGORIES[k]
              const open = isOpen(k)
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <button className="plan-card" aria-expanded={open} onClick={() => setOpenCats(o => ({ ...o, [k]: !open }))}
                    style={{ width: '100%', border: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', marginBottom: open ? 8 : 0 }}>
                    <span className="cat" style={{ background: cat.bg, color: cat.fg }}>{cat.short}</span>
                    <div style={{ flex: 1 }}><p className="v" style={{ margin: 0 }}>{cat.label}</p><p className="k" style={{ margin: 0 }}>{cs.length}개</p></div>
                    <span className="meta" style={{ fontSize: 18 }}>{open ? '−' : '+'}</span>
                  </button>
                  {open && cs.map(c => (
                    <div className="plan-card" key={c.key} style={{ marginLeft: 18 }}>
                      <div style={{ flex: 1 }}><p className="k">{c.label}</p><p className="v">{showValue(c)}</p></div>
                    </div>
                  ))}
                </div>
              )
            })}
            {!groups.length && <p className="note">설계사님이 계획을 정리하고 있어요.</p>}
          </>
        ) : (
          <>
            {canStart
              ? <h2 className="q">{carried ? <>지난주 질문이<br />남아 있어요</> : <>이번 주 질문이<br />열렸어요</>}</h2>
              : waiting ? <h2 className="q">답을 모두 보냈어요</h2>
              : round === 'loading' ? <h2 className="q">&nbsp;</h2>
              : <h2 className="q">다음 질문이 열리면<br />알려 드릴게요</h2>}
            <div className="bubble" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {round === 'loading' ? '불러오는 중…'
                      : canStart ? `${round.week ? `${round.week}주차 · ` : ''}${theme} · ${round.count}문항`
                      : waiting ? `${nameOf(me, me.role === 'wife' ? 'husband' : 'wife')}님 차례예요`
                      : '지금은 열린 질문이 없어요'}
                  </p>
                  {canStart && <p className="meta">약 {Math.max(1, round.count)}분</p>}
                </div>
              </div>
            </div>
          </>
        )}
        {tab === 'match' && (push === 'off' || push === 'busy') ? (
          <div className="bubble" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ margin: 0, flex: 1, fontWeight: 700 }}>질문이 오면 알림 받기</p>
            <button className="btn btn-small" disabled={push === 'busy'} onClick={() => void enablePush()}>{push === 'busy' ? '켜는 중…' : '알림 켜기'}</button>
          </div>
        ) : null}
        {pushErr && <p className="note" style={{ color: 'var(--escalate)' }}>{pushErr}</p>}
        <p className="meta" style={{ textAlign: 'center', fontSize: 11, marginTop: 24, opacity: 0.6 }}>버전 {__BUILD_ID__}</p>
      </div>
      {tab === 'match' && canStart && (
        <button className="btn btn-wide" onClick={() => nav(`/c/round/${round.id}`)}>시작하기</button>
      )}
      {tab === 'match' && waiting && (
        <button className="btn btn-wide" onClick={() => nav(`/c/wait/${waitingId}`)}>진행 상황 보기</button>
      )}
      {/* 역할을 잘못 골랐거나, 폰을 바꾸거나, 시연에서 한 폰으로 남편·아내를 번갈아 보여줄 때 */}
      {me.live && (
        <button className="btn btn-wide btn-quiet" style={{ marginTop: 10 }}
          onClick={() => { clearMe(); nav(me.code ? `/c/join?code=${me.code}` : '/c/join') }}>
          다시 입장하기
        </button>
      )}
    </main>
  )
}
