import { Capacitor } from '@capacitor/core'

const REWARDED_AD_ID = import.meta.env.VITE_ADMOB_REWARDED_AD_ID

let AdMob = null
let initialized = false

export function isAdMobAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function initAdMob() {
  if (!isAdMobAvailable() || initialized) return initialized

  try {
    const module = await import('@capacitor-community/admob')
    AdMob = module.AdMob

    await AdMob.initialize({
      initializeForTesting: true,
    })
    initialized = true
    return true
  } catch (e) {
    console.error('AdMob init failed:', e)
    return false
  }
}

export async function showRewardedAd() {
  if (!AdMob || !REWARDED_AD_ID) throw new Error('AdMob not available')

  await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID })

  return new Promise((resolve, reject) => {
    const rewardListener = AdMob.addListener('onRewardedVideoAdReward', (reward) => {
      rewardListener.remove()
      dismissListener.remove()
      failListener.remove()
      resolve(reward)
    })

    const dismissListener = AdMob.addListener('onRewardedVideoAdDismissed', () => {
      rewardListener.remove()
      dismissListener.remove()
      failListener.remove()
      reject(new Error('AD_DISMISSED'))
    })

    const failListener = AdMob.addListener('onRewardedVideoAdFailedToLoad', (error) => {
      rewardListener.remove()
      dismissListener.remove()
      failListener.remove()
      reject(new Error('AD_FAILED'))
    })

    AdMob.showRewardVideoAd()
  })
}
