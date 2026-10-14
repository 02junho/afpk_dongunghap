/**
 * LLM 호출 실패의 분류. eval 러너와 (나중에) 서버 판정이 같은 기준을 쓴다.
 *
 *   인증 실패  → 재시도해도 소용없다. 즉시, 읽을 수 있게 끝낸다
 *   일시적 실패 → 물러나며 재시도. 그래도 안 되면 그 행만 버리고 계속한다
 *   그 외      → 재시도하지 않는다 (예: 출력 형식 오류 — 프롬프트 문제다)
 *
 * 상태 코드는 **우리가 만든 접두사에서만** 읽는다 (`text-llm.ts` 의 `LLM <status>: ...`).
 * 본문 아무 데서나 숫자를 찾으면 "연봉이 401만원 오른다"를 인증 실패로 읽는다.
 * 한국어 답변이 그대로 에러 메시지에 실려 오므로 실제로 일어날 수 있는 일이다.
 */
const status = (m: string): number | null => {
  const hit = m.match(/^LLM (\d{3}):/)
  return hit ? Number(hit[1]) : null
}

export const isAuthError = (m: string) => {
  const s = status(m)
  return s === 401 || s === 403
}

export const isRetryable = (m: string) => {
  const s = status(m)
  if (s !== null) return s === 408 || s === 429 || s >= 500
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(m)
}
