import { Capacitor } from '@capacitor/core'

const REVIEW_CONVERSATION_THRESHOLD = 3
const REVIEW_SHOWN_KEY = 'pesona_review_shown'

// 후기 작성 시 마스크 10개 지급 UI 노출 여부. (후기 유도 모달 + 마스크샵 미션)
// 백엔드 보상 로직(/masks/review-reward)은 그대로 유지.
export const REVIEW_REWARD_UI_ENABLED = true

export function shouldShowReview(conversationCount) {
  if (!REVIEW_REWARD_UI_ENABLED) return false
  if (!Capacitor.isNativePlatform()) return false
  if (conversationCount !== REVIEW_CONVERSATION_THRESHOLD) return false
  if (localStorage.getItem(REVIEW_SHOWN_KEY)) return false
  return true
}

export async function requestInAppReview() {
  try {
    const url = 'https://play.google.com/store/apps/details?id=com.pesona.app'
    if (window.Android?.openInBrowser) {
      window.Android.openInBrowser(url)
    } else {
      window.open(url, '_system')
    }
    localStorage.setItem(REVIEW_SHOWN_KEY, Date.now().toString())
  } catch (e) {
    console.error('In-app review error:', e)
  }
}

export function markReviewShown() {
  localStorage.setItem(REVIEW_SHOWN_KEY, Date.now().toString())
}
