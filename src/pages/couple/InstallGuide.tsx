import { useState } from 'react'
import { isStandalone, platform, useInstallPrompt } from '../../lib/install'

/**
 * 부부 폰의 "홈 화면에 추가" 안내 카드. 폰 브라우저로 열었을 때만 보인다 (홈 화면 앱·컴퓨터에선 숨김).
 * code 가 있으면 함께 보여준다 — 아이폰은 홈 화면 앱에서 코드를 다시 넣어야 해서.
 * 닫으면 이 기기에선 다시 안 보인다 (localStorage).
 */
const DISMISS_KEY = 'install-guide-dismissed'

export default function InstallGuide({ code, compact = false }: { code?: string; compact?: boolean }) {
  const p = platform()
  const { canInstall, install } = useInstallPrompt()
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [open, setOpen] = useState(!compact)

  if (hidden || isStandalone() || p === 'desktop') return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* 무시 */ }
    setHidden(true)
  }

  return (
    <div className="bubble" style={{ margin: compact ? '0 0 14px' : '18px 0 0', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, flex: 1 }}>홈 화면에 추가하면 앱처럼 열려요</p>
        {compact && !open && (
          <button className="btn btn-quiet btn-small" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setOpen(true)}>방법</button>
        )}
      </div>
      {open && (
        <>
          {canInstall ? (
            <button className="btn btn-small" style={{ marginTop: 12 }} onClick={() => void install()}>홈 화면에 추가</button>
          ) : (
            <ol className="note" style={{ margin: '10px 0 0', paddingLeft: 20 }}>
              {p === 'ios' ? (
                <>
                  <li><b>공유 버튼</b>(네모에 위 화살표)을 눌러요 — {/CriOS/.test(navigator.userAgent) ? '크롬은 주소창 오른쪽' : '사파리는 화면 아래'}</li>
                  <li><b>"홈 화면에 추가"</b> → 오른쪽 위 <b>추가</b></li>
                  <li>홈 화면의 <b>돈궁합</b> 아이콘으로 열어요</li>
                </>
              ) : (
                <>
                  <li>크롬 오른쪽 위 <b>⋮</b> 메뉴를 눌러요</li>
                  <li><b>"홈 화면에 추가"</b> 또는 <b>"앱 설치"</b></li>
                  <li>홈 화면의 <b>돈궁합</b> 아이콘으로 열어요</li>
                </>
              )}
            </ol>
          )}
          {code && (
            <p className="note" style={{ marginTop: 8 }}>
              {p === 'ios' ? '아이콘으로 처음 열면 코드를 한 번 더 넣어요' : '아이콘으로 열었을 때 코드를 물으면'}: <b style={{ letterSpacing: '0.12em', color: 'var(--ink)' }}>{code}</b>
            </p>
          )}
          <button onClick={dismiss}
            style={{ font: 'inherit', fontSize: 13, color: 'var(--muted)', background: 'none', border: 0, padding: 0, marginTop: 10, textDecoration: 'underline', cursor: 'pointer' }}>
            이미 추가했어요 · 닫기
          </button>
        </>
      )}
    </div>
  )
}
