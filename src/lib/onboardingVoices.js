import { api } from './api'
import i18n from '../i18n'

let cache = null
let cacheLang = null
let inflight = null
let currentAudio = null

function currentLang() {
  return (i18n.language || 'ko').split('-')[0]
}

// 매핑 fetch (언어 기준 캐시). 같은 언어면 한 번만 요청.
export async function loadVoices(lang = currentLang()) {
  if (cache && cacheLang === lang) return cache
  if (inflight && cacheLang === lang) return inflight
  cacheLang = lang
  inflight = api
    .get(`/onboarding/voices?lang=${lang}`)
    .then(({ voices }) => {
      cache = voices || {}
      inflight = null
      return cache
    })
    .catch((err) => {
      inflight = null
      cache = {}
      console.warn('Failed to load onboarding voices:', err)
      return cache
    })
  return inflight
}

export function getVoiceUrl(page, key) {
  if (!cache) return null
  return cache[`${page}.${key}`] || null
}

// 새 음성 재생 — 이전 재생 중이면 중단 후 재생
export function playVoice(url) {
  stopVoice()
  if (!url) return
  try {
    const audio = new Audio(url)
    audio.play().catch(() => {
      // 자동재생 차단된 경우 — 무시 (텍스트만 노출)
    })
    currentAudio = audio
    audio.addEventListener('ended', () => {
      if (currentAudio === audio) currentAudio = null
    })
  } catch {
    // ignore
  }
}

export function stopVoice() {
  if (currentAudio) {
    try {
      currentAudio.pause()
      currentAudio.currentTime = 0
    } catch {
      // ignore
    }
    currentAudio = null
  }
}

// 페이지·키로 직접 재생 (캐시에서 url 찾아서). url이 없어도 이전 오디오는 정지.
export function playVoiceByKey(page, key) {
  playVoice(getVoiceUrl(page, key))
}
