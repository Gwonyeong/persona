import { api } from './api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Service Worker 등록 + 푸시 알림 구독
 * 로그인 상태에서만 호출해야 함
 */
export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // 이미 구독 중이면 서버에 재등록만
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    // 서버에 구독 정보 전송
    await api.post('/push/subscribe', { subscription: subscription.toJSON() })
  } catch (err) {
    console.error('[Push] Registration failed:', err)
  }
}

/**
 * 푸시 알림 구독 해제
 */
export async function unregisterPushNotifications() {
  if (!('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const json = subscription.toJSON()
      await subscription.unsubscribe()
      await api.post('/push/unsubscribe', { endpoint: json.endpoint })
    }
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err)
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}
