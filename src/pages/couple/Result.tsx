import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import seed from '../../data/seed-cards.json'
import type { Card, Judgment, RedKind } from '../../judge/index'
import { requestJudgment } from '../../lib/api'
import { answerKey, type DraftAnswer } from './Round'

const LABEL: Record<Judgment['verdict'], string> = {
  green: '두 분 생각이 같습니다',
  yellow: '조금 다르게 보고 계세요',
  red: '전제가 다릅니다',
}
const KIND: Record<RedKind, string> = {
  couple_conflict: '설계사에게 전달되었습니다',
  plan_stale: '두 분은 같은 생각 — 설계안이 현실을 못 따라왔습니다. 설계사에게 전달되었습니다',
  repeated_yellow: '같은 전제가 두 번 연속 어긋났습니다. 설계사에게 전달되었습니다',
}

export default function Result() {
  const { id = 'baseline' } = useParams()
  const answers = JSON.parse(sessionStorage.getItem(answerKey(id)) ?? '{}') as
    Record<string, { husband: DraftAnswer; wife: DraftAnswer }>
  const cards = (seed as Card[]).filter(c => answers[c.key])
  const [js, setJs] = useState<Record<string, Judgment>>({})
  const [disputed, setDisputed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    cards.forEach(async c => {
      const j = await requestJudgment(c, answers[c.key].husband.text, answers[c.key].wife.text)
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
            <p className="muted">
              남편: {answers[c.key].husband.text}<br />
              아내: {answers[c.key].wife.text}
            </p>
            {j?.verdict === 'red' && (
              <p><b>{KIND[j.redKind ?? 'couple_conflict']}</b><br /><span className="muted">{c.stake}</span></p>
            )}
            {j?.verdict === 'yellow' && (
              <p className="muted">
                {j.needsReview
                  ? j.reason
                  : `오늘 저녁에 이 얘기 한 번만 해보세요: "${c.question}"`}
              </p>
            )}
            {/*
              이의 제기는 LLM 판정에만 달아두면 안 된다. 결정적 판정도 오탐이 난다
              (금액 파싱, 허용 범위 경계). 결정적 오탐은 파서 테스트 케이스가 되고,
              LLM 오탐은 golden set 행이 된다 — 둘 다 부록 3번의 원료다.
            */}
            {j && j.verdict !== 'green' && (
              disputed[c.key]
                ? <p className="muted">기록했습니다. 설계사가 함께 봅니다.</p>
                : <button className="ghost" onClick={() => setDisputed(p => ({ ...p, [c.key]: true }))}>
                    이건 같은 뜻이에요
                  </button>
            )}
            {!j && <p className="muted">판정 중…</p>}
          </div>
        )
      })}
    </main>
  )
}
