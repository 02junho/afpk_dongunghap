import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadRoundInfo } from '../../lib/db'
import { loadMe } from '../../lib/session'
import { WEEKS, themeOfWeek } from '../../data/template'

/** 결과 화면을 대신한다. 부부는 판정도 상대 답도 보지 않는다 — 앱은 듣고, 설계사가 말한다. 11.04: 다음 주 테마를 알려 준다 */
export default function Done() {
  const { id = 'baseline' } = useParams()
  const nav = useNavigate()
  const me = loadMe()
  const [info, setInfo] = useState<{ kind: string; count: number; week: number | null }>({ kind: 'baseline', count: 5, week: me.live ? null : 1 })

  useEffect(() => {
    if (!me.live) return
    loadRoundInfo(id).then(r => r && setInfo(r)).catch(() => {})
  }, [id, me.live])


  return (
    <main className="phone">
      <div className="phone-top">
        <h1 className="wordmark"><span className="pair-mark"><span className="p p-him" /><span className="p p-her" /></span>돈궁합</h1>
        <p className="meta">{info.week ? `${info.week}주차 · ${themeOfWeek(info.week).label}` : '맞춰보기'}</p>
      </div>
      <div className="phone-body">
        <div className="done-mark"><span className="pair-mark lg"><span className="p p-him" /><span className="p p-her" /></span></div>
        <h2 className="q" style={{ textAlign: 'center' }}>두 분 답변이<br />설계사님께 전달됐어요</h2>
        {info.week && (
          <div className="bubble" style={{ marginTop: 32 }}>
            <p className="meta">다음 질문</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700 }}>
              {info.week < WEEKS ? `다음 주에 ${themeOfWeek(info.week + 1).label} 질문이 열려요` : '6주 질문이 모두 끝났어요. 설계사님이 상담을 요청할 거예요'}
            </p>
          </div>
        )}
      </div>
      <button className="btn btn-wide" onClick={() => nav('/c/home')}>내 설계 보러 가기</button>
    </main>
  )
}
