/** 🔴 큐. 1주차엔 모양만. 2주차에 judgments where verdict='red' and resolved_at is null */
export default function Queue() {
  return (
    <main className="planner">
      <h1>설계사 · 처리 대기</h1>
      <p className="muted">🔴 판정만 여기 옵니다. 🟢🟡는 오지 않습니다.</p>
      <div className="card">
        <span className="pill red">전제 폐기</span> <b>승진·이직 계획</b> · 김현우·박지우
        <p className="muted">남편: 저 내년에 이직해요 / 아내: 남편 이직 준비 중이에요</p>
        <p><b>AI 요약</b> · 부부는 일치. 설계 전제(승진 없음)가 낡음. 소득 상한 여유 900만원 → 이직 시 신혼부부 구입자금 자격 상실 가능.</p>
        <button className="ghost" style={{ width: 'auto' }}>카드 수정하러 가기 →</button>
      </div>
    </main>
  )
}
