import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** env가 없으면 null — 1주차엔 Supabase 없이도 화면이 떠야 한다 */
export const supabase = url && key ? createClient(url, key) : null
