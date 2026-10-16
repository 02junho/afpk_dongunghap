import { useEffect, useState } from 'react'
import Rail from './Rail'
import { usePlanner } from './planner'

interface Row { id: string; label: string; version: number; from: string; to: string; reason: string; at: string; active: boolean }

const DEMO: Row[] = [
  { id: 'd1', label: '승진·이직 계획', version: 2, from: '없음. 현 직장 유지, 연봉 상승은 물가 수준', to: '남편 2027년 상반기 이직 예정', reason: '0회차에서 두 분 모두 이직을 전제로 답함', at: '2026-10-12T14:20:00+09:00', active: false },
  { id: 'd2', label: '목표 주택가격', version: 2, from: '650000000', to: '600000000', reason: '신혼부부 구입자금 상한에 맞춤', at: '2026-09-30T11:05:00+09:00', active: true },
  { id: 'd3', label: '카드 10장 최초 설정', version: 1, from: '—', to: 'v1', reason: '설계안 확정', at: '2026-09-28T16:42:00+09:00', active: true },
]

/** 변경 이력. 카드 값은 덮어쓰지 않으므로 card_versions 가 곧 이력이다. live 면 DB. */
export default function History() {
  const p = usePlanner()
  const [rows, setRows] = useState<Row[]>(DEMO)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!p.live || !p.pass) { setRows(DEMO); return }
    p.call<{ items: Row[] }>('history').then(r => { setRows(r.items); setErr('') }).catch(e => setErr((e as Error).message))
  }, [p.live, p.pass, p.couple.id])

  const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">변경 이력 · {p.couple.label}</h1>
        <p className="meta">카드 값은 덮어쓰지 않습니다. 모든 버전이 남습니다. "동의 대기"는 두 분이 아직 먼저 묻기에 답하지 않은 버전입니다.</p>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        <div style={{ marginTop: 22 }}>
          {rows.map(l => (
            <div className="qcard" key={l.id}>
              <div className="queue-top">
                <span style={{ fontSize: 15, fontWeight: 700 }}>{l.label}</span>
                <span className="meta">v{l.version}</span>
                <span className={`chip ${l.active ? 'chip-agree' : 'chip-talk'}`}>{l.active ? '반영됨' : '동의 대기'}</span>
                <span className="queue-couple">{fmt(l.at)} · 박성훈 AFPK</span>
              </div>
              <dl className="pair" style={{ gridTemplateColumns: '60px 1fr' }}>
                <dt className="meta">이전</dt><dd style={{ color: 'var(--muted)' }}>{l.from}</dd>
                <dt className="meta">이후</dt><dd>{l.to}</dd>
                <dt className="meta">이유</dt><dd>{l.reason}</dd>
              </dl>
            </div>
          ))}
          {!rows.length && <p className="note">아직 변경이 없습니다.</p>}
        </div>
      </main>
    </div>
  )
}
