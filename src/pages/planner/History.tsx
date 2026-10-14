import Rail from './Rail'

const LOG = [
  { when: '2026-10-12 14:20', who: '박성훈 AFPK', what: '승진·이직 계획', from: '없음. 현 직장 유지', to: '남편 2027년 상반기 이직 예정', why: '0회차에서 두 분 모두 이직을 전제로 답함', state: '재합의 대기', cls: 'chip-talk' },
  { when: '2026-09-30 11:05', who: '박성훈 AFPK', what: '목표 주택가격', from: '6.5억원', to: '6억원', why: '신혼부부 구입자금 상한에 맞춤', state: '반영됨', cls: 'chip-agree' },
  { when: '2026-09-28 16:42', who: '박성훈 AFPK', what: '카드 10장 최초 설정', from: '—', to: 'v1', why: '설계안 확정', state: '반영됨', cls: 'chip-agree' },
]

export default function History() {
  return (
    <div className="console">
      <Rail />
      <main className="work">
        <h1 className="work-title">변경 이력</h1>
        <p className="meta">카드 값은 덮어쓰지 않습니다. 모든 버전이 남습니다.</p>
        <div style={{ marginTop: 22 }}>
          {LOG.map((l, i) => (
            <div className="qcard" key={i}>
              <div className="queue-top">
                <span style={{ fontSize: 15, fontWeight: 700 }}>{l.what}</span>
                <span className={`chip ${l.cls}`}>{l.state}</span>
                <span className="queue-couple">{l.when} · {l.who}</span>
              </div>
              <dl className="pair" style={{ gridTemplateColumns: '60px 1fr' }}>
                <dt className="meta">이전</dt><dd style={{ color: 'var(--muted)' }}>{l.from}</dd>
                <dt className="meta">이후</dt><dd>{l.to}</dd>
                <dt className="meta">이유</dt><dd>{l.why}</dd>
              </dl>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
