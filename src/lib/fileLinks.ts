/**
 * 설계사 컴퓨터의 엑셀 파일 "연결" (11.04, docs/16). 다시 올리지 않고 "다시 읽기"만 누르게 한다.
 *
 * 브라우저의 파일 연결 기능(File System Access)을 쓴다 — 크롬 · 엣지 **컴퓨터**에서만 된다.
 * 연결 정보(파일 손잡이)는 이 브라우저의 IndexedDB 에만 남는다. 파일 내용은 서버로 가지 않는다
 * (표는 브라우저에서 규칙으로 읽는다). 브라우저를 다시 켜면 "이 파일을 읽어도 될까요?"를 한 번 더 묻는다.
 * 안 되는 브라우저에서는 지금처럼 파일을 골라 올리면 된다 — 바뀐 것만 반영은 그쪽도 같다.
 */
import type { SheetKind } from '../extract/names'
import type { ImportFiles } from '../pages/planner/pendingImport'

interface Handle {
  name: string
  getFile(): Promise<File>
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>
}

const DB = 'dongunghap-files', STORE = 'links'

export const canLinkFiles = () => typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'indexedDB' in window

function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((ok, no) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => ok(req.result)
    req.onerror = () => no(req.error)
  })
}

const keyOf = (coupleId: string, kind: SheetKind) => `${coupleId}:${kind}`

/** 이 부부에 연결된 파일 이름 (없으면 빈 객체) */
export async function linkedNames(coupleId: string): Promise<Partial<Record<SheetKind, string>>> {
  if (!canLinkFiles()) return {}
  const out: Partial<Record<SheetKind, string>> = {}
  for (const kind of ['statement', 'cashflow'] as const) {
    const h = await tx<Handle | undefined>('readonly', s => s.get(keyOf(coupleId, kind))).catch(() => undefined)
    if (h) out[kind] = h.name
  }
  return out
}

/** 파일 고르기 창을 열어 연결한다. 고른 파일도 바로 돌려준다 (그대로 읽으면 된다) */
export async function linkFile(coupleId: string, kind: SheetKind): Promise<File | null> {
  const pick = (window as unknown as { showOpenFilePicker: (o: unknown) => Promise<Handle[]> }).showOpenFilePicker
  let handles: Handle[]
  try {
    handles = await pick({ multiple: false, types: [{ description: '엑셀', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] } }] })
  } catch { return null }   // 창을 닫음
  const h = handles[0]
  await tx('readwrite', s => s.put(h, keyOf(coupleId, kind)))
  return h.getFile()
}

export async function unlinkFile(coupleId: string, kind: SheetKind) {
  await tx('readwrite', s => s.delete(keyOf(coupleId, kind))).catch(() => {})
}

/**
 * 연결된 파일을 지금 내용으로 다시 읽는다. **버튼을 누른 그 자리에서** 불러야 한다
 * (읽기 허락을 묻는 창은 사용자가 막 누른 직후에만 뜬다).
 */
export async function readLinked(coupleId: string): Promise<ImportFiles> {
  const out: ImportFiles = {}
  for (const kind of ['statement', 'cashflow'] as const) {
    const h = await tx<Handle | undefined>('readonly', s => s.get(keyOf(coupleId, kind))).catch(() => undefined)
    if (!h) continue
    let perm = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted'
    if (perm !== 'granted') perm = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied'
    if (perm !== 'granted') throw new Error(`"${h.name}" 파일을 읽도록 허락해 주세요`)
    try { out[kind] = await h.getFile() }
    catch { throw new Error(`"${h.name}" 파일을 찾지 못했습니다. 옮기거나 이름을 바꿨으면 다시 연결해 주세요`) }
  }
  return out
}
