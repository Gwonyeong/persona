import { Capacitor } from '@capacitor/core'

const PRODUCT_IDS = ['masks_30', 'masks_100', 'masks_300']

let NativePurchases = null
let PURCHASE_TYPE = null

export function isNativeBillingAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function initBilling() {
  if (!isNativeBillingAvailable()) return false

  try {
    const module = await import('@capgo/native-purchases')
    NativePurchases = module.NativePurchases
    PURCHASE_TYPE = module.PURCHASE_TYPE

    const { isBillingSupported } = await NativePurchases.isBillingSupported()
    return isBillingSupported
  } catch (e) {
    console.error('Billing init failed:', e)
    return false
  }
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
