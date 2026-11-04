/* 폰 알림 받기 (11.04) — 서비스워커가 importScripts 로 불러온다 (vite.config.ts).
   알림 내용은 서버(api/push.ts)가 정한다. 판정 · 상대 답 · 금액은 오지 않는다. */
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(d.title || '돈궁합', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) {
        try { await c.navigate(url) } catch (e) { /* 다른 화면이면 그대로 */ }
        return c.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
