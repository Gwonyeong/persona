import { Capacitor } from '@capacitor/core'

// 웹 전용 PG 결제 게이트 + 포트원 V1 SDK 로더.
//
// 다날은 포트원 V2에서 결제를 지원하지 않는다(V2는 본인인증만).
// 따라서 결제창은 V1 JavaScript SDK(IMP.request_pay)로 호출한다.
// 채널키는 V1 최신 SDK에서도 그대로 사용 가능하다.
//
// Google Play 결제 정책상 앱(WebView) 안에서는 외부 웹 결제를 노출하면 안 된다.
// 앱은 Vercel 웹을 그대로 로드하므로(capacitor.config server.url) 빌드 타임 분리가
// 불가능하다. Capacitor 네이티브 판별 1차, user agent 판별 2차로 런타임에서 이중 차단한다.
export function isNativeApp() {
  try {
    if (Capacitor.isNativePlatform()) return true
  } catch {
    // Capacitor 미주입 환경(일반 브라우저) — UA 판별로 넘어간다.
  }
  const ua = navigator.userAgent || ''
  return /wv|WebView/i.test(ua) || (ua.includes('Android') && ua.includes('Version/'))
}

// 고객사 식별코드 (예: imp00000000). 포트원 콘솔 [결제 연동]에서 확인.
export const PORTONE_IMP_CODE = import.meta.env.VITE_PORTONE_IMP_CODE || ''
// 채널키. 포트원 콘솔 [결제 연동] - [연동 정보] - [채널 관리]에서 확인.
export const PORTONE_CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY || ''

export function isPortOneConfigured() {
  return Boolean(PORTONE_IMP_CODE && PORTONE_CHANNEL_KEY)
}

const SDK_URL = 'https://cdn.iamport.kr/v1/iamport.js'
let sdkPromise = null

// V1 SDK를 1회만 로드하고 초기화한다. IMP.init 중복 호출은 문서상 금지되어 있어
// 모듈 스코프 프라미스로 캐시한다.
export function loadPortOne() {
  if (isNativeApp()) return Promise.reject(new Error('NATIVE_APP_BLOCKED'))
  if (!isPortOneConfigured()) return Promise.reject(new Error('PORTONE_NOT_CONFIGURED'))
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    if (window.IMP) {
      window.IMP.init(PORTONE_IMP_CODE)
      resolve(window.IMP)
      return
    }
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => {
      if (!window.IMP) {
        reject(new Error('IMP global not found after SDK load'))
        return
      }
      window.IMP.init(PORTONE_IMP_CODE)
      resolve(window.IMP)
    }
    script.onerror = () => reject(new Error('Failed to load PortOne SDK'))
    document.head.appendChild(script)
  })

  return sdkPromise
}

// 주문 고유번호. 고객사에서 매번 고유하게 채번해야 한다.
export function createMerchantUid(prefix = 'pesona') {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now()}-${rand}`
}
