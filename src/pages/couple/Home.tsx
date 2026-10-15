import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CARDS, CATEGORIES, showValue } from '../../data/demo'
import { loadActiveCards, loadOpenRound } from '../../lib/db'
import { loadMe, nameOf } from '../../lib/session'
import type { Card } from '../../judge/index'

/** 탭 두 개 — [내 설계] 평소에 보는 화면 / [맞춰보기] 점검 질문. 예슬 제안 반영. */
export default function Home() {
  const nav = useNavigate()
  const me = loadMe()
  const him = me.role !== 'wife'
  const [tab, setTab] = useState<'plan' | 'match'>('match')
  const [cards, setCards] = useState<Card[]>(CARDS)
  // live: 열린 라운드가 있을 때만 '맞춰보기'가 켜진다. 없으면 설계사가 열어줄 때까지 기다린다
  const [round, setRound] = useState<{ id: string; count: number } | null | 'loading'>(me.live ? 'loading' : { id: 'baseline', count: 3 })

  useEffect(() => {
    if (!me.live || !me.coupleId) return
    loadActiveCards(me.coupleId).then(setCards).catch(() => {})
    loadOpenRound(me.coupleId).then(r => setRound(r ? { id: r.id, count: r.cards.length } : null)).catch(() => setRound(null))
  }, [me.live, me.coupleId])

  const canStart = round !== null && round !== 'loading'

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <span className={`avatar ${him ? 'avatar-him' : 'avatar-her'}`}>{nameOf(me, me.role).slice(0, 1)}</span>
      </div>
      <div className="phone-body">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'plan' ? 'tab-on' : ''}`} onClick={() => setTab('plan')}>내 설계</button>
          <button role="tab" className={`tab ${tab === 'match' ? 'tab-on' : ''}`} onClick={() => setTab('match')}>맞춰보기{canStart && <span className="dot-alert" />}</button>
        </div>

        {tab === 'plan' ? (
          <>
            <div className="bubble" style={{ marginBottom: 14 }}>
              <p className="meta">2029년 내 집까지</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>자기자금 2.5억 중 <span style={{ color: 'var(--him)' }}>1.4억</span></p>
              <div className="progress"><div style={{ width: '56%' }} /></div>
            </div>
            {cards.slice(0, 5).map(c => {
              const cat = CATEGORIES[c.category]
              return (
                <div className="plan-card" key={c.key}>
                  <span className="cat" style={{ background: cat.bg, color: cat.fg }}>{cat.short}</span>
                  <div><p className="k">{c.label}</p><p className="v">{showValue(c)}</p></div>
                </div>
              )
            })}
            <p className="note">설계사님이 잡아준 전제예요. 바뀌면 여기서 먼저 알려드려요.</p>
          </>
        ) : (
          <>
            <h2 className="q">설계사님이 두 분 말씀을<br />같게 들었는지<br />세 가지만 맞춰볼게요</h2>
            <div className="bubble" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {round === 'loading' ? '불러오는 중…' : round ? `0회차 · ${round.count}문항` : '지금은 열린 맞춰보기가 없어요'}
                  </p>
                  <p className="meta">{round && round !== 'loading' ? '약 3분 · 따로 답하고, 설계사님만 봐요' : '설계사님이 열어주시면 여기 빨간 점이 켜져요'}</p>
                </div>
              </div>
            </div>
            <p className="note">설계가 맞는지 보는 게 아니에요. 두 분이 같게 알고 계신지 보는 거예요.</p>
          </>
        )}
      </div>
      {tab === 'match' && canStart && (
        <button className="btn btn-wide" onClick={() => nav(`/c/round/${(round as { id: string }).id}`)}>시작하기</button>
      )}
    </main>
  )
}
