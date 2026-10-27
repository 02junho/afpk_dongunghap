import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CARDS, CATEGORIES, CATEGORY_ORDER, showValue } from '../../data/demo'
import { loadActiveCards, loadLastCheckAt, loadNames, loadOpenRound } from '../../lib/db'
import { CHECK_MONTHS, formatKDate, nextCheckDate } from '../../lib/cycle'
import { clearMe, loadMe, nameOf, saveMe } from '../../lib/session'
import InstallGuide from './InstallGuide'
import type { Card } from '../../judge/index'

/** 탭 두 개 — [내 설계] 평소에 보는 화면 / [맞춰보기] 점검 질문. 예슬 제안 반영. */
export default function Home() {
  const nav = useNavigate()
  const [me, setMe] = useState(loadMe)
  const him = me.role !== 'wife'
  const [tab, setTab] = useState<'plan' | 'match'>('match')
  const [cards, setCards] = useState<Card[]>(CARDS)
  // live: 열린 라운드가 있을 때만 '맞춰보기'가 켜진다. 없으면 설계사가 열어줄 때까지 기다린다
  const [lastCheck, setLastCheck] = useState<string | null>(null)
  // [내 설계] 카테고리 접기·펼치기 (10.23 Q13). 처음엔 모두 접혀 있다 — 누른 것만 펼친다
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})
  const [round, setRound] = useState<{ id: string; kind: string; count: number } | null | 'loading'>(me.live ? 'loading' : { id: 'baseline', kind: 'baseline', count: 3 })

  useEffect(() => {
    if (!me.live || !me.coupleId) return
    // DB 순서는 임의다 → 카테고리 순(주거→소득→…)으로 정렬해 시드와 같은 모양으로
    loadActiveCards(me.coupleId)
      .then(cs => setCards([...cs].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.key.localeCompare(b.key))))
      .catch(() => {})
    loadOpenRound(me.coupleId).then(r => setRound(r ? { id: r.id, kind: r.kind, count: r.cards.length } : null)).catch(() => setRound(null))
    loadLastCheckAt(me.coupleId).then(setLastCheck).catch(() => {})
    // 설계사가 이름을 고쳤으면 이 폰에도 반영 (입장할 때 저장한 이름은 그때 값이다)
    loadNames(me.coupleId).then(n => {
      // 두 분 이름이 하나도 안 읽히면 설계사가 이 부부를 지웠거나(보관) 연결이 풀린 것 — 입장 화면으로 (10.27)
      if (!n.husband && !n.wife) { clearMe(); nav('/c/join?removed=1', { replace: true }); return }
      if (n.husband === me.names.husband && n.wife === me.names.wife) return
      const next = { ...me, names: { ...me.names, ...n } }
      saveMe(next); setMe(next)
    }).catch(() => {})
  }, [me.live, me.coupleId])

  // 라운드 종류별 문구. factcheck = 설계사가 전제 하나를 바꾸려 해 두 분께 먼저 묻는 것 (docs/03)
  const isFactcheck = round !== null && round !== 'loading' && round.kind === 'factcheck'
  // regular = 설계사가 카드를 추가하고 "바로 묻기"로 연 정기 맞춰보기
  const isRegular = round !== null && round !== 'loading' && (round.kind === 'regular' || round.kind === 'event')

  const canStart = round !== null && round !== 'loading'
  const next = nextCheckDate(lastCheck)
  const groups = CATEGORY_ORDER.map(k => ({ k, cards: cards.filter(c => c.category === k) })).filter(g => g.cards.length)
  const isOpen = (k: string) => openCats[k] ?? false

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <span className={`avatar ${him ? 'avatar-him' : 'avatar-her'}`}>{nameOf(me, me.role).slice(0, 1)}</span>
      </div>
      <div className="phone-body">
        {/* 브라우저로 입장한 경우에만 — 홈 화면 앱으로 열었으면 안 보인다 */}
        {me.live && <InstallGuide code={me.code} compact />}
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
            {/* 카테고리를 누르면 펼쳐진다. 카드는 전부 보인다 (예전엔 5장만) */}
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
                      <div><p className="k">{c.label}</p><p className="v">{showValue(c)}</p></div>
                    </div>
                  ))}
                </div>
              )
            })}
            <p className="note">설계사님과 정한 계획이에요. 설계사님이 설계를 수정하면 알려드릴게요.</p>
          </>
        ) : (
          <>
            {/* 10.23 Q10: 질문이 열렸으면 "이제부터 시작할게요", 없으면 다음 정기 맞춰보기 날짜 */}
            {isFactcheck
              ? <h2 className="q">설계사님이 전제 하나를<br />바꾸려고 해요<br />두 분께 먼저 여쭤볼게요</h2>
              : canStart
                ? <h2 className="q">이제부터 시작할게요</h2>
                : round === 'loading' ? <h2 className="q">&nbsp;</h2>
                : next
                  ? <h2 className="q">다음 맞춰보기는<br />{formatKDate(next)}쯤이에요</h2>
                  : <h2 className="q">설계사님이 곧<br />열어드릴 거예요</h2>}
            <div className="bubble" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {round === 'loading' ? '불러오는 중…'
                      : round ? (isFactcheck ? `먼저 묻기 · ${round.count}문항` : isRegular ? `정기 맞춰보기 · ${round.count}문항` : `첫 맞춰보기 · ${round.count}문항`)
                      : '지금은 열린 맞춰보기가 없어요'}
                  </p>
                  <p className="meta">
                    {round && round !== 'loading'
                      ? (isFactcheck ? '1분이면 돼요 · 두 분 다 답해야 바뀌어요' : `약 ${Math.max(1, round.count)}분 · 따로 답하고, 설계사님만 봐요`)
                      : `${CHECK_MONTHS}개월마다 여쭤봐요 · 열리면 여기 빨간 점이 켜져요`}
                  </p>
                </div>
              </div>
            </div>
            <p className="note">
              {isFactcheck
                ? '설계사님이 고친 값이 맞는지 확인하는 거예요. 두 분이 같게 답하면 [내 설계]에 반영돼요.'
                : '설계사님과 정한 계획이 지금도 맞는지, 두 분께 따로 여쭤봐요.'}
            </p>
          </>
        )}
        <p className="meta" style={{ textAlign: 'center', fontSize: 11, marginTop: 24, opacity: 0.6 }}>버전 {__BUILD_ID__}</p>
      </div>
      {tab === 'match' && canStart && (
        <button className="btn btn-wide" onClick={() => nav(`/c/round/${(round as { id: string }).id}`)}>시작하기</button>
      )}
      {/* 역할을 잘못 골랐거나, 폰을 바꾸거나, 시연에서 한 폰으로 남편·아내를 번갈아 보여줄 때.
          코드는 채워진 채로 입장 화면이 열린다 — 역할만 다시 고르면 된다 */}
      {me.live && (
        <button className="btn btn-wide btn-quiet" style={{ marginTop: 10 }}
          onClick={() => { clearMe(); nav(me.code ? `/c/join?code=${me.code}` : '/c/join') }}>
          다시 입장하기
        </button>
      )}
    </main>
  )
}
