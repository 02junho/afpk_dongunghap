import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

// 새 배포가 있으면 서비스워커가 받아서 바로 갈아끼우고 페이지를 한 번 새로고침한다 (autoUpdate).
// 없으면 이전 번들이 캐시에서 계속 떠서 "새로고침 두 번"이 필요했다 (10.16·10.18 두 번 겪음).
// 페이지를 연 직후에만 확인한다 — 답하는 도중에 화면이 갑자기 새로고침되지 않게 주기 확인은 두지 않는다.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* v7 동작을 미리 켠다 — 콘솔 경고 제거. 라우트 구조상 영향 없음 */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
