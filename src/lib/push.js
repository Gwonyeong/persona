import { api } from './api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * SW 등록 + 이미 권한이 있으면 구독 (자동 호출용)
 * 권한이 없으면 요청하지 않고 조용히 종료
 */
export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

    // 이미 권한이 granted인 경우에만 자동 구독
    if (!subscription && Notification.permission === 'granted') {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    if (subscription) {
      await api.post('/push/subscribe', { subscription: subscription.toJSON() })
    }
  } catch (err) {
    console.error('[Push] Registration failed:', err)
  }
}

/**
 * 사용자 제스처에서 호출 — 권한 요청 + 구독 (iOS 대응)
 * @returns {'granted'|'denied'|'unsupported'} 결과
 */
export async function requestPushPermission() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'unsupported'

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return permission

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    await api.post('/push/subscribe', { subscription: subscription.toJSON() })
    return 'granted'
  } catch (err) {
    console.error('[Push] Permission request failed:', err)
    return 'denied'
  }
}

/**
 * 현재 푸시 알림 상태 반환
 * @returns {'granted'|'denied'|'default'|'unsupported'}
 */
export function getPushPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
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
