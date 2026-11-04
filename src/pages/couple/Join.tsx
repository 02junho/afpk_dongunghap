import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isLive, joinCouple } from '../../lib/db'
import { saveMe, type Role } from '../../lib/session'
import InstallGuide from './InstallGuide'

/**
 * 입장 코드는 설계사가 /p/couples 에서 발급해 상담 자리에서 알려준다.
 * 링크로 보내면(`/c/join?code=482913`) 코드가 미리 채워져 역할만 고르면 된다 — 카톡 한 번이면 끝.
 * live: 시작하기 → 익명 로그인 → join_couple(code, role) RPC (supabase/rls.sql). 이후 이 폰이 곧 신원.
 */
export default function Join() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState((params.get('code') ?? '').replace(/\D/g, '').slice(0, 6))
  const [role, setRole] = useState<Role | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function start() {
    if (!role) return
    setErr('')
    if (!isLive()) {
      saveMe({ role, code, live: false, names: { husband: '현우', wife: '지우' } })
      return nav('/c/home')
    }
    setBusy(true)
    try {
      const { coupleId, memberId, names } = await joinCouple(code, role)
      saveMe({ role, code, live: true, coupleId, memberId, names })
      nav('/c/home')
    } catch (e) {
      setErr((e as Error).message.includes('찾을 수 없') ? '코드를 다시 확인해 주세요.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
      </div>
      <div className="phone-body">
        <h2 className="q">설계사님께 받은<br />입장 코드를 넣어 주세요</h2>
        {params.get('removed') && <p className="note" style={{ color: 'var(--escalate)' }}>입장이 해제됐어요. 설계사님께 코드를 다시 확인해 주세요.</p>}
        <InstallGuide code={code.length === 6 ? code : undefined} />
        <input className="field code-field" style={{ marginTop: 24 }} inputMode="numeric" maxLength={6} placeholder="······"
          aria-label="입장 코드 여섯 자리" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
        <p className="meta" style={{ margin: '28px 0 10px' }}>어느 분이세요?</p>
        <div className="role-row">
          <button className={`role ${role === 'husband' ? 'role-on' : ''}`} onClick={() => setRole('husband')}>
            {/* 입장 전엔 누구인지 모른다 — 이름 대신 역할 첫 글자. 입장하면 홈에서 이름 첫 글자로 바뀐다 */}
            <span className="avatar avatar-him">남</span>남편
          </button>
          <button className={`role ${role === 'wife' ? 'role-on' : ''}`} onClick={() => setRole('wife')}>
            <span className="avatar avatar-her">아</span>아내
          </button>
        </div>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        <p className="meta" style={{ textAlign: 'center', fontSize: 11, marginTop: 24, opacity: 0.6 }}>버전 {__BUILD_ID__}</p>
      </div>
      <button className="btn btn-wide" disabled={code.length !== 6 || !role || busy} onClick={start}>
        {busy ? '연결 중…' : '시작하기'}
      </button>
    </main>
  )
}
