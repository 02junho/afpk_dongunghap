import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import type { ReactElement } from 'react'
import { isLive } from './lib/db'
import { loadMe } from './lib/session'
import Join from './pages/couple/Join'
import Home from './pages/couple/Home'
import Round from './pages/couple/Round'
import Wait from './pages/couple/Wait'
import Done from './pages/couple/Done'
import Change from './pages/couple/Change'
import Couples from './pages/planner/Couples'
import Queue from './pages/planner/Queue'
import Cards from './pages/planner/Cards'
import History from './pages/planner/History'

/**
 * 실제 배포(Supabase 연결)에서 입장 정보가 없는 폰은 부부 화면 대신 입장 화면으로.
 * 이게 없으면 세션이 없는 폰이 데모 부부(김현우·박지우) 화면과 가짜 0회차를 봤다 (10.18).
 */
function NeedsJoin({ children }: { children: ReactElement }) {
  return isLive() && !loadMe().live ? <Navigate to="/c/join" replace /> : children
}

/** 이미 입장한 폰이 주소만 치고 들어오면 바로 홈으로. 코드가 든 새 링크(?code=)로 오면 입장 화면을 보여준다 */
function JoinOrHome() {
  const [params] = useSearchParams()
  return isLive() && loadMe().live && !params.get('code') ? <Navigate to="/c/home" replace /> : <Join />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/c/join" replace />} />
      <Route path="/c/join" element={<JoinOrHome />} />
      <Route path="/c/home" element={<NeedsJoin><Home /></NeedsJoin>} />
      <Route path="/c/round/:id" element={<NeedsJoin><Round /></NeedsJoin>} />
      <Route path="/c/wait/:id" element={<NeedsJoin><Wait /></NeedsJoin>} />
      <Route path="/c/done/:id" element={<NeedsJoin><Done /></NeedsJoin>} />
      <Route path="/c/change/:key" element={<NeedsJoin><Change /></NeedsJoin>} />
      <Route path="/p" element={<Navigate to="/p/couples" replace />} />
      <Route path="/p/couples" element={<Couples />} />
      <Route path="/p/archived" element={<Couples archivedView />} />
      <Route path="/p/queue" element={<Queue />} />
      <Route path="/p/cards" element={<Cards />} />
      <Route path="/p/history" element={<History />} />
    </Routes>
  )
}
