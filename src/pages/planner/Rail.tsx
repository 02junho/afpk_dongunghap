import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { canPush, pushBlocked, pushOn, turnOnPush } from '../../lib/push'
import { DEMO_QUEUE } from '../../data/demo'
import { usePlanner, useQueueCount } from './planner'

/**
 * 설계사 콘솔 왼쪽 레일. 선택한 커플이 컨텍스트다 (설계사 1명 : 커플 N쌍).
 * live 인데 코드가 없으면 레일 안에서 코드를 받는다 — 어느 화면에서 들어와도 한 번만.
 */
export default function Rail({ count }: { count?: number }) {
  const { pathname } = useLocation()
  const p = usePlanner()
  const liveCount = useQueueCount(p, count ?? DEMO_QUEUE.length)
  const n = count ?? liveCount
  const [draft, setDraft] = useState('')
  // 설계사 알림 (11.04): 먼저 알린 변화 · 처리 대기가 생기면 이 기기로. 크롬 · 엣지 컴퓨터에서 바로 된다
  const [push, setPush] = useState<'hidden' | 'off' | 'on' | 'busy'>('hidden')
  const [pushErr, setPushErr] = useState('')
  useEffect(() => { if (p.live && p.pass && canPush() && !pushBlocked()) void pushOn('planner').then(on => setPush(on ? 'on' : 'off')); else setPush('hidden') }, [p.live, p.pass])
  async function enablePush() {
    setPush('busy'); setPushErr('')
    try { await turnOnPush('planner', { passcode: p.pass ?? '' }); setPush('on') }
    catch (e) { setPushErr((e as Error).message); setPush('off') }
  }
  const on = (path: string) => `rail-item ${pathname === path ? 'rail-item-on' : ''}`

  return (
    <nav className="rail">
      <div className="rail-top">
        <p className="rail-title"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</p>
        <p className="rail-sub">설계사 콘솔 · 박성훈 AFPK</p>
      </div>

      {p.live && !p.pass ? (
        <div style={{ padding: '8px 20px 16px' }}>
          <p className="rail-group" style={{ padding: '8px 0 6px' }}>설계사 코드</p>
          <input className="field" type="password" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && draft.trim() && p.setPass(draft.trim())}
            placeholder="설계사 코드" style={{ padding: '10px 12px', fontSize: 14, boxShadow: 'none', border: '2px solid var(--line)' }} />
          <button className="btn btn-small" style={{ marginTop: 8, width: '100%' }} disabled={!draft.trim()} onClick={() => p.setPass(draft.trim())}>들어가기</button>
          <p className="meta" style={{ marginTop: 8 }}>코드를 넣기 전에는 예시 화면이 보입니다.</p>
        </div>
      ) : (
        <>
          <p className="rail-group">담당</p>
          <Link className={on('/p/couples')} to="/p/couples">부부 목록</Link>
          <Link className={on('/p/archived')} to="/p/archived">지운 부부 보기</Link>
          <p className="rail-group">{p.couple.label}</p>
          <Link className={on('/p/queue')} to="/p/queue">처리 대기{n > 0 && <span className="rail-count">{n}</span>}</Link>
          <Link className={on('/p/template')} to="/p/template">질문 틀</Link>
          <Link className={on('/p/cycle')} to="/p/cycle">사이클</Link>
          <Link className={on('/p/history')} to="/p/history">변경 이력</Link>
          {p.live && (
            <p className="rail-group" style={{ marginTop: 24, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {push !== 'hidden' && (
                <button className="btn btn-quiet btn-small" style={{ padding: '6px 10px', fontSize: 12 }} disabled={push !== 'off'} onClick={() => void enablePush()}
                  title={pushErr || undefined}>{push === 'on' ? '알림 켜짐 ✓' : push === 'busy' ? '켜는 중…' : '알림 켜기'}</button>
              )}
              <button className="btn btn-quiet btn-small" style={{ padding: '6px 10px', fontSize: 12 }} onClick={p.clearPass}>나가기</button>
            </p>
          )}
          {pushErr && <p className="meta" style={{ padding: '0 20px', color: 'var(--escalate)' }}>{pushErr}</p>}
        </>
      )}
      <p className="meta" style={{ padding: '24px 20px 0', fontSize: 11, opacity: 0.6 }}>버전 {__BUILD_ID__}</p>
    </nav>
  )
}
