import { useState } from 'react'
import { Link } from 'react-router-dom'
import Rail from './Rail'
import {
  byKey, CATEGORIES, DEMO_ANSWERS, DEMO_JUDGMENTS, DEMO_QUEUE, DEMO_SUMMARY, KIND_CHIP, loadLiveRound, showAnswer,
} from '../../data/demo'
import type { Judgment } from '../../judge/index'

/** 큐를 닫는 버튼 셋 = judgments.resolution 값 그대로 */
type Resolution = 'factcheck' | 'consult' | 'false_positive'
const RESOLVED = {
  factcheck: { text: '두 분께 묻는 중', cls: 'chip-talk' },
  consult: { text: '상담 안건', cls: 'chip-agree' },
  false_positive: { text: '같은 뜻으로 정리', cls: 'chip-agree' },
} as const

/**
 * 🔴 전부 + 자동 판정이 안 된 🟡(확인 필요)이 올라온다. 2주차: planner_queue 뷰.
 * "이건 같은 뜻이에요"(AI 오판 표시)는 부부가 아니라 설계사가 누른다 —
 * 부부는 판정을 보지 않으므로. 전문가 라벨이라 AI 검증 자료로 오히려 낫다.
 */
export default function Queue() {
  const [done, setDone] = useState<Record<string, Resolution>>({})

  // 한 기기 데모로 실제 답하고 판정까지 돌렸다면 그 결과를, 아니면 고정 데모를
  const live = loadLiveRound()
  const judgments: Record<string, Judgment> = live ? { ...DEMO_JUDGMENTS, ...live.judgments } : DEMO_JUDGMENTS
  const answerOf = (k: string) => {
    const l = live?.answers[k]
    if (l?.husband && l?.wife) return { husband: l.husband.text, wife: l.wife.text }
    return DEMO_ANSWERS[k]
  }
  const items = live
    ? Object.keys(judgments).filter(k => judgments[k].verdict === 'red' || judgments[k].needsReview)
    : DEMO_QUEUE
  const open = items.filter(k => !done[k])

  return (
    <div className="console">
      <Rail count={open.length} />
      <main className="work">
        <h1 className="work-title">처리 대기 <span className="meta" style={{ fontSize: 15 }}>{open.length}건</span></h1>
        <p className="meta">전제가 깨진 건과, 자동으로 판정하지 못한 건만 올라옵니다. 두 분이 같게 본 항목은 여기 오지 않습니다.</p>
        <div style={{ marginTop: 22 }}>
          {items.map(k => {
            const c = byKey(k), j = judgments[k], a = answerOf(k), cat = CATEGORIES[c.category]
            const res = done[k]
            const chip = res ? RESOLVED[res] : j.verdict === 'red' ? KIND_CHIP[j.redKind ?? 'couple_conflict'] : KIND_CHIP.needs_review
            const summary = DEMO_SUMMARY[k] ?? (j.reason || '요약 없음 — 설계사가 두 답변을 직접 봅니다')
            return (
              <div className="qcard" key={k} style={res ? { opacity: 0.6 } : undefined}>
                <div className="queue-top">
                  <span className="chip" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{c.label}</span>
                  <span className={`chip ${chip.cls}`}>{chip.text}</span>
                  <span className="meta">{j.method === 'llm' ? `AI 판별 · 프롬프트 ${j.promptVersion ?? '-'}` : '규칙 판별'}</span>
                  <span className="queue-couple">김현우 · 박지우 · 0회차</span>
                </div>
                <dl className="pair" style={{ gridTemplateColumns: '72px 1fr' }}>
                  <dt className="meta" style={{ paddingTop: 3 }}>설계 전제</dt><dd style={{ color: 'var(--muted)' }}>{showAnswer(c, String(c.plannedValue))}</dd>
                  <dt><span className="avatar avatar-him">현</span></dt><dd>{showAnswer(c, a.husband)}</dd>
                  <dt><span className="avatar avatar-her">지</span></dt><dd>{showAnswer(c, a.wife)}</dd>
                </dl>
                <p className="summary">
                  <span className="summary-by">{j.needsReview ? '자동 판정 불가 · ' : 'AI 요약 · '}설계사 확인 필요</span>
                  {summary}
                </p>
                {!res && (
                  <div className="actions">
                    <Link to="/p/cards"><button className="btn btn-small" onClick={() => setDone(d => ({ ...d, [k]: 'factcheck' }))}>두 분께 먼저 묻기</button></Link>
                    <button className="btn btn-quiet btn-small" onClick={() => setDone(d => ({ ...d, [k]: 'consult' }))}>상담 때 다루기</button>
                    <button className="btn btn-quiet btn-small" style={{ marginLeft: 'auto' }}
                      title="AI 오판 표시 — golden set 후보로 기록됩니다"
                      onClick={() => setDone(d => ({ ...d, [k]: 'false_positive' }))}>이건 같은 뜻이에요</button>
                  </div>
                )}
              </div>
            )
          })}
          {!open.length && <p className="note">처리할 건이 없습니다.</p>}
        </div>
      </main>
    </div>
  )
}
