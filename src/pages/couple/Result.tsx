import { useState } from 'react'
import { BASELINE, byKey, DEMO_ANSWERS, DEMO_JUDGMENTS, VERDICT_CLASS, VERDICT_TEXT, RED_TEXT } from '../../data/demo'

export default function Result() {
  const cards = BASELINE.map(byKey)
  const [disputed, setDisputed] = useState<string[]>([])

  const agreed = cards.filter(c => DEMO_JUDGMENTS[c.key].verdict === 'green').length
  const KO = ['', '한', '두', '세', '네', '다섯']

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark">돈궁합</h1>
        <p className="meta">0회차 결과</p>
      </div>
      <div className="phone-body">
        <h2 className="q">{KO[cards.length]} 가지 중 {KO[agreed]} 가지는<br />두 분 생각이 같았어요</h2>
        <p className="note">나머지는 설계사에게 전달됐습니다. 다음 상담 때 같이 보실 거예요.</p>

        <div style={{ marginTop: 38 }}>
          {cards.map(c => {
            const j = DEMO_JUDGMENTS[c.key]
            const a = DEMO_ANSWERS[c.key]
            const isDisputed = disputed.includes(c.key)
            return (
              <div className="result-item" key={c.key}>
                <div className={`verdict ${isDisputed ? 'verdict-agree' : VERDICT_CLASS[j.verdict]}`}>
                  <p className="verdict-label">{isDisputed ? '같은 뜻으로 정리했어요' : VERDICT_TEXT[j.verdict]}</p>
                  <p className="result-head">{c.label}</p>
                  <dl className="pair">
                    <dt>현우</dt><dd>{a.husband}</dd>
                    <dt>지우</dt><dd>{a.wife}</dd>
                  </dl>
                  {j.verdict === 'red' && !isDisputed && (
                    <p className="consequence">
                      {RED_TEXT[j.redKind!]}<br />{c.stake}
                    </p>
                  )}
                </div>
                {j.method === 'llm' && !isDisputed && (
                  <button className="btn btn-quiet btn-small" style={{ marginTop: 12, marginLeft: 19 }}
                    onClick={() => setDisputed([...disputed, c.key])}>
                    이건 같은 뜻이에요
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
