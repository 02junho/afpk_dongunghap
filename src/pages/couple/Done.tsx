import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadRoundInfo } from '../../lib/db'
import { loadMe } from '../../lib/session'
import { CHECK_MONTHS, addMonths, formatKDate } from '../../lib/cycle'

const KIND_LABEL: Record<string, string> = { baseline: '첫 맞춰보기', factcheck: '먼저 묻기', regular: '정기 맞춰보기', event: '수시' }

/** 결과 화면을 대신한다. 부부는 판정도 상대 답도 보지 않는다 — 앱은 듣고, 설계사가 말한다. */
export default function Done() {
  const { id = 'baseline' } = useParams()
  const nav = useNavigate()
  const me = loadMe()
  const [info, setInfo] = useState<{ kind: string; count: number }>({ kind: 'baseline', count: 3 })

  useEffect(() => {
    if (!me.live) return
    loadRoundInfo(id).then(r => r && setInfo(r)).catch(() => {})
  }, [id, me.live])


  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <p className="meta">{KIND_LABEL[info.kind] ?? info.kind}</p>
      </div>
      <div className="phone-body">
        <div className="done-mark"><span className="pair-mark lg"><span className="p p-him" /><span className="p p-her" /></span></div>
        <h2 className="q" style={{ textAlign: 'center' }}>두 분 답변이<br />설계사님께 전달됐어요</h2>
        <div className="bubble" style={{ marginTop: 32 }}>
          <p className="meta">다음 맞춰보기</p>
          {/* 10.23 Q11·Q12: 고정 날짜("11월 둘째 주") 대신 오늘 + 정기 주기. 없는 기능을 약속하던 문구는 뺐다 */}
          <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{formatKDate(addMonths(new Date(), CHECK_MONTHS))}쯤이에요</p>
        </div>
      </div>
      <button className="btn btn-wide" onClick={() => nav('/c/home')}>내 설계 보러 가기</button>
    </main>
  )
}
