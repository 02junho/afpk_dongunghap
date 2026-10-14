import { useState } from 'react'
import { Link } from 'react-router-dom'
import Rail from './Rail'
import { byKey, CATEGORIES, DEMO_ANSWERS, DEMO_JUDGMENTS } from '../../data/demo'

const SUMMARY: Record<string, string> = {
  raise_plan: '소득 상한까지 여유 900만원. 두 분 모두 남편 이직을 전제로 답했고 설계안은 현 직장 유지를 전제함. 연봉 20% 상승 시 신혼부부 구입자금 자격 상실 — 매수 시점 앞당길지 검토 필요.',
  family_help: '금액 1.5억은 일치, 성격이 갈림. 남편은 증여로, 아내는 차용으로 인지. 증여면 혼인 증여재산공제 창구 2027.10 마감, 차용이면 적정이자율 4.6% 문제. 어느 쪽인지 확인이 먼저.',
}

/**
 * 🔴만 올라온다. "이건 같은 뜻이에요"(AI 오판 표시)는 부부가 아니라 설계사가 누른다 —
 * 부부는 판정을 보지 않으므로. 전문가 라벨이라 AI 검증 자료로 오히려 낫다.
 */
export default function Queue() {
  const [disputed, setDisputed] = useState<string[]>([])
  const items = ['raise_plan', 'family_help']
  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">처리 대기</h1>
        <p className="meta">전제가 깨진 건만 올라옵니다. 두 분이 같게 본 항목은 여기 오지 않습니다.</p>
        <div style={{ marginTop: 22 }}>
          {items.map(k => {
            const c = byKey(k), j = DEMO_JUDGMENTS[k], a = DEMO_ANSWERS[k], cat = CATEGORIES[c.category]
            const stale = j.redKind === 'plan_stale', dis = disputed.includes(k)
            return (
              <div className="qcard" key={k}>
                <div className="queue-top">
                  <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{c.label}</span>
                  <span className={`chip ${dis ? 'chip-agree' : stale ? 'chip-talk' : 'chip-escalate'}`}>{dis ? '같은 뜻으로 정리' : stale ? '전제 폐기' : '부부 불일치'}</span>
                  <span className="queue-couple">김현우 · 박지우 · 0회차</span>
                </div>
                <dl className="pair" style={{ gridTemplateColumns: '72px 1fr' }}>
                  <dt className="meta" style={{ paddingTop: 3 }}>설계 전제</dt><dd style={{ color: 'var(--muted)' }}>{String(c.plannedValue)}</dd>
                  <dt><span className="avatar avatar-him">현</span></dt><dd>{a.husband}</dd>
                  <dt><span className="avatar avatar-her">지</span></dt><dd>{a.wife}</dd>
                </dl>
                <p className="summary"><span className="summary-by">AI 요약 · 프롬프트 v1 · 설계사 확인 필요</span>{SUMMARY[k]}</p>
                <div className="actions">
                  <Link to="/p/cards"><button className="btn btn-small">두 분께 먼저 묻기</button></Link>
                  <button className="btn btn-quiet btn-small">상담 때 다루기</button>
                  {!dis && <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }} onClick={() => setDisputed([...disputed, k])}>이건 같은 뜻이에요</button>}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
