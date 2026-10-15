/**
 * 리허설 도구: 상대 역할의 답변을 서버 키로 대신 넣는다. 폰이 한 대뿐일 때 "두 번째 폰"을 흉내 낸다.
 *   set -a && source .env && set +a && npm run sim -- wife            # 아내 답 3장 넣기 (기본 문구)
 *   npm run sim -- husband "2029-06" "없어요" "1.5억 주신대요"           # 문구 지정
 *   npm run sim -- judge http://localhost:5173                         # 라운드 판정 요청
 * service_role 키를 쓰므로 서버/로컬에서만. 키 값은 출력하지 않는다.
 */
import { createClient } from '@supabase/supabase-js'

const DEMO_COUPLE = '00000000-0000-0000-0000-000000000010'
const DEFAULTS = {
  husband: ['2029-06', '저 내년에 이직해요', '1.5억 정도 해주신다고 했어요'],
  wife: ['2029-03', '남편 이직 준비 중이에요', '그건 빌리는 거예요, 주시는 게 아니라'],
}

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) { console.error('✗ VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }
const sb = createClient(url, secret, { auth: { persistSession: false } })

const [cmd, ...rest] = process.argv.slice(2)

const { data: rounds } = await sb.from('rounds').select('id, card_version_ids, status').eq('couple_id', DEMO_COUPLE).eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
const round = rounds?.[0]

if (cmd === 'judge') {
  const base = rest[0] ?? 'http://localhost:5173'
  if (!round) { console.log('열린 라운드 없음 (이미 판정됐을 수 있음)'); process.exit(0) }
  const res = await fetch(`${base}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId: round.id }) })
  console.log(res.status, await res.text())
  process.exit(0)
}

if (cmd !== 'husband' && cmd !== 'wife') { console.error('사용법: npm run sim -- husband|wife [답1 답2 답3] | judge [baseUrl]'); process.exit(1) }
if (!round) { console.error('✗ 열린 라운드가 없습니다. 설계사 콘솔에서 "0회차 다시 열기"'); process.exit(1) }

const { data: member } = await sb.from('members').select('id, display_name').eq('couple_id', DEMO_COUPLE).eq('role', cmd).single()
const texts = rest.length ? rest : DEFAULTS[cmd]
const ids = round.card_version_ids
let n = 0
for (let i = 0; i < ids.length; i++) {
  const text = texts[i] ?? texts[texts.length - 1]
  const { error } = await sb.from('answers').upsert(
    { round_id: round.id, card_version_id: ids[i], member_id: member.id, text, is_condition: false },
    { onConflict: 'round_id,card_version_id,member_id', ignoreDuplicates: true },
  )
  if (error) { console.error(`✗ ${i + 1}: ${error.message}`); continue }
  n++
  console.log(`✓ ${member.display_name} ${i + 1}/${ids.length}: ${text}`)
}
console.log(`${n}장 입력. 라운드 ${round.id.slice(0, 8)}…`)
