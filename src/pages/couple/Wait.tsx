import { useNavigate, useParams } from 'react-router-dom'

/** 블라인드의 핵심 장면. 2주차에 Realtime 구독으로 자동 전환. */
export default function Wait() {
  const { id } = useParams()
  const nav = useNavigate()
  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark">돈궁합</h1>
        <p className="meta">0회차</p>
      </div>
      <div className="phone-body">
        <h2 className="q">지우님이 아직<br />답하는 중이에요</h2>
        <p className="note">두 분 다 끝나면 결과가 함께 열립니다.</p>

        <div style={{ marginTop: 40 }}>
          <div className="who-line">
            <span className="dot dot-done" />
            현우
            <span className="who-state">3문항 완료</span>
          </div>
          <div className="who-line">
            <span className="dot" />
            지우
            <span className="who-state">1문항 남음</span>
          </div>
        </div>

        <p className="note" style={{ marginTop: 36 }}>
          알림을 켜두면 지우님이 끝내는 대로 알려드려요.
        </p>
      </div>
      <button className="btn btn-wide btn-quiet" onClick={() => nav(`/c/result/${id}`)}>결과 미리 보기 (시연용)</button>
    </main>
  )
}
