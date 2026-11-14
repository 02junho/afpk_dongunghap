import { useEffect, useState } from 'react'
import Rail from './Rail'
import { remember, remembered, usePlanner } from './planner'
import { showPlanned } from '../../data/demo'
import type { Card } from '../../judge/index'

/** awaiting = 미활성인데 열린 먼저 묻기가 묻는 중. 미활성 + !awaiting = 동의 안 됨 (판정까지 끝났는데 🟢 아님) */
interface Row { id: string; label: string; version: number; from: string; to: string; reason: string; at: string; active: boolean; awaiting?: boolean; type?: Card['type']; unit?: Card['unit'] | null }

const DEMO: Row[] = [
  { id: 'd1', label: '은퇴 후 월 생활비', version: 2, from: '3000000', to: '3500000', reason: '3주차 질문에서 두 분 모두 350만 원으로 답함 · 상담에서 확인', at: '2026-11-20T14:20:00+09:00', active: false, awaiting: true, type: 'number', unit: 'krw' },
  { id: 'd2', label: '목표 집값', version: 2, from: '430000000', to: '480000000', reason: '입주 시점(2032년) 시세로 다시 잡음', at: '2026-11-04T11:05:00+09:00', active: true, type: 'number', unit: 'krw' },
  { id: 'd3', label: '질문 틀 30칸 처음 저장', version: 1, from: '—', to: 'v1', reason: '재무설계 결과에서 채우고 원문과 대조', at: '2026-11-03T16:42:00+09:00', active: true },
]

/** 변경 이력. 카드 값은 덮어쓰지 않으므로 card_versions 가 곧 이력이다. live 면 DB. */
export default function History() {
  const p = usePlanner()
  const key = `history:${p.couple.id}`
  const [rows, setRows] = useState<Row[] | null>(p.live && p.pass ? (remembered<Row[]>(key) ?? null) : DEMO)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!p.live || !p.pass) { setRows(DEMO); return }
    setRows(remembered<Row[]>(key) ?? null)
    p.call<{ items: Row[] }>('history').then(r => { setRows(remember(key, r.items)); setErr('') }).catch(e => setErr((e as Error).message))
  }, [p.live, p.pass, p.couple.id])

  const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">변경 이력 · {p.couple.label}</h1>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        <div style={{ marginTop: 22 }}>
          {rows === null && !err && <p className="note">불러오는 중…</p>}
          {(rows ?? []).map(l => (
            <div className="qcard" key={l.id}>
              <div className="queue-top">
                <span style={{ fontSize: 15, fontWeight: 700 }}>{l.label}</span>
                <span className={`chip ${l.active ? 'chip-agree' : l.awaiting ? 'chip-talk' : 'chip-escalate'}`}>{l.active ? '반영됨' : l.awaiting ? '동의 대기' : '동의 안 됨'}</span>
                <span className="queue-couple">{fmt(l.at)}</span>
              </div>
              <dl className="pair" style={{ gridTemplateColumns: '60px 1fr' }}>
                <dt className="meta">이전</dt><dd style={{ color: 'var(--muted)' }}>{showPlanned(l.type, l.unit, l.from)}</dd>
                <dt className="meta">이후</dt><dd>{showPlanned(l.type, l.unit, l.to)}</dd>
                <dt className="meta">이유</dt><dd>{l.reason}</dd>
              </dl>
            </div>
          ))}
          {rows !== null && !rows.length && <p className="note">아직 변경이 없습니다.</p>}
        </div>
      </main>
    </div>
  )
}
