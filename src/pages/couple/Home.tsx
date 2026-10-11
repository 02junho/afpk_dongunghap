import { Link } from 'react-router-dom'

export default function Home() {
  const me = JSON.parse(sessionStorage.getItem('me') ?? '{}')
  return (
    <main className="couple">
      <h1>안녕하세요, {me.role === 'wife' ? '지우' : '현우'}님</h1>
      <p className="muted">설계사가 설정한 전제 10개 중 <b>3개</b>를 먼저 확인합니다</p>
      <div className="card">
        <b>0회차 · 합의 확인</b>
        <p className="muted">서로의 답은 둘 다 제출한 뒤에만 보입니다. 약 3분.</p>
        <Link to="/c/round/baseline"><button>시작하기</button></Link>
      </div>
      <p className="muted" style={{ marginTop: 32 }}>합의율 · 진척률은 2주차에</p>
    </main>
  )
}
