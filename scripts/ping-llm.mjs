/**
 * LLM 연결 확인. 키·모델·계정 설정이 맞는지 가장 싼 호출 한 번으로 본다.
 *   set -a && source .env && set +a && npm run ping
 * eval 을 돌리기 전에 이걸로 먼저 막힌 곳을 찾는다. 키 값은 절대 출력하지 않는다.
 */
import Anthropic from '@anthropic-ai/sdk'

const key = process.env.LLM_API_KEY
const model = process.env.LLM_MODEL
if (!key) { console.error('✗ LLM_API_KEY 없음 — .env 를 source 했는지 확인'); process.exit(1) }
if (!model) { console.error('✗ LLM_MODEL 없음 — 예: LLM_MODEL=claude-sonnet-5-5'); process.exit(1) }
const ws = process.env.LLM_WORKSPACE_ID
console.log(`키 접두사 ${key.slice(0, 11)}… (${key.length}자) · 모델 ${model}${ws ? ` · 워크스페이스 ${ws.slice(0, 12)}…` : ''}`)
if (key.startsWith('sk-ant-usr-') && !ws)
  console.warn('⚠ 사용자 키(sk-ant-usr-)는 LLM_WORKSPACE_ID 가 필요합니다. 또는 워크스페이스 키(sk-ant-api03-)를 발급하세요.')

const client = new Anthropic({
  apiKey: key,
  baseURL: process.env.LLM_BASE_URL,
  defaultHeaders: ws ? { 'anthropic-workspace-id': ws } : undefined,
})
try {
  const r = await client.messages.create({
    model,
    max_tokens: 50,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: '한 단어로 답하세요: 안녕?' }],
  })
  const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('')
  console.log(`✓ 연결됨 · stop=${r.stop_reason} · 입력 ${r.usage.input_tokens} / 출력 ${r.usage.output_tokens} 토큰`)
  console.log(`  답: ${text.trim().slice(0, 60)}`)
} catch (e) {
  console.error(`✗ 실패 (HTTP ${e.status ?? '-'})`)
  console.error(`  ${String(e.message).split(key).join('<키>')}`)
  process.exit(1)
}
