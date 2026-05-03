import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import useBackHandler from '../hooks/useBackHandler'
import { HOST_NAME, HOST_AVATAR } from '../lib/onboardingHost'
import { loadVoices, playVoiceByKey, stopVoice } from '../lib/onboardingVoices'

const SIGNUP_BONUS_MASKS = 30
const ONBOARDING_KEY = 'welcomeSheet'

export default function WelcomeMaskSheet() {
  const { t } = useTranslation()
  const { user, setUser } = useStore()

  const shouldShow = !!user && !user.onboardingState?.[ONBOARDING_KEY]

  const close = () => {
    stopVoice()
    setUser({
      ...user,
      onboardingState: { ...(user.onboardingState || {}), [ONBOARDING_KEY]: true },
    })
    api.patch('/auth/onboarding', { key: ONBOARDING_KEY }).catch(() => {})
  }

  useBackHandler(shouldShow, close)

  useEffect(() => {
    if (!shouldShow) return
    window.gtag?.('event', 'welcome_sheet_view')
    // 음성 자동 재생 (윤하린 인사) — 자동재생 차단 시 silent fail
    loadVoices().then(() => playVoiceByKey('welcome', 'title'))
    return () => stopVoice()
  }, [shouldShow])

  if (!shouldShow) return null

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={close} />

      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
        {/* 호스트(윤하린) + 가입 선물 배지 */}
        <div className="flex flex-col items-center mb-5">
          <div className="relative">
            <img
              src={HOST_AVATAR}
              alt={HOST_NAME}
              className="w-24 h-24 rounded-full object-cover ring-2 ring-indigo-500/40"
              style={{ boxShadow: '0 0 24px 6px rgba(99, 102, 241, 0.35)' }}
            />
            <div className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-indigo-600 rounded-full text-xs font-bold text-white shadow-lg flex items-center gap-1">
              <span>🎭</span>
              <span>+{SIGNUP_BONUS_MASKS}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <p className="text-xs text-gray-400 font-medium">{HOST_NAME}</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                loadVoices().then(() => playVoiceByKey('welcome', 'title'))
              }}
              aria-label="다시 듣기"
              className="text-gray-500 hover:text-indigo-400 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </button>
          </div>
        </div>

        <h2 className="text-lg font-bold text-white text-center mb-1">
          {t('welcome.title')}
        </h2>
        <p className="text-sm text-gray-400 text-center mb-5">
          {t('welcome.subtitle', { count: SIGNUP_BONUS_MASKS })}
        </p>

        {/* 안내 리스트 */}
        <ul className="flex flex-col gap-3 mb-6">
          <li className="flex items-start gap-3">
            <div className="w-7 h-7 flex-shrink-0 rounded-full bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 text-sm">1</div>
            <p className="text-sm text-gray-300 leading-relaxed">{t('welcome.tip1')}</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-7 h-7 flex-shrink-0 rounded-full bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 text-sm">2</div>
            <p className="text-sm text-gray-300 leading-relaxed">{t('welcome.tip2')}</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-7 h-7 flex-shrink-0 rounded-full bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 text-sm">3</div>
            <p className="text-sm text-gray-300 leading-relaxed">{t('welcome.tip3')}</p>
          </li>
        </ul>

        <button
          onClick={close}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('welcome.cta')}
        </button>
      </div>
    </div>
  )
}
