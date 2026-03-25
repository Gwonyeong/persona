import { api } from './api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Service Worker 등록 + 푸시 알림 구독
 * 로그인 상태에서만 호출해야 함
 */
function debugToast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  Object.assign(el.style, {
    position: 'fixed', top: '40px', left: '8px', right: '8px', zIndex: '99999',
    background: '#222', color: '#0f0', padding: '8px 12px', borderRadius: '8px',
    fontSize: '11px', wordBreak: 'break-all',
  })
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 5000)
}

export async function registerPushNotifications() {
  debugToast('[Push] Start')

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    debugToast(`[Push] Not supported: sw=${'serviceWorker' in navigator}, push=${'PushManager' in window}`)
    return
  }
  if (!VAPID_PUBLIC_KEY) {
    debugToast('[Push] VAPID_PUBLIC_KEY not set')
    return
  }

  try {
    debugToast('[Push] Registering SW...')
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    debugToast('[Push] SW ready')

    let subscription = await registration.pushManager.getSubscription()
    debugToast(`[Push] Existing sub: ${!!subscription}`)

    if (!subscription) {
      debugToast('[Push] Requesting permission...')
      const permission = await Notification.requestPermission()
      debugToast(`[Push] Permission: ${permission}`)
      if (permission !== 'granted') return

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      debugToast('[Push] Subscribed!')
    }

    await api.post('/push/subscribe', { subscription: subscription.toJSON() })
    debugToast('[Push] Sent to server OK')
  } catch (err) {
    debugToast(`[Push] Error: ${err.message}`)
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
