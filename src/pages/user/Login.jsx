import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import i18n from '../../i18n'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

const isWebView = () => {
  const ua = navigator.userAgent || ''
  return /wv|WebView/i.test(ua) || (ua.includes('Android') && ua.includes('Version/'))
}

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setToken, setUser, token } = useStore()
  const googleBtnRef = useRef(null)
  const inWebView = isWebView()
  const hadTokenRef = useRef(!!token)

  const returnTo = searchParams.get('returnTo') || '/'

  const goBack = () => {
    navigate(returnTo, { replace: true })
  }

  // WebView에서 딥링크로 토큰이 들어오면 자동 복귀
  useEffect(() => {
    if (!hadTokenRef.current && token) {
      window.gtag?.('event', 'login', { method: 'google_webview' })
      goBack()
    }
  }, [token])

  // 이미 로그인된 채로 진입한 경우 즉시 복귀
  useEffect(() => {
    if (hadTokenRef.current) goBack()
  }, [])

  useEffect(() => {
    if (inWebView) return

    const initGoogle = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_black',
        shape: 'pill',
        size: 'large',
        width: 312,
        text: 'signin_with',
        locale: i18n.language || 'en',
      })
    }

    if (window.google?.accounts?.id) {
      initGoogle()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = initGoogle
      document.body.appendChild(script)
    }
  }, [])

  const handleCredentialResponse = async (response) => {
    try {
      const { token: newToken, user } = await api.post('/auth/google', {
        credential: response.credential,
      })
      setToken(newToken)
      setUser(user)
      window.gtag?.('event', 'login', { method: 'google' })
      goBack()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleWebViewLogin = () => {
    const authUrl = `${API_URL}/auth/google/redirect`
    if (window.Android?.openInBrowser) {
      window.Android.openInBrowser(authUrl)
    } else {
      window.open(authUrl, '_system')
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <style>{`.gis-btn-wrap iframe { border-radius: 999px !important; }`}</style>
      {/* 배경 영상 */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/login_bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        onLoadedMetadata={(e) => { e.currentTarget.playbackRate = 0.5 }}
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= 4) e.currentTarget.currentTime = 0
        }}
      />

      {/* 가독성을 위한 그라데이션 오버레이 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.75) 100%)',
        }}
      />

      {/* 콘텐츠 */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-end px-6"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: `calc(env(safe-area-inset-bottom) + 96px)`,
        }}
      >
        <div className="flex flex-col items-center gap-3 mb-10">
          <p className="text-lg text-white/85 tracking-wide">
            {t('login.heroSubtitle')}
          </p>
          <h1
            className="text-white text-5xl font-bold tracking-tight"
            style={{ fontFamily: 'serif' }}
          >
            Pesona
          </h1>
        </div>

        <div className="flex items-center justify-center w-full">
          {inWebView ? (
            <button
              onClick={handleWebViewLogin}
              className="flex items-center justify-center gap-3 text-white text-base font-medium rounded-2xl transition-colors"
              style={{
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                width: 360,
                height: 64,
                padding: '0 24px',
                background: '#202124',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" />
              </svg>
              {t('login.googleLogin')}
            </button>
          ) : (
            <div
              ref={googleBtnRef}
              className="gis-btn-wrap"
              style={{
                borderRadius: 999,
                overflow: 'hidden',
                width: 360,
                height: 56,
                background: '#202124',
                padding: '8px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            />
          )}
        </div>

        <button
          onClick={goBack}
          className="mt-5 text-xs text-white/60 hover:text-white/80 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
        >
          {t('common.close')}
        </button>

        <p className="mt-3 text-[11px] text-white/50 text-center px-4 leading-relaxed">
          {t('login.termsAgreement')}
        </p>
      </div>
    </div>
  )
}
