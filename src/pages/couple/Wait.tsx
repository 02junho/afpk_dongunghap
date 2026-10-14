import { useNavigate, useParams } from 'react-router-dom'

export default function Wait() {
  const { id } = useParams()
  const nav = useNavigate()
  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <p className="meta">0회차</p>
      </div>
      <div className="phone-body">
        <div className="done-mark"><span className="pair-mark lg"><span className="p p-him" /><span className="p p-empty" style={{ marginLeft: -14 }} /></span></div>
        <h2 className="q" style={{ textAlign: 'center' }}>지우님이 아직<br />답하는 중이에요</h2>
        <p className="note" style={{ textAlign: 'center' }}>두 분 다 끝나면 설계사님께 함께 전달돼요.</p>
        <div style={{ marginTop: 32 }}>
          <div className="who-line"><span className="avatar avatar-him">현</span>현우<span className="who-state">3문항 완료</span></div>
          <div className="who-line"><span className="avatar avatar-her">지</span>지우<span className="who-state">1문항 남음</span></div>
        </div>
        <p className="note" style={{ marginTop: 28, textAlign: 'center' }}>알림을 켜두면 끝나는 대로 알려드려요.</p>
      </div>
      <button className="btn btn-wide btn-quiet" onClick={() => nav(`/c/done/${id}`)}>닫기</button>
    </main>
  )
}
