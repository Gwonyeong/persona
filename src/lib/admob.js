import { Capacitor } from '@capacitor/core'

const REWARDED_AD_ID = import.meta.env.VITE_ADMOB_REWARDED_AD_ID
// 배너 ID 미설정 시 구글 공식 테스트 배너 ID 사용 (정책 위반 X)
const BANNER_AD_ID =
  import.meta.env.VITE_ADMOB_BANNER_AD_ID || 'ca-app-pub-3940256099942544/6300978111'
const INTERSTITIAL_AD_ID = import.meta.env.VITE_ADMOB_INTERSTITIAL_AD_ID

let AdMob = null
let AdModule = null
let initialized = false
let bannerVisible = false
let bannerLoading = false
let interstitialReady = false
let interstitialPreparing = false

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

export function isInterstitialConfigured() {
  return isAdMobAvailable() && !!INTERSTITIAL_AD_ID
}

/**
 * 전면 광고 미리 로드.
 * 노출 직전에 로드하면 광고가 뜨기까지 수 초가 비어 채팅 흐름이 끊기므로,
 * 노출 예정 시점보다 앞서 호출해 둔다.
 */
export async function prepareInterstitialAd() {
  if (!isInterstitialConfigured()) return false
  if (interstitialReady) return true
  if (interstitialPreparing) return false

  interstitialPreparing = true
  try {
    if (!initialized) {
      const ok = await initAdMob()
      if (!ok) return false
    }
    await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID, isTesting: false })
    interstitialReady = true
    return true
  } catch (e) {
    // no-fill 이 흔하다 — 광고를 못 받는 건 정상 동작이므로 조용히 실패시킨다.
    interstitialReady = false
    console.warn('AdMob interstitial prepare failed:', e?.message || e)
    return false
  } finally {
    interstitialPreparing = false
  }
}

// 광고가 닫히기를 기다리는 최대 시간. Dismissed 이벤트가 유실돼도
// 화면이 영영 광고 대기 상태로 묶이지 않게 하는 안전장치다.
const INTERSTITIAL_MAX_WAIT_MS = 120000

/**
 * 전면 광고 노출. 준비된 광고가 없으면 즉시 false 를 반환하고 다음 기회로 넘긴다
 * (여기서 로드를 기다리면 유저가 빈 화면을 보게 된다).
 *
 * 반환 프로미스는 **광고가 닫힌 뒤** resolve 한다.
 * 네이티브 showInterstitial() 자체는 show() 를 호출한 직후 resolve 하므로
 * (AdInterstitialExecutor.java) 닫힘은 Dismissed 이벤트로만 알 수 있다.
 *
 * @returns {Promise<boolean>} 광고를 노출했는지 (false = 광고 없이 그대로 진행)
 */
export async function showInterstitialAd() {
  if (!isInterstitialConfigured()) return false
  if (!interstitialReady) {
    prepareInterstitialAd() // 다음 기회를 위해 백그라운드 로드만 걸어둔다
    return false
  }
  // 전면 광고는 1회용 — 노출·실패 어느 쪽이든 다음 광고를 새로 받아야 한다.
  interstitialReady = false

  const { InterstitialAdPluginEvents } = AdModule
  let dismissHandle
  let failHandle
  let timer

  try {
    let onClosed
    const closed = new Promise((resolve) => { onClosed = resolve })
    const finish = () => {
      clearTimeout(timer)
      dismissHandle?.remove()
      failHandle?.remove()
      onClosed(true)
    }
    // 리스너를 먼저 붙인 뒤 show 한다 — 등록이 비동기라 순서가 뒤바뀌면
    // 광고가 닫혀도 이벤트를 못 받고 타임아웃까지 대기하게 된다.
    ;[dismissHandle, failHandle] = await Promise.all([
      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish),
      AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish),
    ])
    timer = setTimeout(finish, INTERSTITIAL_MAX_WAIT_MS)

    await AdMob.showInterstitial()
    await closed
    return true
  } catch (e) {
    clearTimeout(timer)
    dismissHandle?.remove()
    failHandle?.remove()
    console.warn('AdMob interstitial show failed:', e?.message || e)
    return false
  }
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
