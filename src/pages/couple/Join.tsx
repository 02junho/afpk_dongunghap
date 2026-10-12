import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Join() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [role, setRole] = useState<'husband' | 'wife' | null>(null)

  function start() {
    sessionStorage.setItem('me', JSON.stringify({ code, role }))
    nav('/c/home')
  }

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark">돈궁합</h1>
      </div>
      <div className="phone-body stack">
        <div>
          <h2 className="q">설계사에게 받은<br />코드를 넣어주세요</h2>
          <p className="note">상담 때 안내받은 여섯 자리입니다.</p>
        </div>
        <input
          className="field code-field"
          inputMode="numeric"
          maxLength={6}
          placeholder="······"
          aria-label="커플 코드 여섯 자리"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <div>
          <p className="meta" style={{ marginBottom: 10 }}>어느 분이세요?</p>
          <div className="role-row">
            <button className={`role ${role === 'husband' ? 'role-on' : ''}`} onClick={() => setRole('husband')}>남편</button>
            <button className={`role ${role === 'wife' ? 'role-on' : ''}`} onClick={() => setRole('wife')}>아내</button>
          </div>
        </div>
      </div>
      <button className="btn btn-wide" disabled={code.length !== 6 || !role} onClick={start}>시작하기</button>
    </main>
  )
}
