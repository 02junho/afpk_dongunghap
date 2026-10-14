import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { RedKind, Verdict } from '../../judge/index'
import { selectedCouple } from './demo'

type Resolution = 'card_updated' | 'false_positive' | 'no_action'

interface QueueItem {
  id: string
  cardLabel: string
  verdict: Verdict
  redKind?: RedKind
  needsReview?: boolean
  method: 'deterministic' | 'llm'
  a: string
  b: string
  planned: string
  summary: string
}

/**
 * 설계사 큐. 🔴 전부 + "사람이 봐야 하는 🟡"(파싱 실패·조건부 답변)이 올라온다.
 * 2주차: select * from planner_queue where couple_id = ? (supabase/schema.sql 의 뷰)
 *
 * 닫을 때 **이유를 남긴다**. false_positive 가 golden set 의 최고 품질 소스다 —
 * 재무설계사가 직접 라벨링한 오탐이기 때문이다 (부록 3번).
 */
const ITEMS: QueueItem[] = [
  {
    id: 'j1', cardLabel: '승진·이직 계획', verdict: 'red', redKind: 'plan_stale', method: 'llm',
    a: '저 내년에 이직해요', b: '남편 이직 준비 중이에요',
    planned: '없음. 현 직장 유지, 연봉 상승은 물가 수준',
    summary: '두 분 모두 이직을 전제로 말함 — 설계 전제(이직 없음)가 낡음.\n합산 소득 여유 900만원 → 초과 시 신혼부부 구입자금 자격 상실.\n이직 후 예상 소득을 확인해야 합니까?',
  },
  {
    id: 'j2', cardLabel: '양가 지원', verdict: 'red', redKind: 'couple_conflict', method: 'llm',
    a: '1.5억이요', b: '그건 빌리는 거예요, 주시는 게 아니라',
    planned: '전세 때 8,000만원 받았고, 매수 시 1.5억 추가 지원 예정',
    summary: '금액은 같지만 증여/차용 인식이 다름.\n증여재산공제 창구(2027.10)와 차용증 설계가 갈림.\n차용으로 확정 시 이자·상환 계획을 넣어야 합니까?',
  },
  {
    id: 'j3', cardLabel: '주택 취득 시점', verdict: 'yellow', needsReview: true, method: 'deterministic',
    a: '2029-06', b: '애 낳고 나서',
    planned: '2029-06',
    summary: '아내가 시점 대신 조건으로 답함 — 자동 판정 불가.\n출산 시점에 따라 신생아 특례 접수 기한이 바뀜.\n조건을 연·월로 확정할 수 있습니까?',
  },
]

export default function Queue() {
  const couple = selectedCouple()
  const [done, setDone] = useState<Record<string, Resolution>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')

  function resolve(id: string, r: Resolution) {
    setDone(p => ({ ...p, [id]: r }))
    setOpen(null)
    setNote('')
  }

  const pending = ITEMS.filter(i => !done[i.id])

  return (
    <main className="planner">
      <h1>설계사 · 처리 대기 <span className="muted">({pending.length}건)</span></h1>
      <p className="muted">
        🔴 전부와, 자동 판정이 안 된 🟡만 올라옵니다. 대화로 끝나는 🟡는 오지 않습니다.
        · {couple.label} · <Link to="/p/couples">커플 바꾸기</Link>
      </p>

      {pending.map(it => (
        <div className="card" key={it.id}>
          <span className={`pill ${it.verdict}`}>
            {it.verdict === 'red'
              ? it.redKind === 'plan_stale' ? '전제 폐기' : it.redKind === 'repeated_yellow' ? '2연속 🟡' : '부부 불일치'
              : '확인 필요'}
          </span>{' '}
          <b>{it.cardLabel}</b>
          <span className="muted"> · {it.method === 'llm' ? 'AI 판별' : '규칙 판별'}</span>

          <p className="muted" style={{ marginBottom: 4 }}>현재 전제: {it.planned}</p>
          <p className="muted" style={{ marginTop: 0 }}>남편: {it.a} / 아내: {it.b}</p>
          <p style={{ whiteSpace: 'pre-line' }}><b>AI 요약</b>{'\n'}{it.summary}</p>

          {open === it.id ? (
            <>
              <label className="muted">메모 (선택)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="왜 이렇게 닫는지 한 줄" />
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to="/p/cards" style={{ flex: 1 }}>
                  <button style={{ width: '100%' }} onClick={() => resolve(it.id, 'card_updated')}>카드 수정하러 가기</button>
                </Link>
                <button className="ghost" style={{ flex: 1 }} onClick={() => resolve(it.id, 'false_positive')}>
                  오탐이었다
                </button>
                <button className="ghost" style={{ flex: 1 }} onClick={() => resolve(it.id, 'no_action')}>
                  조치 불필요
                </button>
              </div>
              <p className="muted">
                "오탐이었다"는 판정 로그에 남아 golden set 후보가 됩니다 — 설계사가 직접 라벨링한 데이터입니다.
              </p>
            </>
          ) : (
            <button className="ghost" style={{ width: 'auto' }} onClick={() => setOpen(it.id)}>처리하기 →</button>
          )}
        </div>
      ))}

      {!pending.length && <p className="muted">처리할 건이 없습니다.</p>}

      {!!Object.keys(done).length && (
        <>
          <h2>방금 처리한 건</h2>
          {ITEMS.filter(i => done[i.id]).map(i => (
            <p className="muted" key={i.id}>
              {i.cardLabel} — {done[i.id] === 'card_updated' ? '카드 수정' : done[i.id] === 'false_positive' ? '오탐' : '조치 불필요'}
            </p>
          ))}
        </>
      )}
    </main>
  )
}
