/**
 * 설계사 콘솔 공통: 설계사 코드(임시 인증)와 선택한 커플 컨텍스트. sessionStorage + 모듈 단위 구독.
 * Rail 과 각 화면이 같은 값을 봐야 하므로(레일에서 코드를 넣으면 화면이 바로 바뀌게) 작은 공유 저장소로 묶는다.
 * live(Supabase env 있음)가 아니면 전부 데모 데이터로 돈다.
 */
import { useCallback, useEffect, useState } from 'react'
import { PLANNER_PASS_KEY, plannerApi } from '../../lib/api'
import { isLive } from '../../lib/db'

const COUPLE_KEY = 'planner:couple'

/**
 * 화면을 옮길 때 예시 데이터나 빈 화면이 잠깐 보였다가 바뀌지 않게 (11.14 직접 써 보다 발견).
 * 마지막으로 받은 값을 기억해 두었다가 먼저 그리고, 새로 받은 값으로 조용히 바꾼다. 새로고침하면 비워진다.
 * 1분이 지난 값은 쓰지 않는다 — 오래된 화면(예: 몇 분 전 진행 상황)이 보였다가 바뀌는 것도 '이전 내용'처럼 보이므로.
 */
const FRESH_MS = 60_000
const memo = new Map<string, { v: unknown; at: number }>()
export function remembered<T>(key: string): T | undefined {
  const m = memo.get(key)
  return m && Date.now() - m.at < FRESH_MS ? (m.v as T) : undefined
}
export function remember<T>(key: string, v: T): T { memo.set(key, { v, at: Date.now() }); return v }

export interface CoupleRow {
  id: string
  label: string
  code: string
  husband: string
  wife: string
  state: string
  lastAt: string | null
  pending: number
  /** 지운(보관한) 부부면 그 시각 */
  archivedAt?: string | null
}

export const DEMO_COUPLE: CoupleRow = { id: '00000000-0000-0000-0000-000000000010', label: '김현우 · 박지우', code: '482913', husband: '현우', wife: '지우', state: '첫 맞춰보기 완료', lastAt: null, pending: 2 }

export function loadCouple(): CoupleRow {
  try { const raw = localStorage.getItem(COUPLE_KEY); if (raw) return JSON.parse(raw) } catch { /* 무시 */ }
  return DEMO_COUPLE
}

// ── 공유 저장소 (localStorage: 설계사 노트북에서 탭을 새로 열어도 유지) ──────
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())
const readPass = () => localStorage.getItem(PLANNER_PASS_KEY) ?? ''

export function setPlannerPass(p: string) {
  if (p) localStorage.setItem(PLANNER_PASS_KEY, p)
  else localStorage.removeItem(PLANNER_PASS_KEY)
  notify()
}
export function setPlannerCouple(c: CoupleRow) {
  localStorage.setItem(COUPLE_KEY, JSON.stringify(c))
  notify()
}

export function usePlanner() {
  const live = isLive()
  const [pass, setPassState] = useState(readPass)
  const [couple, setCoupleState] = useState<CoupleRow>(loadCouple)

  useEffect(() => {
    const sync = () => { setPassState(readPass()); setCoupleState(loadCouple()) }
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])

  const ready = !live || !!pass
  const setPass = useCallback((p: string) => setPlannerPass(p), [])
  const clearPass = useCallback(() => setPlannerPass(''), [])
  const setCouple = useCallback((c: CoupleRow) => setPlannerCouple(c), [])

  /** API 호출. 코드가 틀리면 코드를 지워 다시 묻게 한다 */
  const call = useCallback(async <T = any>(action: string, params: Record<string, unknown> = {}) => {
    try {
      return await plannerApi<T>(action, { coupleId: couple.id, ...params })
    } catch (e) {
      if ((e as Error).message.includes('틀립니다')) setPlannerPass('')
      throw e
    }
  }, [couple.id])

  return { live, ready, pass, setPass, clearPass, couple, setCouple, call }
}

/** 사이드바 '처리 대기' 숫자 — live 면 DB, 아니면 데모 */
export function useQueueCount(p: ReturnType<typeof usePlanner>, fallback: number) {
  const live = p.live && !!p.pass
  const key = `count:${p.couple.id}`
  // 실제 화면에서는 예시 숫자를 먼저 보이지 않는다 — 기억한 숫자, 없으면 받을 때까지 비워 둔다
  const [n, setN] = useState(live ? (remembered<number>(key) ?? 0) : fallback)
  useEffect(() => {
    if (!live) { setN(fallback); return }
    setN(remembered<number>(key) ?? 0)
    p.call<{ items: unknown[] }>('queue').then(q => setN(remember(key, q.items.length))).catch(() => {})
  }, [p.live, p.pass, p.couple.id])
  return n
}
