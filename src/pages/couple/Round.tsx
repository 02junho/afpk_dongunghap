import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BASELINE, byKey, CATEGORIES, answerKey, judgmentKey, showValue, type RoundAnswers } from '../../data/demo'
import type { Card, Judgment } from '../../judge/index'
import { requestJudgment, triggerJudge } from '../../lib/api'
import { loadMyNextRound, myAnswered, submitAnswer } from '../../lib/db'
import { loadMe, nameOf, partnerRole } from '../../lib/session'
import AnswerPick, { EMPTY_PICK, pickValue, type PickState } from './AnswerPick'

/**
 * 10.23 팀 결정(Q4·Q6·Q9): 빈 질문 대신 **기존 설계를 보여주고 "지금도 그렇게 생각하시나요?"** 로 묻는다.
 *   · "네, 그대로예요" → 답은 설계 전제 값 그대로 저장 (판정은 기존 규칙 그대로 🟢)
 *   · "아니요, 바뀌었어요" → 다른 답 후보에서 고른다 (11.05 객관식, AnswerPick). 맞는 게 없으면 기타 — 직접 적기
 *   한 분이라도 계획과 다르면 🔴 → 설계사 처리 대기 (11.05: 부부 불일치를 따로 나누지 않는다).
 *   (전제를 보여주면 "그대로"로 답하기 쉬워진다 — 팀이 고른 방식이다. 바뀐 경우를 놓치지 않게 버튼을 같은 크기로 둔다)
 * 기타 답은 값만 적었으면 규칙이, 아니면 AI 가 계획과 같은 뜻인지 본다 (가안). 추측하지 않는다 — 애매하면 설계사 확인.
 *
 * live: 라운드와 카드를 DB 에서 읽고, 답은 answers 에 한 장씩 넣는다. 제출 뒤엔 상대 진행만 본다.
 * 데모: sessionStorage. 한 폰에서 남편→아내 순서로.
 * 부부는 판정을 보지 않는다 (10.14). 제출 → 대기/전달 화면으로 끝.
 */
export default function Round() {
  const { id: urlId = 'baseline' } = useParams()
  // 실제로 답하는 라운드 — 주소의 id 가 아니라 "내가 답할 게 남은 것" (지난주 질문이 먼저, 11.04)
  const [roundId, setRoundId] = useState(urlId)
  const id = roundId
  const nav = useNavigate()
  const me = loadMe()
  const him = me.role !== 'wife'
  const [cards, setCards] = useState<{ versionId: string; card: Card }[]>(
    me.live ? [] : BASELINE.map(k => ({ versionId: k, card: byKey(k) })),
  )
  const [loading, setLoading] = useState(me.live)
  const [err, setErr] = useState('')
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<PickState>(EMPTY_PICK)
  const [busy, setBusy] = useState(false)
  const [stance, setStance] = useState<'same' | 'changed' | null>(null)

  useEffect(() => {
    if (!me.live || !me.coupleId || !me.memberId) return
    ;(async () => {
      try {
        // 내가 답할 게 남은 질문 — 지난주 것부터 (11.04). 다 답했으면 배우자를 기다리는 화면으로
        const { round: r, waitingId } = await loadMyNextRound(me.coupleId!, me.memberId!)
        if (!r) { nav(waitingId ? `/c/wait/${waitingId}` : '/c/home'); return }
        const done = await myAnswered(r.id, me.memberId!)
        setRoundId(r.id)
        setCards(r.cards.filter(c => !done.has(c.versionId)))
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [me.live, me.coupleId, me.memberId])

  if (loading) return <main className="phone"><div className="phone-body"><p className="note">불러오는 중…</p></div></main>
  if (err) return <main className="phone"><div className="phone-body"><p className="note" style={{ color: 'var(--escalate)' }}>{err}</p></div></main>
  if (!cards.length) return null

  const { versionId, card } = cards[i]
  const cat = CATEGORIES[card.category]
  const total = me.live ? cards.length : BASELINE.length
  const step = me.live ? i + 1 : i + 1

  // "그대로예요"면 설계 전제 값을 그대로 답으로 남긴다 — 판정 규칙이 그대로 🟢 로 읽는다
  const value = stance === 'same' ? String(card.plannedValue) : stance === 'changed' ? pickValue(pick) : ''
  const isCondition = false
  const ready = value.trim().length > 0 && !busy

  function reset() {
    setPick(EMPTY_PICK); setStance(null)
  }

  async function submit() {
    if (me.live) {
      setBusy(true)
      try {
        await submitAnswer(id, versionId, me.memberId!, value, isCondition)
      } catch (e) {
        setErr((e as Error).message)
        setBusy(false)
        return
      }
      setBusy(false)
      reset()
      if (i + 1 < cards.length) return setI(i + 1)
      // 마지막 답. 양쪽이 다 끝났으면 서버가 판정한다 (아니면 pending). 결과는 이 폰에 오지 않는다.
      void triggerJudge(id)
      nav(`/c/wait/${id}`)
      return
    }

    // 1주차 데모: sessionStorage
    const prev = JSON.parse(sessionStorage.getItem(answerKey(id)) ?? '{}') as RoundAnswers
    prev[card.key] = { ...prev[card.key], [me.role]: { text: value, isCondition } }
    sessionStorage.setItem(answerKey(id), JSON.stringify(prev))
    reset()
    if (i + 1 < cards.length) return setI(i + 1)
    const complete = cards.every(c => prev[c.card.key]?.husband && prev[c.card.key]?.wife)
    if (complete) void judgeAllLocal(id, cards.map(c => c.card), prev)
    nav(complete ? `/c/done/${id}` : `/c/wait/${id}`)
  }

  return (
    <main className="phone">
      <div className="phone-top">
        <p className="meta">{step} / {total}</p>
        <span className={`avatar ${him ? 'avatar-him' : 'avatar-her'}`}>{nameOf(me, me.role).slice(0, 1)}</span>
      </div>
      <div className="phone-body">
        <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
        <div className="bubble" style={{ marginTop: 14 }}>
          <p className="meta">설계사님과 정한 계획</p>
          <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{card.label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>{showValue(card)}</p>
        </div>
        <h2 className="q" style={{ marginTop: 22 }}>지금도 그렇게<br />생각하시나요?</h2>

        <div className="role-row" style={{ marginTop: 18 }}>
          <button className={`role ${stance === 'same' ? 'role-on' : ''}`} onClick={() => setStance('same')}>네, 그대로예요</button>
          <button className={`role ${stance === 'changed' ? 'role-on' : ''}`} onClick={() => setStance('changed')}>아니요, 바뀌었어요</button>
        </div>

        {stance === 'changed' && <AnswerPick card={card} state={pick} onChange={setPick} />}

        <p className="note">제출하면 고칠 수 없어요. {nameOf(me, partnerRole(me.role))}님에게는 보이지 않아요.</p>
      </div>
      <button className="btn btn-wide" disabled={!ready} onClick={submit}>{busy ? '보내는 중…' : '제출'}</button>
    </main>
  )
}

/** 1주차 데모 전용: 한 기기에서 양쪽 답이 모이면 브라우저가 판정해 설계사 콘솔이 읽는 자리에 둔다 */
async function judgeAllLocal(id: string, cards: Card[], answers: RoundAnswers) {
  const out: Record<string, Judgment> = {}
  for (const c of cards) {
    const a = answers[c.key]!
    out[c.key] = await requestJudgment(c, a.husband!.text, a.wife!.text)
  }
  sessionStorage.setItem(judgmentKey(id), JSON.stringify(out))
}
