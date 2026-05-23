import { Capacitor } from '@capacitor/core'

const PRODUCT_IDS = ['masks_30', 'masks_100', 'masks_300']
const SUBSCRIPTION_IDS = ['light_plan']

let NativePurchases = null
let PURCHASE_TYPE = null
// MaskShop 컴포넌트가 페이지 이동으로 remount될 때마다 initBilling이 재호출되면
// @capgo/native-purchases의 BillingClient lifecycle이 꼬여 hang하는 이슈가 있어,
// 한 번 성공한 init 결과는 in-flight promise까지 모듈 레벨에 캐싱해 재호출 차단.
let initPromise = null

export function isNativeBillingAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function initBilling() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (!isNativeBillingAvailable()) return false

    try {
      const module = await import('@capgo/native-purchases')
      NativePurchases = module.NativePurchases
      PURCHASE_TYPE = module.PURCHASE_TYPE

      const { isBillingSupported } = await NativePurchases.isBillingSupported()
      return isBillingSupported
    } catch (e) {
      console.error('Billing init failed:', e)
      initPromise = null
      return false
    }
  })()

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
