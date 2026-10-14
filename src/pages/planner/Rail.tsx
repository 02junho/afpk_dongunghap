import { Link, useLocation } from 'react-router-dom'
import { DEMO_QUEUE } from '../../data/demo'

export default function Rail({ count = DEMO_QUEUE.length }: { count?: number }) {
  const { pathname } = useLocation()
  const on = (p: string) => `rail-item ${pathname === p ? 'rail-item-on' : ''}`
  return (
    <nav className="rail">
      <div className="rail-top">
        <p className="rail-title"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</p>
        <p className="rail-sub">설계사 콘솔 · 박성훈 AFPK</p>
      </div>
      <p className="rail-group">담당</p>
      <Link className={on('/p/couples')} to="/p/couples">커플 4쌍</Link>
      <p className="rail-group">김현우 · 박지우</p>
      <Link className={on('/p/queue')} to="/p/queue">처리 대기{count > 0 && <span className="rail-count">{count}</span>}</Link>
      <Link className={on('/p/cards')} to="/p/cards">가정 카드</Link>
      <Link className={on('/p/history')} to="/p/history">변경 이력</Link>
    </nav>
  )
}
