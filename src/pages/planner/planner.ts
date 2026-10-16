/**
 * 설계사 콘솔 공통: 설계사 코드(임시 인증)와 선택한 커플 컨텍스트. sessionStorage + 모듈 단위 구독.
 * Rail 과 각 화면이 같은 값을 봐야 하므로(레일에서 코드를 넣으면 화면이 바로 바뀌게) 작은 공유 저장소로 묶는다.
 * live(Supabase env 있음)가 아니면 전부 데모 데이터로 돈다.
 */
import { useCallback, useEffect, useState } from 'react'
import { PLANNER_PASS_KEY, plannerApi } from '../../lib/api'
import { isLive } from '../../lib/db'

const COUPLE_KEY = 'planner:couple'

export interface CoupleRow {
  id: string
  label: string
  code: string
  husband: string
  wife: string
  state: string
  lastAt: string | null
  pending: number
}

export const DEMO_COUPLE: CoupleRow = { id: '00000000-0000-0000-0000-000000000010', label: '김현우 · 박지우', code: '482913', husband: '현우', wife: '지우', state: '0회차 완료', lastAt: null, pending: 2 }

export function loadCouple(): CoupleRow {
  try { const raw = sessionStorage.getItem(COUPLE_KEY); if (raw) return JSON.parse(raw) } catch { /* 무시 */ }
  return DEMO_COUPLE
}

// ── 공유 저장소 ──────────────────────────────────────────────────────────
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())
const readPass = () => sessionStorage.getItem(PLANNER_PASS_KEY) ?? ''

export function setPlannerPass(p: string) {
  if (p) sessionStorage.setItem(PLANNER_PASS_KEY, p)
  else sessionStorage.removeItem(PLANNER_PASS_KEY)
  notify()
}
export function setPlannerCouple(c: CoupleRow) {
  sessionStorage.setItem(COUPLE_KEY, JSON.stringify(c))
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
  const [n, setN] = useState(fallback)
  useEffect(() => {
    if (!p.live || !p.pass) { setN(fallback); return }
    p.call<{ items: unknown[] }>('queue').then(r => setN(r.items.length)).catch(() => {})
  }, [p.live, p.pass, p.couple.id])
  return n
}
