import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * 입장 코드는 설계사가 /p/couples 에서 발급해 상담 자리에서 알려준다.
 * 링크로 보내면(`/c/join?code=482913`) 코드가 미리 채워져 역할만 고르면 된다 — 카톡 한 번이면 끝.
 * 2주차: 시작하기 → 익명 로그인 → join_couple(code, role) RPC (supabase/rls.sql).
 */
export default function Join() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState((params.get('code') ?? '').replace(/\D/g, '').slice(0, 6))
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
