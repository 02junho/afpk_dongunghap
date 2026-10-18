import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

// 새 배포가 있으면 서비스워커가 받아서 바로 갈아끼우고 페이지를 한 번 새로고침한다 (autoUpdate).
// 없으면 이전 번들이 캐시에서 계속 떠서 "새로고침 두 번"이 필요했다 (10.16·10.18 두 번 겪음).
// 확인 시점: 처음 열 때 + 백그라운드에 있던 앱·탭이 다시 화면에 나올 때.
//   폰의 홈 화면 앱은 닫아도 메모리에 남아 있다가 그대로 다시 열려서, 처음 열 때만 확인하면 새 배포를 못 본다 (10.18).
//   단 질문에 답하는 중(/c/round)에는 확인하지 않는다 — 고르던 답이 새로고침으로 날아가지 않게.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !location.pathname.startsWith('/c/round')) void reg.update()
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* v7 동작을 미리 켠다 — 콘솔 경고 제거. 라우트 구조상 영향 없음 */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
