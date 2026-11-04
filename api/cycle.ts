/**
 * 6주 사이클 "때가 됐나" 확인 (11.04, edge).
 *   POST /api/cycle { accessToken }   부부 폰이 홈을 열 때 — 그 부부만. 누구 폰인지 서버가 토큰으로 확인한다
 *   GET  /api/cycle                   하루 한 번 예약 실행(vercel.json crons) — 진행 중인 모든 부부. CRON_SECRET 으로만
 * 응답에 판정 · 상대 답은 없다 (몇 주차인지만).
 */
import { serviceClient } from './judge'
import { tickCouple } from './_cycle'

export const config = { runtime: 'edge' }
const bad = (error: string, status = 400) => Response.json({ error }, { status })

export default async function handler(req: Request): Promise<Response> {
  const sb = serviceClient()
  if (!sb) return bad('SUPABASE 설정이 없습니다', 500)
  try {
    if (req.method === 'GET') {
      const secret = process.env.CRON_SECRET
      if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return bad('forbidden', 403)
      const { data: open } = await sb.from('cycles').select('couple_id').is('closed_at', null)
      const { data: closed } = await sb.from('cycles').select('couple_id').not('closed_at', 'is', null)
      const { data: live } = await sb.from('couples').select('id').is('archived_at', null)
      const alive = new Set((live ?? []).map(c => c.id))
      const ids = [...new Set([...(open ?? []), ...(closed ?? [])].map(c => c.couple_id))].filter(id => alive.has(id))
      let opened = 0
      for (const id of ids) opened += (await tickCouple(sb, id, req.url)).opened
      return Response.json({ ok: true, couples: ids.length, opened })
    }
    if (req.method !== 'POST') return bad('POST only', 405)
    let body: any
    try { body = await req.json() } catch { return bad('JSON 파싱 실패') }
    if (typeof body.accessToken !== 'string') return bad('accessToken', 401)
    const { data: u } = await sb.auth.getUser(body.accessToken)
    if (!u?.user) return bad('입장 정보를 확인하지 못했습니다', 401)
    const { data: m } = await sb.from('members').select('couple_id').eq('auth_user_id', u.user.id).maybeSingle()
    if (!m) return bad('입장 정보를 확인하지 못했습니다', 401)
    const t = await tickCouple(sb, m.couple_id, req.url)
    return Response.json({ ok: true, week: t.week })
  } catch (e) {
    return bad((e as Error).message, 500)
  }
}
