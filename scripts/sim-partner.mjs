/**
 * 리허설 도구: 상대 역할의 답변을 서버 키로 대신 넣는다. 폰이 한 대뿐일 때 "두 번째 폰"을 흉내 낸다.
 *   set -a && source .env && set +a && npm run sim -- wife                       # 아내 답 (기본 문구)
 *   npm run sim -- husband home_when=2029-06 raise_plan="없어요" family_help="1.5억 주신대요"
 *   npm run sim -- wife --code=631732 home_price="6억 5천만"                       # 다른 커플, 먼저 묻기 1문항
 *   npm run sim -- judge http://localhost:5173                                    # 라운드 판정 요청
 *   npm run sim -- judge https://afpk-dongunghap.vercel.app --code=631732         # 배포 서버에 판정 요청
 * 답은 카드 key 로 맞춘다 (라운드의 카드 순서와 무관). service_role 키를 쓰므로 서버/로컬에서만. 키 값은 출력하지 않는다.
 */
import { createClient } from '@supabase/supabase-js'

const DEMO_COUPLE = '00000000-0000-0000-0000-000000000010'
const DEFAULTS = {
  husband: { home_when: '2029-06', raise_plan: '저 내년에 이직해요', family_help: '1.5억 정도 해주신다고 했어요' },
  wife: { home_when: '2029-03', raise_plan: '남편 이직 준비 중이에요', family_help: '그건 빌리는 거예요, 주시는 게 아니라' },
}

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) { console.error('✗ VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }
const sb = createClient(url, secret, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
// --code=631732 로 다른 커플을 고른다 (없으면 김현우·박지우)
const codeArg = argv.find(a => a.startsWith('--code='))?.slice(7)
const [cmd, ...rest] = argv.filter(a => !a.startsWith('--code='))
let coupleId = DEMO_COUPLE
if (codeArg) {
  const { data: c } = await sb.from('couples').select('id, label').eq('invite_code', codeArg).maybeSingle()
  if (!c) { console.error(`✗ 입장 코드 ${codeArg} 인 커플이 없습니다`); process.exit(1) }
  coupleId = c.id
  console.log(`커플: ${c.label}`)
}

const { data: rounds } = await sb.from('rounds').select('id, kind, card_version_ids, status').eq('couple_id', coupleId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
const round = rounds?.[0]
if (round) console.log(`열린 라운드: ${round.kind} (${round.card_version_ids.length}문항)`)

if (cmd === 'judge') {
  const base = rest[0] ?? 'http://localhost:5173'
  if (!round) { console.log('열린 라운드 없음 (이미 판정됐을 수 있음)'); process.exit(0) }
  const res = await fetch(`${base}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId: round.id }) })
  console.log(res.status, await res.text())
  process.exit(0)
}

if (cmd !== 'husband' && cmd !== 'wife') { console.error('사용법: npm run sim -- husband|wife [key=답 …] | judge [baseUrl]'); process.exit(1) }
if (!round) { console.error('✗ 열린 라운드가 없습니다. 설계사 콘솔에서 "0회차 다시 열기"'); process.exit(1) }

const { data: member } = await sb.from('members').select('id, display_name').eq('couple_id', coupleId).eq('role', cmd).single()
const { data: cvs } = await sb.from('card_versions').select('id, label, cards!inner(key)').in('id', round.card_version_ids)

const given = Object.fromEntries(rest.map(s => { const i = s.indexOf('='); return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''] }))
const texts = { ...DEFAULTS[cmd], ...given }

let n = 0
for (const cv of cvs ?? []) {
  const key = cv.cards.key
  const text = texts[key]
  if (!text) { console.log(`- ${cv.label} (${key}): 문구 없음, 건너뜀`); continue }
  const { error } = await sb.from('answers').upsert(
    { round_id: round.id, card_version_id: cv.id, member_id: member.id, text, is_condition: false },
    { onConflict: 'round_id,card_version_id,member_id', ignoreDuplicates: true },
  )
  if (error) { console.error(`✗ ${cv.label}: ${error.message}`); continue }
  n++
  console.log(`✓ ${member.display_name} · ${cv.label}: ${text}`)
}
console.log(`${n}장 입력. 라운드 ${round.id.slice(0, 8)}…`)
