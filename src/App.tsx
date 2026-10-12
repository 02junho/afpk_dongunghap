import { Routes, Route, Navigate } from 'react-router-dom'
import Join from './pages/couple/Join'
import Home from './pages/couple/Home'
import Round from './pages/couple/Round'
import Wait from './pages/couple/Wait'
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
      <Route path="/c/wait/:id" element={<Wait />} />
      <Route path="/c/result/:id" element={<Result />} />
      <Route path="/p" element={<Navigate to="/p/couples" replace />} />
      <Route path="/p/couples" element={<Couples />} />
      <Route path="/p/queue" element={<Queue />} />
      <Route path="/p/cards" element={<Cards />} />
      <Route path="/p/history" element={<History />} />
    </Routes>
  )
}
