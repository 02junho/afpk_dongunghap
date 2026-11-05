/**
 * AI 활용 3번 (11.04 새 방향): 재무설계 결과(Word · PDF) 글에서 질문 틀 30칸의 계획 값을 찾는다.
 * 버전은 judge/prompt.ts 의 PROMPT_VERSIONS.extract.
 *
 * AI 가 하는 일은 "찾아서 그대로 옮겨 적기"뿐이다. 지키는 선:
 *   · 문서에 적힌 글을 그대로 옮긴다 (found). 계산 · 단위 바꾸기 · 상대 시점을 날짜로 바꾸기를 하지 않는다
 *   · 근거 문장(quote)을 문서에서 그대로 따온다. quote 가 문서에 없으면 앱이 "원문에서 찾지 못함"으로 표시한다
 *   · 없거나 애매하면 null. 짐작하지 않는다
 *   · found 를 저장 값(원 · YYYY-MM)으로 바꾸는 건 앱의 규칙(src/lib/plan-values.ts)이 한다
 *   · 설계사가 값마다 원문과 대조해 확인한 것만 저장된다 (자동 반영 없음)
 */
import { SLOTS, themeOfWeek, type Slot } from '../data/template'
import { planValue } from '../lib/plan-values'

export function buildPlanPrompt(docText: string, slots: Slot[] = SLOTS): string {
  const list = slots.map(s => {
    const form = s.type === 'choice' ? `보기 중 하나: ${s.options!.join(' / ')}`
      : s.type === 'date' ? '연 · 월' : s.type === 'text' ? '짧은 한 문장' : s.unit === 'krw' ? '금액' : s.unit === 'age' ? '나이' : s.unit === 'percent' ? '비율(%)' : '개수'
    return `- ${s.key} [${themeOfWeek(s.week).label}] ${s.find} (${form})`
  }).join('\n')
  return `당신은 재무설계사를 돕는 보조 도구입니다. 재무 조언과 계산은 하지 않습니다.
아래 <재무설계> 는 설계사가 고객 부부에게 만든 재무설계 결과 문서(Word 또는 PDF)를 글로 옮긴 것입니다. PDF 에서 옮긴 글은 줄바꿈 · 띄어쓰기가 원래와 다를 수 있습니다.

할 일: 아래 항목마다, 문서에 적힌 "이 부부가 정한 계획 값"을 찾아 그대로 옮겨 적으세요.

규칙
1. 문서에 적힌 표기를 그대로 옮깁니다 (예: "3억 원", "2032년 6월", "만 60세", "월 50만원"). 계산하거나 단위를 바꾸지 않습니다.
2. "3년 뒤", "6~7년 안"처럼 상대적이거나 범위인 시점은 날짜로 바꾸지 말고 found 에 문서 표기 그대로 적습니다.
3. 보기가 있는 항목은 문서 내용이 보기 하나에 분명히 해당할 때만 그 보기를 적습니다. 애매하면 null.
4. 항목마다 근거 문장(quote)을 문서에서 한 글자도 바꾸지 말고 따옵니다 (40자 안팎). 근거가 없으면 found 와 quote 모두 null.
5. 문서 안에서 같은 항목의 값이 서로 다르면 found 는 null, note 에 두 값을 적습니다. 짐작하지 않습니다.
6. 지금의 사실(예금 잔액, 지난해 지출)과 앞으로의 계획을 헷갈리지 않습니다. 계획 값만 찾습니다.

항목
${list}

출력은 JSON 배열 하나만. 항목마다 한 줄, 다른 말은 쓰지 않습니다.
[{"key":"t1_buy_when","found":"2032년 6월","quote":"내 집 마련은 2032년 6월을 목표로","note":""}]

<재무설계>
${docText}
</재무설계>`
}

export interface PlanFind {
  key: string
  /** AI 가 문서에서 옮긴 글 (없으면 null) */
  found: string | null
  quote: string | null
  note: string
  /** quote 가 문서 안에 실제로 있는가 (띄어쓰기 무시) */
  quoteInDoc: boolean
  /** 앱 규칙으로 바꾼 저장 값. 못 바꾸면 없음 → 설계사가 채운다 */
  value?: string
  problem?: string
}

const squash = (s: string) => s.replace(/\s+/g, '')

/** AI 출력 → 칸마다 찾은 값. 틀에 없는 key 는 버린다. 값은 plan-values 규칙으로만 바꾼다 */
export function parsePlanOutput(text: string, docText: string, slots: Slot[] = SLOTS): PlanFind[] {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) throw new Error(`AI 출력에 목록(JSON)이 없습니다: ${text.slice(0, 120)}`)
  let arr: unknown
  try { arr = JSON.parse(m[0]) } catch { throw new Error('AI 출력의 JSON 을 읽지 못했습니다') }
  if (!Array.isArray(arr)) throw new Error('AI 출력이 배열이 아닙니다')
  const doc = squash(docText)
  const out: PlanFind[] = []
  for (const s of slots) {
    const o = (arr as any[]).find(x => x && x.key === s.key) ?? {}
    const found = typeof o.found === 'string' && o.found.trim() ? o.found.trim().slice(0, 200) : null
    const quote = typeof o.quote === 'string' && o.quote.trim() ? o.quote.trim().slice(0, 300) : null
    const quoteInDoc = !!quote && doc.includes(squash(quote))
    const f: PlanFind = { key: s.key, found, quote, note: typeof o.note === 'string' ? o.note.slice(0, 200) : '', quoteInDoc }
    if (found) {
      const v = planValue(s, found)
      if (v.ok) f.value = v.value
      else f.problem = v.error
      if (!quoteInDoc) f.problem = f.problem ? `${f.problem} · 원문에서 근거를 찾지 못함` : '원문에서 근거를 찾지 못함'
    }
    out.push(f)
  }
  return out
}
