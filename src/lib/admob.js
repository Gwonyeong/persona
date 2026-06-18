import { Capacitor } from '@capacitor/core'

const REWARDED_AD_ID = import.meta.env.VITE_ADMOB_REWARDED_AD_ID
// 배너 ID 미설정 시 구글 공식 테스트 배너 ID 사용 (정책 위반 X)
const BANNER_AD_ID =
  import.meta.env.VITE_ADMOB_BANNER_AD_ID || 'ca-app-pub-3940256099942544/6300978111'

let AdMob = null
let AdModule = null
let initialized = false
let bannerVisible = false
let bannerLoading = false

export function isAdMobAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function loadModule() {
  if (AdModule) return AdModule
  AdModule = await import('@capacitor-community/admob')
  AdMob = AdModule.AdMob
  return AdModule
}

export async function initAdMob() {
  if (!isAdMobAvailable() || initialized) return initialized

  try {
    await loadModule()
    await AdMob.initialize({
      initializeForTesting: false,
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

export async function showBannerAd() {
  if (!isAdMobAvailable() || bannerVisible || bannerLoading) return false

  bannerLoading = true
  try {
    if (!initialized) {
      const ok = await initAdMob()
      if (!ok) return false
    }
    const { BannerAdPosition, BannerAdSize } = AdModule
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: false,
    })
    bannerVisible = true
    return true
  } catch (e) {
    console.error('AdMob banner show failed:', e)
    return false
  } finally {
    bannerLoading = false
  }
}

export async function hideBannerAd() {
  if (!isAdMobAvailable() || !bannerVisible || !AdMob) return
  try {
    await AdMob.hideBanner()
  } catch (e) {
    console.error('AdMob banner hide failed:', e)
  }
  bannerVisible = false
}

export async function removeBannerAd() {
  if (!isAdMobAvailable() || !AdMob) return
  try {
    await AdMob.removeBanner()
  } catch (e) {
    console.error('AdMob banner remove failed:', e)
  }
  bannerVisible = false
}
