import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Rail from './Rail'
import { usePlanner } from './planner'
import { CATEGORIES, chipOf, showPlanned } from '../../data/demo'
import { THEMES, WEEKS, PER_THEME } from '../../data/template'

/**
 * 사이클 정리 (11.04 새 방향, docs/21). 6주 동안 주차별 진행과, 이번 사이클에서 계획과 어긋난 것을 한 화면에.
 *  · 처리 대기에서 "확인함"을 누른 건은 ✓ 와 메모로 여기에 남는다 — 상담 때 이 화면을 보며 이야기한다
 *  · "다음 주로 넘기기"는 시연 · 테스트용 (실제로는 시작한 날부터 7일마다 저절로 열린다)
 *  · "상담 요청 보내기" → 두 분 폰에 알림. 사이클이 닫히고, 정한 주기(3 · 6개월)가 지나면 다음 사이클이 시작된다
 */
interface Week { week: number; theme: string; opensAt: string; roundId: string | null; status: string | null; total: number; husband: number; wife: number }
interface ReviewItem { id: string; key?: string; week: number | null; category: string; label: string; planned: string; type?: string; unit?: string | null; a: string; b: string; verdict: string; redKind?: string | null; needsReview?: boolean; resolution: string | null; note: string | null }
interface CycleRes {
  cycle: { startedAt: string; periodMonths: number; week: number | null; endsAt: string; nextAt: string; consultRequestedAt: string | null; closedAt: string | null } | null
  weeks: Week[]; review: ReviewItem[]; filled: number; total: number
}

const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

// 예시 화면 (설계사 코드 전 · 데모 서버): 3주차 진행 중
const DEMO: CycleRes = (() => {
  const start = new Date(Date.now() - 15 * 86_400_000).toISOString()
  const weeks: Week[] = THEMES.map(t => ({
    week: t.week, theme: t.label, opensAt: new Date(new Date(start).getTime() + (t.week - 1) * 7 * 86_400_000).toISOString(),
    roundId: t.week <= 3 ? `demo-${t.week}` : null, status: t.week < 3 ? 'judged' : t.week === 3 ? 'open' : null, total: PER_THEME,
    husband: t.week < 3 ? 5 : t.week === 3 ? 5 : 0, wife: t.week < 3 ? 5 : t.week === 3 ? 2 : 0,
  }))
  return {
    cycle: { startedAt: start, periodMonths: 3, week: 3, endsAt: '', nextAt: '', consultRequestedAt: null, closedAt: null }, weeks, filled: 30, total: 30,
    review: [
      { id: 'd1', key: 't1_buy_when', week: 1, category: 'housing', label: '내 집 마련 시점', planned: '2032-06', type: 'date', a: '2032-06', b: '2034-06', verdict: 'red', resolution: 'consult', note: '아내분 이직 계획 확인' },
      { id: 'd2', key: 't2_child_when', week: 2, category: 'children', label: '첫 아이 시점', planned: '2029-03', type: 'date', a: '2029-03', b: '기타: 집 사고 나서요', verdict: 'red', resolution: null, note: null },
    ],
  }
})()

