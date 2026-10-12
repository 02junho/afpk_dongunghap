import { Link } from 'react-router-dom'
import Rail from './Rail'
import { byKey, DEMO_ANSWERS, DEMO_JUDGMENTS } from '../../data/demo'

const SUMMARY: Record<string, string> = {
  raise_plan: '두 분 모두 남편 이직을 전제하고 답했습니다. 설계안은 현 직장 유지를 전제합니다. 소득 상한까지 여유가 900만원이라, 연봉이 20% 오르면 신혼부부 구입자금 자격을 잃습니다. 매수 시점을 앞당길지 검토가 필요합니다.',
  family_help: '금액은 1.5억으로 일치하나 성격이 갈립니다. 남편은 증여로, 아내는 차용으로 알고 있습니다. 증여면 혼인 증여재산공제 창구가 2027년 10월에 닫히고, 차용이면 적정이자율 문제가 생깁니다. 어느 쪽인지 확인이 먼저입니다.',
}

export default function Queue() {
  const items = ['raise_plan', 'family_help']
  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">처리 대기</h1>
        <p className="meta">전제가 깨진 건만 올라옵니다. 두 분이 같게 보고 있는 항목은 올라오지 않습니다.</p>
        <div style={{ marginTop: 20 }}>
          {items.map(k => {
            const c = byKey(k)
            const j = DEMO_JUDGMENTS[k]
            const a = DEMO_ANSWERS[k]
            const stale = j.redKind === 'plan_stale'
            return (
              <div className="queue-item" key={k}>
                <div className="queue-top">
                  <span className={`tag ${stale ? 'tag-stale' : 'tag-conflict'}`}>{stale ? '전제 폐기' : '부부 불일치'}</span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</span>
                  <span className="queue-couple">김현우 · 박지우 · 0회차</span>
                </div>
                <dl className="pair">
                  <dt>설계 전제</dt><dd style={{ color: 'var(--muted)' }}>{String(c.plannedValue)}</dd>
                  <dt>현우</dt><dd>{a.husband}</dd>
                  <dt>지우</dt><dd>{a.wife}</dd>
                </dl>
                <p className="summary">
                  <span className="summary-by">요약 · 프롬프트 v1 · 설계사 확인 필요</span>
                  {SUMMARY[k]}
                </p>
                <div className="actions">
                  <Link to="/p/cards"><button className="btn btn-small">카드 고치기</button></Link>
                  <button className="btn btn-quiet btn-small">상담 때 다루기</button>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
