/**
 * Supabase 연결 확인. 키 값은 절대 출력하지 않는다.
 *   set -a && source .env && set +a && npm run ping:db
 *
 * 두 가지를 본다:
 *   1) secret 키(서버) 로 cards 를 세면 10 — URL·secret 키가 맞고 시드가 들어갔다
 *   2) publishable 키(브라우저, 로그인 안 함) 로 active_cards 를 읽으면 0 — RLS 가 막는다
 *      여기서 10 이 나오면 뷰가 RLS 를 우회하는 상태다 (security_invoker 미적용) → 고쳐야 한다
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
const miss = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])
if (miss.length) { console.error(`✗ .env 에 없음: ${miss.join(', ')}`); process.exit(1) }
console.log(`URL ${url} · publishable ${anon.slice(0, 15)}… · secret ${secret.slice(0, 10)}…`)

let failed = false

// 1) 서버 키
try {
  const s = createClient(url, secret, { auth: { persistSession: false } })
  const { count, error } = await s.from('cards').select('*', { count: 'exact', head: true })
  if (error) throw error
  console.log(count === 10 ? `✓ secret 키 · cards ${count}장 (시드 OK)` : `⚠ secret 키 · cards ${count}장 — 10장이어야 한다`)
} catch (e) {
  failed = true
  console.error(`✗ secret 키 실패: ${e.message ?? e}`)
}

// 2) 브라우저 키 (로그인 없음) — 아무것도 보이면 안 된다
try {
  const a = createClient(url, anon, { auth: { persistSession: false } })
  for (const t of ['cards', 'answers', 'judgments', 'active_cards', 'planner_queue']) {
    const { count, error } = await a.from(t).select('*', { count: 'exact', head: true })
    if (error) { console.log(`✓ 익명 · ${t}: 접근 거부 (${error.code ?? error.message})`); continue }
    if ((count ?? 0) > 0) { failed = true; console.error(`✗ 익명 · ${t}: ${count}행 보임 — RLS/security_invoker 를 확인하라`) }
    else console.log(`✓ 익명 · ${t}: 0행 (RLS OK)`)
  }
} catch (e) {
  failed = true
  console.error(`✗ publishable 키 실패: ${e.message ?? e}`)
}

process.exit(failed ? 1 : 0)
