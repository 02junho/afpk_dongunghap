import { Routes, Route, Navigate } from 'react-router-dom'
import Join from './pages/couple/Join'
import Home from './pages/couple/Home'
import Round from './pages/couple/Round'
import Result from './pages/couple/Result'
import Queue from './pages/planner/Queue'
import Cards from './pages/planner/Cards'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/c/join" replace />} />
      <Route path="/c/join" element={<Join />} />
      <Route path="/c/home" element={<Home />} />
      <Route path="/c/round/:id" element={<Round />} />
      <Route path="/c/result/:id" element={<Result />} />
      <Route path="/p" element={<Navigate to="/p/queue" replace />} />
      <Route path="/p/queue" element={<Queue />} />
      <Route path="/p/cards" element={<Cards />} />
    </Routes>
  )
}
