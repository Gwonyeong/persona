import i18n from '../i18n'
import { api } from './api'

const SUPPORTED_LANGS = ['ko', 'en', 'ja']

// 앱이 실제로 보여주고 있는 언어. i18n.language 는 'ko-KR' 처럼 지역까지 올 수 있어
// resolvedLanguage 를 먼저 보고, 없으면 지역 코드를 떼어 낸다.
function currentAppLang() {
  const raw = i18n.resolvedLanguage || i18n.language || ''
  const code = raw.split('-')[0]?.trim()?.toLowerCase()
  return SUPPORTED_LANGS.includes(code) ? code : null
}

/**
 * 계정 언어(User.language)를 앱이 보여주는 언어와 맞춘다.
 *
 * 왜 필요한가 (문의 #87, 2026-09-25):
 * 앱 로그인은 시스템 브라우저 → Google → `GET /api/auth/google/callback` 으로 돌아온다.
 * 서버가 그 요청의 Accept-Language 로 User.language 를 정하는데, 그 헤더는 앱이 아니라
 * **시스템 브라우저(Chrome)의 언어**다. Chrome 이 영어인 한국 유저는 language='en' 으로
 * 가입되고, 앱 UI 는 한국어인데 캐릭터만 영어로 말하는 상태가 된다.
 * 서버에도 국가 기반 폴백(pickSignupLang)을 넣었지만, 이 동기화가 근본 해결이다 —
 * 유저가 보는 UI 언어와 캐릭터 언어가 어긋날 수 없게 만든다.
 *
 * 이미 어긋난 채로 쓰고 있던 기존 계정도 다음 접속 때 여기서 교정된다.
 * 마이 탭에서 직접 영어를 고른 유저는 localStorage 에 그 선택이 남아 있어
 * currentAppLang() 도 'en' 이므로 덮어쓰지 않는다.
 *
 * @param {object} user - /auth/me 응답의 user
 * @returns {Promise<string|null>} 서버에 반영한 언어, 바꿀 게 없으면 null
 */
export async function syncAccountLanguage(user) {
  const appLang = currentAppLang()
  if (!appLang || !user) return null
  if (user.language === appLang) return null

  try {
    await api.put('/auth/language', { language: appLang })
    return appLang
  } catch {
    // 언어 동기화 실패가 앱 부팅을 막아선 안 된다. 다음 접속에 다시 시도된다.
    return null
  }
}
