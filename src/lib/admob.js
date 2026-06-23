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
let rewardedPrepared = false
let rewardedPreparing = null

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

// 리워드 광고를 미리 로드해둔다. 클릭 후 광고 표시 사이의 대기 없이 즉시 재생.
// 이미 prepare 중이면 같은 promise를 반환, 이미 끝난 상태면 true를 즉시 반환.
export async function prepareRewardedAd() {
  if (!isAdMobAvailable() || !REWARDED_AD_ID) return false
  if (rewardedPrepared) return true
  if (rewardedPreparing) return rewardedPreparing
  rewardedPreparing = (async () => {
    try {
      if (!initialized) {
        const ok = await initAdMob()
        if (!ok) return false
      }
      await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID })
      rewardedPrepared = true
      return true
    } catch (e) {
      console.error('AdMob prepare rewarded failed:', e)
      return false
    } finally {
      rewardedPreparing = null
    }
  })()
  return rewardedPreparing
}

export async function showRewardedAd() {
  if (!AdMob || !REWARDED_AD_ID) throw new Error('AdMob not available')

  // prepare 미완료 시 즉석에서 로드 (폴백). 정상 흐름에선 prepareRewardedAd로 미리 준비되어 있음.
  if (!rewardedPrepared) {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID })
    rewardedPrepared = true
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      rewardListener.remove()
      dismissListener.remove()
      failListener.remove()
      // 한 번 표시되거나 실패하면 ad는 소비된 상태. 다음 표시 전엔 새로 prepare 해야 함.
      rewardedPrepared = false
    }

    const rewardListener = AdMob.addListener('onRewardedVideoAdReward', (reward) => {
      cleanup()
      resolve(reward)
    })

    const dismissListener = AdMob.addListener('onRewardedVideoAdDismissed', () => {
      cleanup()
      reject(new Error('AD_DISMISSED'))
    })

    const failListener = AdMob.addListener('onRewardedVideoAdFailedToLoad', () => {
      cleanup()
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
