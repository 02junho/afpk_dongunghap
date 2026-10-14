import { createClient } from '@supabase/supabase-js'

/**
 * env 가 없으면 null — 1주차엔 Supabase 없이도 화면이 떠야 한다.
 *
 * 자리표시자(`xxxx`, `eyJ...`)도 '없음'으로 친다. `.env.example` 을 복사만 하고
 * 채우지 않은 상태에서 가짜 주소로 접속을 시도하면, 원인이 DNS 오류로 둔갑해
 * 찾는 데 한참 걸린다. 설정이 덜 된 것은 **조용히 로컬 모드**로 떨어뜨린다.
 */
const placeholder = (v?: string) => !v || /^\s*$/.test(v) || /xxxx|eyJ\.\.\.|여기에|your[-_]/i.test(v)

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = !placeholder(url) && !placeholder(key)

export const supabase = supabaseConfigured ? createClient(url!, key!) : null

if (!supabaseConfigured && import.meta.env.DEV)
  console.info('[돈궁합] Supabase env 미설정 → 로컬 state 로 동작합니다 (.env 의 VITE_SUPABASE_* 를 채우면 연결)')
