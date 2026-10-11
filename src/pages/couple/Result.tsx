import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import seed from '../../data/seed-cards.json'
import type { Card, Judgment } from '../../judge/index'
import { requestJudgment } from '../../lib/api'

const LABEL = { green: '두 분 생각이 같습니다', yellow: '조금 다르게 보고 계세요', red: '전제가 다릅니다' }
const KIND = { couple_conflict: '설계사에게 전달되었습니다', plan_stale: '두 분은 같은 생각 — 설계안이 현실을 못 따라왔습니다. 설계사에게 전달되었습니다' }

export default function Result() {
  const { id } = useParams()
  const answers = JSON.parse(sessionStorage.getItem(`round:${id}`) ?? '{}') as Record<string, { husband: string; wife: string }>
  const cards = (seed as Card[]).filter(c => answers[c.key])
  const [js, setJs] = useState<Record<string, Judgment>>({})

  useEffect(() => {
    cards.forEach(async c => {
      const j = await requestJudgment(c, answers[c.key].husband, answers[c.key].wife)
      setJs(prev => ({ ...prev, [c.key]: j }))
    })
  }, [id])

  return (
    <main className="couple">
      <h1>결과</h1>
      {cards.map(c => {
        const j = js[c.key]
        return (
          <div className="card" key={c.key}>
            <b>{c.label}</b> {j && <span className={`pill ${j.verdict}`}>{LABEL[j.verdict]}</span>}
            <p className="muted">남편: {answers[c.key].husband}<br />아내: {answers[c.key].wife}</p>
            {j?.verdict === 'red' && <p><b>{KIND[j.redKind!]}</b><br /><span className="muted">{c.stake}</span></p>}
            {j?.verdict === 'yellow' && <p className="muted">오늘 저녁에 이 얘기 한 번만 해보세요: "{c.question}"</p>}
            {j?.method === 'llm' && <button className="ghost" onClick={() => alert('disputes 테이블에 기록 (2주차)')}>이건 같은 뜻이에요</button>}
            {!j && <p className="muted">판정 중…</p>}
          </div>
        )
      })}
    </main>
  )
}
