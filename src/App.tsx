import { Routes, Route, Navigate } from 'react-router-dom'
import Join from './pages/couple/Join'
import Home from './pages/couple/Home'
import Round from './pages/couple/Round'
import Result from './pages/couple/Result'
import Couples from './pages/planner/Couples'
import Queue from './pages/planner/Queue'
import Cards from './pages/planner/Cards'
import History from './pages/planner/History'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/c/join" replace />} />
      <Route path="/c/join" element={<Join />} />
      <Route path="/c/home" element={<Home />} />
      <Route path="/c/round/:id" element={<Round />} />
      <Route path="/c/result/:id" element={<Result />} />
      {/* 설계사 콘솔 4화면. 첫 화면은 커플 목록 — 설계사 1명 : 커플 N쌍 */}
      <Route path="/p" element={<Navigate to="/p/couples" replace />} />
      <Route path="/p/couples" element={<Couples />} />
      <Route path="/p/queue" element={<Queue />} />
      <Route path="/p/cards" element={<Cards />} />
      <Route path="/p/history" element={<History />} />
    </Routes>
  )
}
