import { Capacitor } from '@capacitor/core'
import { api } from './api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * 푸시 알림 등록 (네이티브: FCM, 웹: Web Push)
 */
export async function registerPushNotifications() {
  if (Capacitor.isNativePlatform()) {
    await registerNativePush()
  } else {
    await registerWebPush()
  }
}

/**
 * 사용자 제스처에서 호출 — 권한 요청 + 구독
 */
export async function requestPushPermission() {
  if (Capacitor.isNativePlatform()) {
    return await requestNativePushPermission()
  }
  return await requestWebPushPermission()
}

/**
 * 현재 푸시 알림 상태 반환
 */
export function getPushPermissionStatus() {
  if (Capacitor.isNativePlatform()) return 'default'
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * 푸시 알림 구독 해제
 */
export async function unregisterPushNotifications() {
  if (Capacitor.isNativePlatform()) {
    await unregisterNativePush()
  } else {
    await unregisterWebPush()
  }
}

// ========== 네이티브 (FCM) ==========

async function registerNativePush() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive !== 'granted') return

    await PushNotifications.register()

    PushNotifications.addListener('registration', async ({ value: token }) => {
      try {
        await api.post('/push/fcm-register', { token })
      } catch (err) {
        console.error('[FCM] Token registration failed:', err)
      }
    })

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[FCM] Registration error:', err)
    })

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const path = notification.notification?.data?.path
      if (path) {
        window.location.hash = ''
        window.location.pathname = path
      }
    })
  } catch (err) {
    console.error('[FCM] Init failed:', err)
  }
}

async function requestNativePushPermission() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const permStatus = await PushNotifications.requestPermissions()
    if (permStatus.receive !== 'granted') return 'denied'

    await PushNotifications.register()

    return new Promise((resolve) => {
      PushNotifications.addListener('registration', async ({ value: token }) => {
        try {
          await api.post('/push/fcm-register', { token })
        } catch (err) {
          console.error('[FCM] Token registration failed:', err)
        }
        resolve('granted')
      })

      PushNotifications.addListener('registrationError', () => {
        resolve('denied')
      })

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const path = notification.notification?.data?.path
        if (path) {
          window.location.hash = ''
          window.location.pathname = path
        }
      })
    })
  } catch (err) {
    console.error('[FCM] Permission request failed:', err)
    return 'denied'
  }
}

async function unregisterNativePush() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllListeners()
  } catch (err) {
    console.error('[FCM] Unregister failed:', err)
  }
}

// ========== 웹 (Web Push / VAPID) ==========

async function registerWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

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

async function requestWebPushPermission() {
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

async function unregisterWebPush() {
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
