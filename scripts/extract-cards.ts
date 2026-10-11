/**
 * [선택] 설계안 문서(md/txt) → 카드 초안 JSON. AI 활용 3번.
 * 출력은 초안이다. 설계사가 /p/cards 에서 검수·확정하기 전엔 앱에 들어가지 않는다.
 *   LLM_API_KEY=... LLM_MODEL=... npm run extract-cards -- ./설계안.md > draft.json
 */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) { console.error('사용법: npm run extract-cards -- <파일>'); process.exit(1) }
const doc = readFileSync(path, 'utf8')

const prompt = `다음은 재무설계사가 작성한 부부 재무설계안입니다. 이 설계안이 기대고 있는 "전제"를 카드로 추출하세요.
전제란: 이 값이 바뀌면 설계안의 결론이 바뀌는 사실·계획입니다 (시점, 금액, 선택, 계획).
각 카드는 type을 number/date/choice/text 중 하나로 두고, 부부에게 물어볼 자연스러운 한국어 질문(question)과,
이 전제가 흔들리면 무엇이 무너지는지(stake)를 적습니다. 숫자는 원 단위 정수, 시점은 YYYY-MM.
JSON 배열만 출력하세요. 최대 20장.

[설계안]
${doc}`

const res = await fetch(`${process.env.LLM_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': process.env.LLM_API_KEY!, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: process.env.LLM_MODEL, max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
})
const data = await res.json()
const text = data.content?.map((c: any) => c.text ?? '').join('') ?? ''
const m = text.match(/\[[\s\S]*\]/)
console.log(m ? m[0] : text)
