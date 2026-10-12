import { Link } from 'react-router-dom'
import Rail from './Rail'

const ROWS = [
  { name: '김현우 · 박지우', code: '482913', state: '0회차 완료', red: 2, when: '오늘' },
  { name: '정도윤 · 한서현', code: '730254', state: '정기 3회차', red: 0, when: '3일 전' },
  { name: '오재민 · 류하경', code: '619478', state: '설계 직후 · 0회차 대기', red: 0, when: '어제' },
  { name: '배준서 · 문예린', code: '305126', state: '정기 7회차', red: 1, when: '11일 전' },
]

export default function Couples() {
  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">담당 커플</h1>
        <p className="meta">코드를 발급하면 두 분이 각자 휴대폰에서 바로 시작할 수 있습니다.</p>
        <div style={{ marginTop: 24 }}>
          {ROWS.map(r => (
            <div className="queue-item" key={r.code}>
              <div className="queue-top">
                <Link to="/p/queue" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{r.name}</Link>
                {r.red > 0 && <span className="tag tag-conflict">처리 대기 {r.red}</span>}
                <span className="queue-couple">마지막 응답 {r.when}</span>
              </div>
              <dl className="pair" style={{ gridTemplateColumns: '80px 1fr' }}>
                <dt>진행</dt><dd>{r.state}</dd>
                <dt>코드</dt><dd style={{ letterSpacing: '0.12em' }}>{r.code}</dd>
              </dl>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: 28 }}>
          <button className="btn btn-small">새 커플 등록하고 코드 발급</button>
        </div>
      </main>
    </div>
  )
}
