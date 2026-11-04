import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { triggerJudge } from '../../lib/api'
import { loadRoundInfo, roundProgress } from '../../lib/db'
import { themeOfWeek } from '../../data/template'
import { loadMe, nameOf, partnerRole, type Role } from '../../lib/session'

/**
 * 블라인드의 핵심 장면. 상대의 **진행 상태만** 본다 — 답 내용은 round_progress() 가 개수만 준다.
 * live: 3초 폴링. 양쪽이 다 끝나면 서버 판정을 한 번 더 찔러 보고(멱등) 전달 완료로 넘어간다.
 * 데모: 고정 문구.
 */
export default function Wait() {
  const { id = 'baseline' } = useParams()
  const nav = useNavigate()
  const me = loadMe()
  const partner = partnerRole(me.role)
  const [total, setTotal] = useState(3)
  const [kind, setKind] = useState('baseline')
  const [week, setWeek] = useState<number | null>(me.live ? null : 1)
  const [done, setDone] = useState<Record<Role, number>>(me.live ? { husband: 0, wife: 0 } : { husband: 3, wife: 2 })
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!me.live || !me.coupleId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const [r, p] = await Promise.all([loadRoundInfo(id), roundProgress(id)])
        if (!alive) return
        const n = r ? r.count : total
        if (r) { setTotal(n); setKind(r.kind); setWeek(r.week) }
        setDone(p)
        if (p.husband >= n && p.wife >= n) {
          await triggerJudge(id) // 이미 판정됐으면 already, 아니면 지금 판정. 결과는 이 폰에 안 온다
          if (alive) nav(`/c/done/${id}`)
          return
        }
        if (!r || r.status !== 'open') { // 라운드가 닫혔다 = 판정 끝
          if (alive) nav(`/c/done/${id}`)
          return
        }
      } catch (e) {
        if (alive) setErr((e as Error).message)
      }
      if (alive) timer = setTimeout(tick, 3000)
    }
    void tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [id, me.live, me.coupleId])

  const mine = done[me.role], theirs = done[partner]
  const stateOf = (n: number) => (n >= total ? `${total}문항 완료` : n === 0 ? '아직 시작 전' : `${total - n}문항 남음`)

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <p className="meta">{week ? `${week}주차 · ${themeOfWeek(week).label}` : kind === 'factcheck' ? '확인 질문' : '맞춰보기'}</p>
      </div>
      <div className="phone-body">
        <div className="done-mark">
          <span className="pair-mark lg">
            {me.role === 'husband'
              ? <><span className="p p-him" /><span className="p p-empty" style={{ marginLeft: -14 }} /></>
              : <><span className="p p-empty" /><span className="p p-her" style={{ marginLeft: -14 }} /></>}
          </span>
        </div>
        <h2 className="q" style={{ textAlign: 'center' }}>{nameOf(me, partner)}님이 아직<br />답하는 중이에요</h2>
        <div style={{ marginTop: 32 }}>
          <div className="who-line"><span className="avatar avatar-him">{nameOf(me, 'husband').slice(0, 1)}</span>{nameOf(me, 'husband')}<span className="who-state">{stateOf(me.role === 'husband' ? mine : theirs)}</span></div>
          <div className="who-line"><span className="avatar avatar-her">{nameOf(me, 'wife').slice(0, 1)}</span>{nameOf(me, 'wife')}<span className="who-state">{stateOf(me.role === 'wife' ? mine : theirs)}</span></div>
        </div>
        {err && <p className="note" style={{ color: 'var(--escalate)', textAlign: 'center' }}>{err}</p>}
      </div>
      <button className="btn btn-wide btn-quiet" onClick={() => nav(me.live ? '/c/home' : `/c/done/${id}`)}>닫기</button>
    </main>
  )
}
