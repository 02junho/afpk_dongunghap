import { Link } from 'react-router-dom'
import { selectedCouple } from './demo'

/**
 * 변경 이력. 누가 언제 무엇을 왜 바꿨는지.
 * 3주 범위에서는 **DB에만 남기는 것**이 결정이었지만(docs/01), 읽기 전용 목록은
 * card_versions 한 번 조회로 끝나므로 화면을 비워두지 않는다.
 * 2주차: select * from card_versions where card_id in (...) order by created_at desc
 */
const ROWS = [
  { at: '2026-10-11 14:02', who: '데모 설계사', card: '주택 취득 시점', from: '2029-06', to: '2030-03', reason: '전세 만기 연장으로 매수 시점 조정', state: '동의 대기' },
  { at: '2026-10-02 09:41', who: '데모 설계사', card: '부부 합산 소득', from: '7,400만', to: '7,600만', reason: '아내 연봉 인상 반영', state: '활성' },
  { at: '2026-09-28 18:20', who: '데모 설계사', card: '카드 10장', from: '—', to: 'v1', reason: '최초 설정', state: '활성' },
]

export default function History() {
  const couple = selectedCouple()
  return (
    <main className="planner">
      <h1>변경 이력 · {couple.label}</h1>
      <p className="muted">
        카드 값은 덮어쓰지 않습니다. 모든 수정은 새 버전이고, 과거 버전은 삭제되지 않습니다.
        · <Link to="/p/couples">커플 바꾸기</Link>
      </p>
      {ROWS.map((r, i) => (
        <div className="card" key={i}>
          <b>{r.card}</b> <span className="muted">{r.at} · {r.who}</span>
          <p className="muted" style={{ margin: '6px 0' }}>{r.from} → <b>{r.to}</b> · {r.state}</p>
          <p style={{ margin: 0 }}>사유: {r.reason}</p>
        </div>
      ))}
    </main>
  )
}
