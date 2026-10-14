/**
 * [선택] 설계안 문서(md/txt) → 카드 초안 JSON. AI 활용 3번.
 * 출력은 초안이다. 설계사가 /p/cards 에서 검수·확정하기 전엔 앱에 들어가지 않는다.
 *   LLM_API_KEY=... LLM_MODEL=... npm run extract-cards -- ./설계안.md > draft.json
 */
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'

const path = process.argv[2]
if (!path) { console.error('사용법: npm run extract-cards -- <파일>'); process.exit(1) }
if (!process.env.LLM_API_KEY || !process.env.LLM_MODEL) {
  console.error('LLM_API_KEY / LLM_MODEL 이 필요합니다 (.env 참조)')
  process.exit(1)
}
const doc = readFileSync(path, 'utf8')

const prompt = `다음은 재무설계사가 작성한 부부 재무설계안입니다. 이 설계안이 기대고 있는 "전제"를 카드로 추출하세요.
전제란: 이 값이 바뀌면 설계안의 결론이 바뀌는 사실·계획입니다 (시점, 금액, 선택, 계획).
각 카드는 type을 number/date/choice/text 중 하나로 두고, 부부에게 물어볼 자연스러운 한국어 질문(question)과,
이 전제가 흔들리면 무엇이 무너지는지(stake)를 적습니다. 숫자는 원 단위 정수, 시점은 YYYY-MM.

필드:
  key, type, category, label, question, plannedValue, stake  (필수)
  category    housing | income | children | family | saving | insurance | retire | tax 중 하나
              (주거 / 소득·직업 / 출산·양육 / 양가 지원 / 저축·투자 / 보험 / 은퇴 / 세금)
  tolerance   number면 허용 비율(0.05 = ±5%), date면 허용 개월(6)
  unit        type=number 일 때 "krw" | "age" | "count" | "percent"  (금액이 아니면 반드시 적을 것)
  options     type=choice 일 때 선택지 배열
  allowCondition  type=date 일 때, "애 낳고 나서" 같은 조건부 답변을 허용할지 (true/false)

stake 에는 **근거가 되는 숫자**를 함께 적습니다 ("상한까지 여유 900만원" 처럼).
근거 숫자를 확인할 수 없으면 추측하지 말고 "(확인 필요)"라고 적으세요.
JSON 배열만 출력하세요. 최대 20장.

[설계안]
${doc}`

const client = new Anthropic({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
  defaultHeaders: process.env.LLM_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.LLM_WORKSPACE_ID } : undefined,
})
const res = await client.messages.create({
  model: process.env.LLM_MODEL,
  max_tokens: 16000,
  output_config: { effort: 'medium' },
  messages: [{ role: 'user', content: prompt }],
})
if (res.stop_reason !== 'end_turn') console.error(`⚠ stop_reason=${res.stop_reason}`)
const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('')
const m = text.match(/\[[\s\S]*\]/)
console.log(m ? m[0] : text)
