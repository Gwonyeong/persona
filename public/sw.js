// Pesona Service Worker — push notification 수신 전용

self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const { title, body, icon, data: notifData } = data

  event.waitUntil(
    self.registration.showNotification(title || 'Pesona', {
      body: body || '',
      icon: icon || '/favicon.svg',
      badge: '/favicon.svg',
      data: notifData || {},
      tag: notifData?.conversationId ? `conv-${notifData.conversationId}` : undefined,
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const { conversationId } = event.notification.data || {}
  const path = conversationId ? `/chats/${conversationId}` : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 이미 열린 탭이 있으면 postMessage로 SPA 네비게이션 + 포커스
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: 'NAVIGATE', path })
          return client.focus()
        }
      }
      // 없으면 새 창으로 열기
      return clients.openWindow(path)
    })
  )
})
