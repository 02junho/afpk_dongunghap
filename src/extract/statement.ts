import { read, utils, type WorkBook } from 'xlsx'
import type { CardCategory } from '../judge/types'

/**
 * 설계사가 완성한 재무설계 엑셀(재무제표 표)을 **규칙으로** 읽어 질문 카드 후보를 만든다 (10.27).
 * AI 를 쓰지 않는다 — 표 모양이 고정이라 "항목 이름 | 금액(만원)"을 그대로 읽으면 된다. 숫자를 AI 가 옮기다 틀릴 일이 없다.
 *
 *   · 한 줄에서 [글자 칸][숫자 칸]이 붙어 있으면 항목 하나 (현금흐름표 A·B / C·D, 재무상태표 F·G / H·I)
 *   · 그 위의 숫자 없는 글자 칸이 묶음 이름 (근로소득 · 저축 및 투자 · 고정지출 · 현금성자산 …)
 *   · 단위는 머리글 "금액(만원)"에서 읽는다 → 원 단위로 바꾼다 (×10,000). 계산이 아니라 단위 표기 정리
 *   · 계 · 총유입 · 총유출 · 총자산 · 순자산 · 비중(%) 줄은 카드가 아니다 — 건너뛴다
 *
 * 어떤 항목을 카드로 쓰고 어떤 주제·질문으로 묻는지는 아래 ITEM_RULES 표가 정한다 (팀이 고칠 수 있는 한 곳).
 * 표에 없는 새 항목은 묶음으로 주제만 짐작해 "고르지 않은 상태"로 보여준다 — 설계사가 판단한다.
 */

export interface StatementItem {
  sheet: string
  cell: string              // 금액 칸 (예: B4)
  table: string             // 현금흐름표 / 재무상태표
  group: string             // 근로소득 / 저축 및 투자 / 고정지출 …
  label: string             // 엑셀의 항목 이름 그대로
  value: number             // 원 단위
  unitNote: string          // "만원" 등 엑셀의 단위
}

export interface CardCandidate {
  item: StatementItem
  pick: boolean             // 기본으로 고를지 (설계가 기대는 핵심 숫자)
  category: CardCategory
  label: string             // 카드 이름
  question: string          // "어떻게 바뀌었나요?" 옆에 붙는 질문
  stake: string             // 이 계획이 바뀌면 생기는 일 (기본 문장 — 설계사가 고쳐 쓴다)
  known: boolean            // ITEM_RULES 에 있는 항목인가
}

const SKIP = /^(계|소계|합계|총유입|총유출|총자산|총부채|순자산|총부채\s*\+\s*순자산|유출 비중)$/

interface Rule { match: RegExp; table?: RegExp; pick: boolean; category: CardCategory; label: string; question: string; stake: string }

/** 카드로 만들 항목 규칙. pick: true 가 기본 선택(설계가 기대는 숫자 약 10개). 순서대로 첫 번째로 맞는 규칙을 쓴다 */
export const ITEM_RULES: Rule[] = [
  { match: /남편.*급여|남편.*연봉/, pick: true, category: 'income', label: '남편 연 급여(세전)', question: '남편분 연봉은 세전으로 얼마인가요?', stake: '소득이 바뀌면 저축 여력과 대출 한도 계산이 달라집니다' },
  { match: /아내.*(매출|소득|급여)/, pick: true, category: 'income', label: '아내 연 매출', question: '아내분 1년 매출은 얼마로 보시나요?', stake: '매출이 바뀌면 생활비 분담, 지역 건강보험료, 대출 심사가 달라집니다' },
  { match: /^적금$/, table: /현금흐름/, pick: true, category: 'saving', label: '적금 (1년)', question: '1년에 적금으로 얼마를 넣고 계세요?', stake: '저축액이 바뀌면 목표 자금을 모으는 시점이 달라집니다' },
  { match: /주식|ETF/, table: /현금흐름/, pick: true, category: 'saving', label: '주식·ETF 투자 (1년)', question: '1년에 주식·ETF에 얼마를 넣고 계세요?', stake: '투자액이 바뀌면 목표 자금과 위험 수준이 달라집니다' },
  { match: /연금저축/, table: /현금흐름/, pick: true, category: 'retire', label: '연금저축 납입 (1년)', question: '1년에 연금저축으로 얼마를 넣고 계세요?', stake: '납입액이 바뀌면 노후 준비와 세액공제 계획이 달라집니다' },
  { match: /청약/, table: /현금흐름/, pick: true, category: 'housing', label: '청약저축 납입 (1년)', question: '1년에 청약저축으로 얼마를 넣고 계세요?', stake: '납입이 바뀌면 청약 준비 계획이 달라집니다' },
  { match: /^월세$/, pick: true, category: 'housing', label: '월세 (1년)', question: '1년 월세는 얼마인가요?', stake: '주거비가 바뀌면 매달 저축 여력이 달라집니다' },
  { match: /보증금/, pick: true, category: 'housing', label: '보증금', question: '지금 집 보증금은 얼마인가요?', stake: '보증금이 바뀌면 이사·전세 자금 계획이 달라집니다' },
  { match: /할부\s*잔액|대출\s*잔액|잔액$/, table: /재무상태/, pick: true, category: 'debt', label: '', question: '남은 금액은 얼마인가요?', stake: '부채가 바뀌면 대출 심사와 매달 갚는 부담이 달라집니다' },
  { match: /보장성\s*보험/, pick: true, category: 'insurance', label: '보장성 보험료 (1년)', question: '1년 보장성 보험료는 얼마인가요?', stake: '보험료가 바뀌면 보험 재설계 범위가 달라집니다' },
]

