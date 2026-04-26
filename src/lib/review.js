import { Capacitor } from '@capacitor/core'

const REVIEW_CONVERSATION_THRESHOLD = 3
const REVIEW_SHOWN_KEY = 'pesona_review_shown'

export function shouldShowReview(conversationCount) {
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
