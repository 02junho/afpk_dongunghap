/**
 * "재무설계 엑셀로 새 부부 등록" → 등록 직후 질문 카드 화면이 그 파일을 바로 읽게 넘겨주는 자리 (10.27).
 * 파일은 이 탭의 메모리에만 있다 — 서버로 가지 않는다.
 * 꺼낼 때(peek) 비우지 않고, 화면이 열린 뒤(clear) 비운다 — React 개발 모드는 첫 렌더를 두 번 돌려서,
 * 꺼내면서 비우면 두 번째에 빈 값을 받는다 (10.27 브라우저 확인).
 */
let pending: File | null = null
export const setPendingImport = (f: File | null) => { pending = f }
export const peekPendingImport = (): File | null => pending
export const clearPendingImport = () => { pending = null }