/** 항목·묶음 이름으로 주제만 짐작 (규칙에 없는 새 항목용). 기본 선택은 하지 않는다 — 설계사가 고른다 */
function categoryOfGroup(group: string, table: string, label = ''): CardCategory {
  if (/국민연금|퇴직연금|IRP|연금/.test(label)) return 'retire'
  if (/건강보험|고용보험|보험/.test(label)) return 'insurance'
  if (/세금|소득세|지방소득세/.test(label)) return 'tax'
  if (/자동차|차량|할부|대출|학자금/.test(label)) return 'debt'
  if (/보증금|관리비|주택|청약/.test(label)) return 'housing'
  if (/소득/.test(group)) return 'income'
  if (/저축|투자|현금성|금융/.test(group)) return 'saving'
  if (/부채/.test(group)) return 'debt'
  if (/사용자산/.test(group)) return 'housing'
  if (/지출/.test(group)) return 'debt'
  return /재무상태/.test(table) ? 'saving' : 'debt'
}

export function readStatement(wb: WorkBook): StatementItem[] {
  const out: StatementItem[] = []
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet]
    if (!ws['!ref']) continue
    const range = utils.decode_range(ws['!ref'])
    const at = (r: number, c: number) => ws[utils.encode_cell({ r, c })]
    const text = (r: number, c: number) => { const x = at(r, c); return x && typeof x.v === 'string' ? x.v.trim() : '' }
    const num = (r: number, c: number) => { const x = at(r, c); return x && typeof x.v === 'number' ? x : null }
    // 표 이름(현금흐름표/재무상태표): 열마다 위에서 가장 가까운 "…표" 글자
    const tableOf = (r: number, c: number) => {
      for (let rr = r; rr >= range.s.r; rr--) for (let cc = c; cc >= Math.max(range.s.c, c - 4); cc--) {
        const t = text(rr, cc); if (/표$/.test(t)) return t
      }
      return ''
    }
    // 단위: 위쪽 머리글의 "(만원)" 같은 표기
    const unitOf = (r: number, c: number) => {
      for (let rr = r; rr >= range.s.r; rr--) { const m = text(rr, c).match(/\((만원|천원|원)\)/); if (m) return m[1] }
      return '만원'
    }
    const groupAt: Record<number, string> = {}
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const label = text(r, c)
        if (!label) continue
        const n = num(r, c + 1)
        if (!n) { if (!/항목|금액/.test(label) && !/표$/.test(label)) groupAt[c] = label; continue }   // 묶음 이름
        if (SKIP.test(label) || /비중/.test(groupAt[c] ?? '') || /%/.test(String(n.w ?? n.z ?? ''))) continue
        const unitNote = unitOf(r, c + 1)
        const mult = unitNote === '만원' ? 10_000 : unitNote === '천원' ? 1_000 : 1
        out.push({ sheet, cell: utils.encode_cell({ r, c: c + 1 }), table: tableOf(r, c), group: groupAt[c] ?? '', label, value: Math.round(Number(n.v) * mult), unitNote })
      }
    }
  }
  return out
}

export function toCandidates(items: StatementItem[]): CardCandidate[] {
  return items.map(item => {
    const rule = ITEM_RULES.find(r => r.match.test(item.label) && (!r.table || r.table.test(item.table)))
    if (rule) return { item, pick: rule.pick, category: rule.category, label: rule.label || item.label, question: rule.question, stake: rule.stake, known: true }
    return {
      item, pick: false, category: categoryOfGroup(item.group, item.table, item.label), label: item.label.slice(0, 40),
      question: `${item.label}은(는) 얼마로 생각하세요?`, stake: '', known: false,
    }
  })
}

/** 브라우저: 엑셀 파일 → 카드 후보. 표 모양이 아니면 빈 배열 (그때는 AI 로 상담 내용을 읽는 길로) */
export function statementCandidates(data: ArrayBuffer): CardCandidate[] {
  return toCandidates(readStatement(read(data, { type: 'array' })))
}

export { namesFromFilename } from './names'
