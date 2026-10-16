/**
 * 설계사 콘솔 공통: 설계사 코드(임시 인증)와 선택한 커플 컨텍스트. sessionStorage.
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
export function saveCouple(c: CoupleRow) { sessionStorage.setItem(COUPLE_KEY, JSON.stringify(c)) }

export function usePlanner() {
  const live = isLive()
  const [pass, setPassState] = useState(() => sessionStorage.getItem(PLANNER_PASS_KEY) ?? '')
  const [couple, setCoupleState] = useState<CoupleRow>(loadCouple)
  const ready = !live || !!pass

  const setPass = useCallback((p: string) => { sessionStorage.setItem(PLANNER_PASS_KEY, p); setPassState(p) }, [])
  const clearPass = useCallback(() => { sessionStorage.removeItem(PLANNER_PASS_KEY); setPassState('') }, [])
  const setCouple = useCallback((c: CoupleRow) => { saveCouple(c); setCoupleState(c) }, [])

  /** API 호출. 코드가 틀리면 코드를 지워 다시 묻게 한다 */
  const call = useCallback(async <T = any>(action: string, params: Record<string, unknown> = {}) => {
    try {
      return await plannerApi<T>(action, { coupleId: couple.id, ...params })
    } catch (e) {
      if ((e as Error).message.includes('틀립니다')) clearPass()
      throw e
    }
  }, [couple.id, clearPass])

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