export default function Cycle() {
  const p = usePlanner()
  const liveMode = !!(p.live && p.pass)
  const [data, setData] = useState<CycleRes | null>(liveMode ? null : DEMO)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    if (!liveMode) { setData(DEMO); return }
    try { setData(await p.call<CycleRes>('cycle')); setErr('') } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { void load() }, [liveMode, p.couple.id])

  async function act(action: 'cycle_skip_week' | 'consult_request', done: string) {
    setErr(''); setMsg('')
    if (!liveMode) { setMsg(`(예시) ${done}`); return }
    setBusy(true)
    try { await p.call(action); await load(); setMsg(done) } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const c = data?.cycle
  const ended = !!c && !c.closedAt && c.endsAt && Date.now() >= new Date(c.endsAt).getTime()
  const show = (it: ReviewItem, v: string) => {
    const t = showPlanned(it.type as never, (it.unit ?? null) as never, String(v ?? ''), it.key)
    return String(v) === String(it.planned) ? `그대로예요 (${t})` : `바뀜 → ${t}`
  }
  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">사이클 · {p.couple.label}</h1>
        {err && <p className="note" style={{ color: 'var(--escalate)' }}>{err}</p>}
        {msg && <p className="note" style={{ color: 'var(--agree)' }}>{msg}</p>}
        {!data && !err && <p className="note">불러오는 중…</p>}

        {data && !c && (
          <p className="note" style={{ marginTop: 18 }}>
            아직 시작하지 않았습니다. 질문 틀 {data.total}칸을 채운 뒤 시작합니다 (지금 {data.filled}칸). <Link to="/p/template">질문 틀로 →</Link>
          </p>
        )}

        {c && (
          <>
            <p className="meta" style={{ marginTop: 6 }}>
              {day(c.startedAt)} 시작 · {c.periodMonths === 6 ? '반기' : '분기'}마다
              {c.closedAt ? ` · 상담 요청 ${day(c.consultRequestedAt ?? c.closedAt)} · 다음 사이클 ${day(c.nextAt)}` : ended ? ' · 6주 끝' : ` · 지금 ${c.week}주차`}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}><th style={{ padding: 8 }}>주</th><th>테마</th><th>열리는 날</th><th>{p.couple.husband}</th><th>{p.couple.wife}</th><th>상태</th></tr></thead>
              <tbody>
                {data.weeks.map(w => (
                  <tr key={w.week} style={{ borderTop: '1px solid var(--line)', opacity: w.roundId ? 1 : 0.5 }}>
                    <td style={{ padding: 8 }}>{w.week}</td>
                    <td><b>{w.theme}</b></td>
                    <td>{day(w.opensAt)}</td>
                    <td>{w.roundId ? `${w.husband} / ${w.total}` : '—'}</td>
                    <td>{w.roundId ? `${w.wife} / ${w.total}` : '—'}</td>
                    <td>{!w.roundId ? '아직' : w.status === 'judged' ? '끝남' : w.status === 'closed' ? '닫힘' : w.husband >= w.total && w.wife >= w.total ? '판정 중' : '답하는 중'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!c.closedAt && (
              <div className="actions" style={{ marginTop: 14 }}>
                <button className="btn btn-quiet btn-small" disabled={busy || (c.week ?? 0) >= WEEKS}
                  title="시연 · 테스트용 — 실제로는 시작한 날부터 7일마다 저절로 열립니다"
                  onClick={() => void act('cycle_skip_week', '다음 주 질문을 열었습니다.')}>다음 주로 넘기기 (테스트용)</button>
                <button className="btn btn-small" style={{ marginLeft: 'auto' }} disabled={busy}
                  onClick={() => { if (ended || confirm('아직 6주가 끝나지 않았습니다. 지금 상담 요청을 보내고 이번 사이클을 닫을까요?')) void act('consult_request', '상담 요청 알림을 보냈습니다. 이번 사이클을 닫았습니다.') }}>상담 요청 보내기</button>
              </div>
            )}

            <h2 className="work-title" style={{ fontSize: 18, marginTop: 30 }}>이번 사이클에서 어긋난 것 <span className="meta" style={{ fontSize: 14 }}>{data.review.length}건 · 확인 {data.review.filter(r => r.resolution).length}건</span></h2>
            {!data.review.length && <p className="note">아직 어긋난 것이 없습니다.</p>}
            {THEMES.map(t => {
              const list = data.review.filter(r => r.week === t.week)
              if (!list.length) return null
              const cat = CATEGORIES[t.category]
              return (
                <div key={t.week} style={{ marginTop: 14 }}>
                  <p className="cat-head"><span className="chip" style={{ background: cat.bg, color: cat.fg, fontSize: 12, padding: '3px 10px' }}>{t.week}주</span> {t.label}</p>
                  {list.map(it => {
                    const chip = chipOf(it)
                    return (
                      <div key={it.id} className="qcard" style={{ padding: '12px 16px', marginBottom: 8 }}>
                        <div className="queue-top">
                          <span style={{ fontWeight: 700 }}>{it.label}</span>
                          <span className={`chip ${chip.cls}`}>{chip.text}</span>
                          <span className="queue-couple">{it.resolution ? '✓ 확인함' : '확인 전'}</span>
                        </div>
                        <dl className="pair" style={{ gridTemplateColumns: '72px 1fr' }}>
                          <dt className="meta">설계 전제</dt><dd style={{ color: 'var(--muted)' }}>{showPlanned(it.type as never, (it.unit ?? null) as never, String(it.planned), it.key)}</dd>
                          <dt><span className="avatar avatar-him">{p.couple.husband.slice(0, 1)}</span></dt><dd>{show(it, it.a)}</dd>
                          <dt><span className="avatar avatar-her">{p.couple.wife.slice(0, 1)}</span></dt><dd>{show(it, it.b)}</dd>
                          {it.note && <><dt className="meta">메모</dt><dd>{it.note}</dd></>}
                        </dl>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {data.review.some(r => !r.resolution) && <p className="meta" style={{ marginTop: 10 }}>확인 전인 건은 <Link to="/p/queue">처리 대기</Link>에서 "확인함"을 누릅니다.</p>}
          </>
        )}
      </main>
    </div>
  )
}
