import { useNavigate } from 'react-router-dom'

export default function Home() {
  const nav = useNavigate()
  const me = JSON.parse(sessionStorage.getItem('me') ?? '{"role":"husband"}')
  const name = me.role === 'wife' ? '지우' : '현우'

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark">돈궁합</h1>
        <p className="meta">{name}</p>
      </div>
      <div className="phone-body">
        <h2 className="q">설계안에 깔린 전제<br />열 가지 중 세 가지를<br />먼저 맞춰볼게요</h2>

        <div className="home-block">
          <p className="meta">0회차 · 합의 확인</p>
          <p className="big" style={{ margin: '8px 0 0' }}>3<span style={{ fontSize: 20 }}>문항</span></p>
          <p className="note">
            두 분이 따로 답하고, 둘 다 끝나면 함께 열립니다.
            설계가 맞는지 보는 게 아니라, 두 분이 같게 알고 계신지 보는 자리예요.
          </p>
        </div>

        <div className="home-block">
          <p className="meta">걸리는 시간</p>
          <p className="note" style={{ marginTop: 4 }}>약 3분</p>
        </div>
      </div>
      <button className="btn btn-wide" onClick={() => nav('/c/round/baseline')}>시작하기</button>
    </main>
  )
}
