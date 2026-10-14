import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Join() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [role, setRole] = useState<'husband' | 'wife' | null>(null)

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
      </div>
      <div className="phone-body">
        <h2 className="q">설계사님께 받은<br />입장 코드를 넣어주세요</h2>
        <p className="note">상담 때 안내받은 여섯 자리예요.</p>
        <input className="field code-field" style={{ marginTop: 24 }} inputMode="numeric" maxLength={6} placeholder="······"
          aria-label="입장 코드 여섯 자리" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
        <p className="meta" style={{ margin: '28px 0 10px' }}>어느 분이세요?</p>
        <div className="role-row">
          <button className={`role ${role === 'husband' ? 'role-on' : ''}`} onClick={() => setRole('husband')}>
            <span className="avatar avatar-him">현</span>남편
          </button>
          <button className={`role ${role === 'wife' ? 'role-on' : ''}`} onClick={() => setRole('wife')}>
            <span className="avatar avatar-her">지</span>아내
          </button>
        </div>
        <p className="note" style={{ marginTop: 24 }}>두 분의 답변은 설계사님만 봅니다. 서로에게는 보이지 않아요.</p>
      </div>
      <button className="btn btn-wide" disabled={code.length !== 6 || !role}
        onClick={() => { sessionStorage.setItem('me', JSON.stringify({ code, role })); nav('/c/home') }}>시작하기</button>
    </main>
  )
}
