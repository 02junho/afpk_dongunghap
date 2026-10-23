import { normalizeNewCard, type NewCard } from '../lib/card-form'

/**
 * AI 활용 3번: 재무제표 엑셀에서 질문 카드 초안 뽑기 (10.23 팀 결정 Q3). 버전은 judge/prompt.ts 의 PROMPT_VERSIONS.extract.
 *
 * AI 가 하는 일은 분류(어느 주제·형태의 카드인가)와 옮겨 적기뿐이다. 지키는 선:
 *   · 엑셀에 적힌 값만 옮긴다. 새 숫자를 계산하지 않는다 ("3년 뒤"를 날짜로 바꾸는 것도 계산 — 값을 비우고 설계사에게)
 *   · 카드마다 출처(시트·셀). 출처 없는 카드는 버린다
 *   · 엑셀 안에서 값이 서로 다르면 값을 비우고 메모에 두 값을 남긴다. 추측하지 않는다
 *   · 초안일 뿐 — 설계사가 확인하고 고른 카드만 저장된다 (자동 반영 없음)
 */
export function buildExtractPrompt(sheetText: string): string {
  return `당신은 재무설계사를 돕는 보조 도구입니다. 재무 조언과 계산은 하지 않습니다.
아래는 설계사가 정리한 고객 상담 기록·재무제표 엑셀을 글로 옮긴 것입니다. 각 줄 앞의 [시트명 셀]이 출처입니다.

할 일: 이 부부의 재무설계가 기대고 있는 "전제"를 질문 카드로 뽑으세요.
전제란 — 바뀌면 설계의 결론이 바뀌고, 남편과 아내가 서로 다르게 알고 있을 수 있고, 서류로는 확인되지 않는 앞으로의 계획·선택·시점·금액입니다.
예: 이사·내 집 마련 시점, 전세 보증금 목표, 부모님 지원금과 그 성격(증여인지 빌리는 것인지), 출산 시점, 출산 뒤 일을 쉬는 기간, 은퇴 나이, 함께 모은 돈의 운용 방식.
지금의 사실(예금 잔액, 지난 1년 지출, 현재 보험료)은 카드가 아닙니다.

규칙
1. 엑셀에 적힌 값만 옮깁니다. 계산해서 새 숫자나 날짜를 만들지 않습니다.
2. 모든 카드에 source 를 적습니다 (예: "01. 상담 내용 D6"). 출처를 댈 수 없으면 그 카드는 만들지 않습니다.
3. 엑셀 안에서 같은 항목의 값이 서로 다르거나(예: 희망 지역이 두 곳) 정해지지 않았으면 plannedValue 를 "" 로 두고, note 에 각 값과 출처를 적습니다. 추측하지 않습니다.
4. type 고르기
   - 시점: "date". plannedValue 는 엑셀에 연·월이 그대로 있을 때만 "YYYY-MM". "3년 뒤", "6~7년 이내"처럼 상대적이면 plannedValue 는 "" 로 두고 note 에 원문을 적습니다 (날짜로 바꾸는 건 설계사가 합니다).
   - 금액: "number", unit "krw". plannedValue 는 엑셀 표기를 단위와 함께 그대로 씁니다 (예: "3억", "1억 원", "6,700만원"). 표에 "(단위: 만원)"처럼 단위가 따로 적혀 있으면 숫자 뒤에 그 단위를 붙입니다 ("6700" → "6700만원"). 원 단위로 바꾸는 일은 앱이 합니다. 단위를 알 수 없으면 "".
   - 나이: "number", unit "age" (예: "60").
   - 보기 중 하나를 고르는 것: "choice". options 2~5개, plannedValue 는 그중 하나.
   - 그 밖의 서술: "text". plannedValue 는 엑셀 문구를 짧게 옮긴 한 문장.
5. category 는 housing(주거) · income(소득·직업) · children(출산·양육) · family(양가 지원) · saving(저축·투자) · insurance(보험) · retire(은퇴·노후) · tax(세금) 중 하나.
6. label 은 12자 안의 카드 이름. question 은 부부에게 묻는 존댓말 한 문장. stake 는 이 전제가 흔들리면 무엇이 무너지는지 한 문장 — 엑셀의 체크사항·고민에서 옮기고, 엑셀에 없는 숫자는 쓰지 않습니다.
7. 최대 15장, 설계에 중요한 순서로.

출력은 JSON 배열 하나만. 다른 말은 쓰지 않습니다.
[{"category":"housing","type":"date","unit":null,"label":"…","question":"…","plannedValue":"","options":null,"stake":"…","source":"01. 상담 내용 D8","note":"엑셀 원문: 6~7년 이내"}]

<엑셀>
${sheetText}
</엑셀>`
}

export interface ExtractDraft {
  /** 검사를 통과한 카드. 값이 비었거나 형식이 틀리면 없음 → 설계사가 채워야 저장할 수 있다 */
  card?: NewCard
  /** 원본 (화면에서 고칠 때 시작값) */
  raw: { category: string; type: string; unit: string | null; label: string; question: string; plannedValue: string; options: string[] | null; stake: string }
  source: string
  note: string
  /** 저장 못 하는 이유 — 값 없음, 형식 오류 등 */
  problem?: string
}

/** AI 출력 → 초안 목록. 출처 없는 것은 버리고, 나머지는 card-form 규칙으로 검사한다 */
export function parseExtractOutput(text: string): { drafts: ExtractDraft[]; dropped: number } {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) throw new Error(`AI 출력에 카드 목록(JSON)이 없습니다: ${text.slice(0, 120)}`)
  let arr: unknown
  try { arr = JSON.parse(m[0]) } catch { throw new Error('AI 출력의 JSON 을 읽지 못했습니다') }
  if (!Array.isArray(arr)) throw new Error('AI 출력이 배열이 아닙니다')
  const drafts: ExtractDraft[] = []
  let dropped = 0
  for (const o of arr.slice(0, 20) as any[]) {
    const source = String(o?.source ?? '').trim()
    if (!source) { dropped++; continue }   // 출처 없는 카드는 버린다
    // AI 가 형태를 조금 다르게 적어도 맞춘다 ("age" → 나이, "amount" → 금액). 판단이 아니라 표기 정리
    let type = String(o.type ?? 'text').toLowerCase(), unit = o.unit ? String(o.unit).toLowerCase() : null
    if (type === 'age') { type = 'number'; unit = 'age' }
    else if (['amount', 'money', 'krw', 'won'].includes(type)) { type = 'number'; unit = 'krw' }
    else if (type === 'number' && !unit) unit = 'krw'
    const raw = {
      category: String(o.category ?? '').toLowerCase(), type, unit,
      label: String(o.label ?? '').slice(0, 40), question: String(o.question ?? ''), plannedValue: String(o.plannedValue ?? ''),
      options: Array.isArray(o.options) ? o.options.map(String) : null, stake: String(o.stake ?? ''),
    }
    const r = normalizeNewCard({ ...raw, tolerance: null })
    drafts.push(r.ok
      ? { card: r.card, raw, source, note: String(o.note ?? '') }
      : { raw, source, note: String(o.note ?? ''), problem: raw.plannedValue ? r.error : '값이 비어 있습니다 — 엑셀 원문을 보고 채워 주세요' })
  }
  return { drafts, dropped }
}
