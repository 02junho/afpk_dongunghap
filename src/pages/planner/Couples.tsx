import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addCouple, listCouples, selectCouple, type DemoCouple } from './demo'

/**
 * 설계사 콘솔의 첫 화면. 설계사 1명 : 커플 N쌍 이므로 커플 선택이 모든 화면의 컨텍스트다.
 * 커플 발급(코드 6자리)도 여기서 한다 — "설계사 경유 설치"의 시작점.
 * UI에서 '관리자'라는 말은 쓰지 않는다 (docs/00).
 */
export default function Couples() {
  const nav = useNavigate()
  const [couples, setCouples] = useState<DemoCouple[]>(listCouples())
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<DemoCouple | null>(null)

  function create() {
    const c = addCouple(label.trim())
    setCouples(listCouples())
    setIssued(c)
    setLabel('')
  }

  function open(c: DemoCouple, to: string) {
    selectCouple(c.id)
    nav(to)
  }

  return (
    <main className="planner">
      <h1>설계사 콘솔 · 담당 커플</h1>
      <p className="muted">커플을 고르면 아래 화면들이 그 커플의 컨텍스트로 열립니다.</p>

      {couples.map(c => (
        <div className="card" key={c.id}>
          <b>{c.label || '(이름 미입력)'}</b> <span className="muted">코드 {c.inviteCode}</span>
          <p className="muted">카드 {c.cardCount}장 · 처리 대기 {c.openRed}건</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost" style={{ width: 'auto', marginTop: 0 }} onClick={() => open(c, '/p/queue')}>처리 대기 →</button>
            <button className="ghost" style={{ width: 'auto', marginTop: 0 }} onClick={() => open(c, '/p/cards')}>카드 →</button>
            <button className="ghost" style={{ width: 'auto', marginTop: 0 }} onClick={() => open(c, '/p/history')}>변경 이력 →</button>
          </div>
        </div>
      ))}

      <h2>새 커플</h2>
      <div className="card">
        <label className="muted">두 분 이름</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="예: 김현우·박지우" />
        <button disabled={!label.trim()} onClick={create}>커플 코드 발급</button>
        {issued && (
          <>
            <p style={{ fontSize: 28, letterSpacing: 4, margin: '16px 0 4px' }}><b>{issued.inviteCode}</b></p>
            <p className="muted">
              이 코드를 두 분께 알려주세요. 각자 폰에서 <b>{location.origin}/c/join</b> 을 열고 코드를 입력하면,
              홈 화면에 추가 안내가 이어집니다. (iOS는 공유 → 홈 화면에 추가)
            </p>
          </>
        )}
      </div>

      <p className="muted"><Link to="/c/join">부부 화면 미리보기 →</Link></p>
    </main>
  )
}
