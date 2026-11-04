/**
 * 폰 알림 (Web Push, 11.04) — Node 함수. web-push 라이브러리가 Node 암호화를 써서 edge 가 아니다.
 *
 *   POST /api/push
 *     { action: 'key' }                                       → { publicKey }  (공개 열쇠 — 비밀 아님)
 *     { action: 'subscribe_member', accessToken, subscription } 부부 폰 등록 (토큰으로 누구인지 서버가 확인)
 *     { action: 'subscribe_planner', passcode, subscription }   설계사 기기 등록
 *     { action: 'notice', accessToken, noticeId }              부부가 "바뀐 게 있어요"를 보낸 뒤 → 설계사에게
 *     { action: 'send', ... }  + 헤더 x-push-secret            서버 안에서만 (api/_notify.ts)
 *
 * 알림 문구에는 판정 · 상대 답 · 금액을 넣지 않는다. 잠금 화면에 그대로 보이기 때문이다.
 * 키(VAPID_PRIVATE_KEY · PUSH_SECRET)는 서버에만 있다. 없으면 알림만 조용히 건너뛴다 — 앱은 그대로 돈다.
 */
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Node 함수는 파일마다 따로 돌아서(묶지 않음) 확장자 없는 상대 경로 import('./judge')가 깨진다 — 여기서 직접 만든다
function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }
type Msg = { title: string; body: string; url: string; tag?: string }
const bad = (error: string, status = 400) => Response.json({ error }, { status })

function ready(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://afpk-dongunghap.vercel.app', pub, priv)
  return true
}
const validSub = (s: any): s is Sub => !!s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'

async function memberOf(sb: NonNullable<ReturnType<typeof serviceClient>>, accessToken: unknown) {
  if (typeof accessToken !== 'string' || !accessToken) return null
  const { data: u } = await sb.auth.getUser(accessToken)
  if (!u?.user) return null
  const { data: m } = await sb.from('members').select('id, couple_id, role').eq('auth_user_id', u.user.id).maybeSingle()
  return m
}

/** 대상 기기들에 보낸다. 사라진 기기(404 · 410)는 지운다. 보낸 수를 돌려준다 */
export async function sendTo(sb: NonNullable<ReturnType<typeof serviceClient>>, to: { coupleId?: string; planner?: boolean }, msg: Msg): Promise<number> {
  if (!ready()) return 0
  let q = sb.from('push_subscriptions').select('id, endpoint, p256dh, auth')
  if (to.planner) q = q.eq('for_planner', true)
  else if (to.coupleId) {
    const { data: ms } = await sb.from('members').select('id').eq('couple_id', to.coupleId)
    const ids = (ms ?? []).map(m => m.id)
    if (!ids.length) return 0
    q = q.in('member_id', ids)
  } else return 0
  const { data: subs } = await q
  let sent = 0
  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 24 * 3600 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
    }
  }))
  return sent
}

export async function POST(req: Request): Promise<Response> {
  let body: any
  try { body = await req.json() } catch { return bad('JSON 파싱 실패') }
  if (body.action === 'key') return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null })

  const sb = serviceClient()
  if (!sb) return bad('SUPABASE 설정이 없습니다', 500)
  const save = async (s: Sub, row: { member_id?: string; for_planner?: boolean }) => {
    const { error } = await sb.from('push_subscriptions')
      .upsert({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, member_id: row.member_id ?? null, for_planner: !!row.for_planner }, { onConflict: 'endpoint' })
    if (error) return bad(/push_subscriptions/.test(error.message) ? 'DB 에 알림 표가 없습니다 — supabase/patch-2026-11-04-push.sql 을 실행해 주세요' : error.message, 500)
    return Response.json({ ok: true })
  }

  switch (body.action) {
    case 'subscribe_member': {
      if (!validSub(body.subscription)) return bad('subscription')
      const m = await memberOf(sb, body.accessToken)
      if (!m) return bad('입장 정보를 확인하지 못했습니다', 401)
      return save(body.subscription, { member_id: m.id })
    }
    case 'subscribe_planner': {
      if (!process.env.PLANNER_PASSCODE || body.passcode !== process.env.PLANNER_PASSCODE) return bad('설계사 코드가 틀립니다', 401)
      if (!validSub(body.subscription)) return bad('subscription')
      return save(body.subscription, { for_planner: true })
    }
    case 'notice': {
      // 부부가 "바뀐 게 있어요"를 보낸 직후. 보낸 사람이 맞는지 서버가 확인하고 설계사에게만 알린다
      const m = await memberOf(sb, body.accessToken)
      if (!m || typeof body.noticeId !== 'string') return bad('확인 실패', 401)
      const { data: n } = await sb.from('change_notices').select('id, couple_id, member_id, created_at').eq('id', body.noticeId).maybeSingle()
      if (!n || n.member_id !== m.id || Date.now() - new Date(n.created_at).getTime() > 10 * 60_000) return bad('알림을 찾지 못했습니다', 404)
      const { data: c } = await sb.from('couples').select('label').eq('id', n.couple_id).maybeSingle()
      const sent = await sendTo(sb, { planner: true }, { title: '돈궁합 · 먼저 알린 변화', body: `${c?.label ?? '담당 부부'} · 먼저 알린 변화 1건`, url: '/p/couples', tag: `notice-${n.couple_id}` })
      return Response.json({ ok: true, sent })
    }
    case 'send': {
      if (!process.env.PUSH_SECRET || req.headers.get('x-push-secret') !== process.env.PUSH_SECRET) return bad('forbidden', 403)
      const msg = body.msg as Msg
      if (!msg?.title || !msg?.body || !msg?.url) return bad('msg')
      const sent = await sendTo(sb, { coupleId: typeof body.coupleId === 'string' ? body.coupleId : undefined, planner: !!body.planner }, msg)
      return Response.json({ ok: true, sent })
    }
    default:
      return bad('unknown action')
  }
}
