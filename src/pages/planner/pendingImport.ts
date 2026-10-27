/**
 * "재무설계 엑셀로 새 부부 등록" → 등록 직후 질문 카드 화면이 그 파일을 바로 읽게 넘겨주는 자리 (10.27).
 * 파일은 이 탭의 메모리에만 있다 — 서버로 가지 않는다. 한 번 꺼내면 비운다.
 */
let pending: File | null = null
export const setPendingImport = (f: File | null) => { pending = f }
export function takePendingImport(): File | null { const f = pending; pending = null; return f }
