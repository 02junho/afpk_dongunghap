import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { loadActiveCards, loadOpenRound } from '../../lib/db'
import { clearMe, loadMe, nameOf } from '../../lib/session'
import type { Card } from '../../judge/index'

/** 탭 두 개 — [내 설계] 평소에 보는 화면 / [맞춰보기] 점검 질문. 예슬 제안 반영. */
export default function Home() {
  const nav = useNavigate()
  const me = loadMe()
  const him = me.role !== 'wife'
  const [tab, setTab] = useState<'plan' | 'match'>('match')
  const [cards, setCards] = useState<Card[]>(CARDS)
  // live: 열린 라운드가 있을 때만 '맞춰보기'가 켜진다. 없으면 설계사가 열어줄 때까지 기다린다
  const [round, setRound] = useState<{ id: string; kind: string; count: number } | null | 'loading'>(me.live ? 'loading' : { id: 'baseline', kind: 'baseline', count: 3 })

  useEffect(() => {
    if (!me.live || !me.coupleId) return
    // DB 순서는 임의다 → 카테고리 순(주거→소득→…)으로 정렬해 시드와 같은 모양으로
    loadActiveCards(me.coupleId)
      .then(cs => setCards([...cs].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.key.localeCompare(b.key))))
      .catch(() => {})
    loadOpenRound(me.coupleId).then(r => setRound(r ? { id: r.id, kind: r.kind, count: r.cards.length } : null)).catch(() => setRound(null))
  }, [me.live, me.coupleId])

  // 라운드 종류별 문구. factcheck = 설계사가 전제 하나를 바꾸려 해 두 분께 먼저 묻는 것 (docs/03)
  const isFactcheck = round !== null && round !== 'loading' && round.kind === 'factcheck'
  // regular = 설계사가 카드를 추가하고 "바로 묻기"로 연 정기 맞춰보기
  const isRegular = round !== null && round !== 'loading' && (round.kind === 'regular' || round.kind === 'event')

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
            {/* 진행 막대는 데모 부부(김현우·박지우)의 고정 예시다. 실제 부부에겐 그 부부의 숫자가 없으니 보이지 않는다
                (E2E 10.18: 모든 부부에게 "2.5억 중 1.4억"이 똑같이 떴다). 숫자를 넣으려면 엔진 계산이 필요하다. */}
            {!me.live && (
              <div className="bubble" style={{ marginBottom: 14 }}>
                <p className="meta">2029년 내 집까지</p>
                <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>자기자금 2.5억 중 <span style={{ color: 'var(--him)' }}>1.4억</span></p>
                <div className="progress"><div style={{ width: '56%' }} /></div>
              </div>
            )}
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
            {isFactcheck
              ? <h2 className="q">설계사님이 전제 하나를<br />바꾸려고 해요<br />두 분께 먼저 여쭤볼게요</h2>
              : isRegular
                ? <h2 className="q">설계사님이<br />두 분께 따로<br />여쭤볼 게 있어요</h2>
                : <h2 className="q">설계사님이 두 분 말씀을<br />같게 들었는지<br />세 가지만 맞춰볼게요</h2>}
            <div className="bubble" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {round === 'loading' ? '불러오는 중…'
                      : round ? (isFactcheck ? `먼저 묻기 · ${round.count}문항` : isRegular ? `정기 · ${round.count}문항` : `0회차 · ${round.count}문항`)
                      : '지금은 열린 맞춰보기가 없어요'}
                  </p>
                  <p className="meta">
                    {round && round !== 'loading'
                      ? (isFactcheck ? '1분이면 돼요 · 두 분 다 답해야 바뀌어요' : isRegular ? '1분이면 돼요 · 따로 답하고, 설계사님만 봐요' : '약 3분 · 따로 답하고, 설계사님만 봐요')
                      : '설계사님이 열어주시면 여기 빨간 점이 켜져요'}
                  </p>
                </div>
              </div>
            </div>
            <p className="note">
              {isFactcheck
                ? '설계사님이 고친 값이 맞는지 확인하는 거예요. 두 분이 같게 답하면 [내 설계]에 반영돼요.'
                : '설계가 맞는지 보는 게 아니에요. 두 분이 같게 알고 계신지 보는 거예요.'}
            </p>
          </>
        )}
        <p className="meta" style={{ textAlign: 'center', fontSize: 11, marginTop: 24, opacity: 0.6 }}>
          버전 {__BUILD_ID__}
          {me.live && (
            <>
              {' · '}
              {/* 역할을 잘못 골랐거나 폰을 넘겨줄 때. 로그아웃 메뉴가 아니라 조용한 링크로 둔다 */}
              <button onClick={() => { clearMe(); nav('/c/join') }}
                style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer' }}>
                다시 입장하기
              </button>
            </>
          )}
        </p>
      </div>
      {tab === 'match' && canStart && (
        <button className="btn btn-wide" onClick={() => nav(`/c/round/${(round as { id: string }).id}`)}>시작하기</button>
      )}
    </main>
  )
}
