import { Capacitor } from '@capacitor/core'

const PRODUCT_IDS = ['masks_30', 'masks_100', 'masks_300']
const SUBSCRIPTION_IDS = ['light_plan']

let NativePurchases = null
let PURCHASE_TYPE = null
// MaskShop 컴포넌트가 페이지 이동으로 remount될 때마다 initBilling이 재호출되면
// @capgo/native-purchases의 BillingClient lifecycle이 꼬여 hang하는 이슈가 있어,
// 한 번 성공한 init 결과는 in-flight promise까지 모듈 레벨에 캐싱해 재호출 차단.
// 단 캐싱하는 건 "성공"뿐이다 — 실패까지 캐싱하면 앱을 껐다 켜기 전까지 결제가 영구히 막힌다.
// (2026-09-01: 결제창조차 못 연 유저가 1시간 동안 115번 버튼을 누른 사례)
let initPromise = null

// isBillingSupported()가 응답하지 않는 경우(Play 스토어 상태 이상 등)를 끊는다.
// 타임아웃 없이 두면 promise가 영원히 pending으로 남아 billingReady가 계속 false다.
const INIT_TIMEOUT_MS = 8000

// 마지막 init 실패 원인. 결제 시도 실패를 서버에 남길 때 함께 보낸다.
let lastInitFailure = null

export function getLastBillingFailure() {
  return lastInitFailure
}

export function isNativeBillingAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

export function initBilling() {
  if (initPromise) return initPromise

  const attempt = (async () => {
    if (!isNativeBillingAvailable()) {
      lastInitFailure = 'NOT_NATIVE'
      return false
    }

    try {
      const module = await withTimeout(import('@capgo/native-purchases'), INIT_TIMEOUT_MS, 'billing import')
      NativePurchases = module.NativePurchases
      PURCHASE_TYPE = module.PURCHASE_TYPE

      const { isBillingSupported } = await withTimeout(
        NativePurchases.isBillingSupported(),
        INIT_TIMEOUT_MS,
        'isBillingSupported',
      )
      if (!isBillingSupported) lastInitFailure = 'NOT_SUPPORTED'
      return isBillingSupported
    } catch (e) {
      console.error('Billing init failed:', e)
      lastInitFailure = `INIT_ERROR: ${e?.message || e}`
      return false
    }
  })()

  // 실패는 캐싱하지 않는다 — 다음 호출이 처음부터 다시 시도할 수 있어야 한다.
  // (guard가 돌려주는 것과 같은 promise여야 하므로 initPromise 자체를 래퍼로 둔다)
  initPromise = attempt.then((ready) => {
    if (!ready) initPromise = null
    else lastInitFailure = null
    return ready
  })

  return initPromise
}

export async function getProducts() {
  if (!NativePurchases) return null

  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: PRODUCT_IDS,
      productType: PURCHASE_TYPE.INAPP,
    })
    return products
  } catch (e) {
    console.error('Get products failed:', e)
    return null
  }
}

export async function purchaseProduct(productId) {
  if (!NativePurchases) throw new Error('Billing not available')

  const result = await NativePurchases.purchaseProduct({
    productIdentifier: productId,
    productType: PURCHASE_TYPE.INAPP,
    isConsumable: true,
  })

  return result
}

export async function consumePurchase(purchaseToken) {
  if (!NativePurchases) return false

  try {
    await NativePurchases.consumePurchase({ purchaseToken })
    return true
  } catch (e) {
    console.error('Consume purchase failed:', e)
    return false
  }
}

export async function getPendingPurchases() {
  if (!NativePurchases) return []

  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.INAPP,
    })
    return purchases.filter((p) => ['PURCHASED', '1'].includes(p.purchaseState ?? ''))
  } catch (e) {
    console.error('Get pending purchases failed:', e)
    return []
  }
}

// === 구독 (Subscription) ===

export async function getSubscriptionProducts() {
  if (!NativePurchases) return null

  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: SUBSCRIPTION_IDS,
      productType: PURCHASE_TYPE.SUBS,
    })
    return products
  } catch (e) {
    console.error('Get subscription products failed:', e)
    return null
  }
}

export async function purchaseSubscription(productId, planIdentifier = 'light') {
  if (!NativePurchases) throw new Error('Billing not available')

  const result = await NativePurchases.purchaseProduct({
    productIdentifier: productId,
    planIdentifier,
    productType: PURCHASE_TYPE.SUBS,
    isConsumable: false,
  })

  return result
}

export async function getActiveSubscriptions() {
  if (!NativePurchases) return []

  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
    })
    return purchases
  } catch (e) {
    console.error('Get active subscriptions failed:', e)
    return []
  }
}
