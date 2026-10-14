import { describe, it, expect } from 'vitest'
import { isAuthError, isRetryable } from '../errors'

/** 실제로 받은 메시지들. 새로운 실패 형태를 만나면 여기 한 줄 추가하고 고친다. */
const AUTH_401 = 'LLM 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'

describe('LLM 실패 분류', () => {
  it('인증 실패는 재시도 대상이 아니다 — 60번 더 해도 같다', () => {
    expect(isAuthError(AUTH_401)).toBe(true)
    expect(isRetryable(AUTH_401)).toBe(false)
    expect(isAuthError('LLM 403: forbidden')).toBe(true)
  })

  it('일시적 실패는 재시도한다', () => {
    expect(isRetryable('LLM 429: rate limited')).toBe(true)
    expect(isRetryable('LLM 529: overloaded')).toBe(true)
    expect(isRetryable('LLM 500: internal')).toBe(true)
    expect(isRetryable('fetch failed')).toBe(true)
    expect(isRetryable('socket hang up')).toBe(true)
  })

  it('출력 형식 오류는 재시도하지 않는다 — 프롬프트 문제다', () => {
    const malformed = 'LLM 출력 형식 오류: {"aVsPlan":"yes"}'
    expect(isRetryable(malformed)).toBe(false)
    expect(isAuthError(malformed)).toBe(false)
  })

  it('본문에 섞인 숫자를 상태 코드로 오해하지 않는다', () => {
    expect(isAuthError('LLM 출력에 JSON 없음: 연봉이 401만원 오른다고 합니다')).toBe(false)
    expect(isRetryable('LLM 출력에 JSON 없음: 저축액은 500만원입니다')).toBe(false)
  })
})
