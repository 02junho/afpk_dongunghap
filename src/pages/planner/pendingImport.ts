/**
 * 새 부부 등록에서 고른 재무설계 Word 파일을 질문 틀 화면으로 넘기는 자리 (11.04).
 * File 은 sessionStorage 에 못 넣으니 메모리에만 — 새로고침하면 사라진다 (그럼 질문 틀 화면에서 다시 고른다).
 */
let pending: File | null = null
export const setPendingWord = (f: File | null) => { pending = f }
export const peekPendingWord = () => pending
export const clearPendingWord = () => { pending = null }
