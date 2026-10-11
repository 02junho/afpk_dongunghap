import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** 1주차: 로컬 상태만. 2주차에 Supabase members 연결. */
export default function Join() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [role, setRole] = useState<'husband' | 'wife'>('husband')
  return (
    <main className="couple">
      <h1>돈궁합</h1>
      <p className="muted">설계사에게 받은 커플 코드를 입력하세요</p>
      <input inputMode="numeric" maxLength={6} placeholder="6자리" value={code} onChange={e => setCode(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className={role === 'husband' ? '' : 'ghost'} onClick={() => setRole('husband')}>남편</button>
        <button className={role === 'wife' ? '' : 'ghost'} onClick={() => setRole('wife')}>아내</button>
      </div>
      <button disabled={code.length !== 6} onClick={() => { sessionStorage.setItem('me', JSON.stringify({ code, role })); nav('/c/home') }}>시작</button>
    </main>
  )
}
