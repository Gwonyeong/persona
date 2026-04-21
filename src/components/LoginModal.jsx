import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import i18n from '../i18n'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

const isWebView = () => {
  const ua = navigator.userAgent || ''
  return /wv|WebView/i.test(ua) || (ua.includes('Android') && ua.includes('Version/'))
}

export default function LoginModal({ onClose, onLoginSuccess }) {
  const { t } = useTranslation()
  const { setToken, setUser, token } = useStore()
  const googleBtnRef = useRef(null)
  const inWebView = isWebView()
  const hadTokenRef = useRef(!!token)

  // WebView: __handleNativeAuth로 token이 설정되면 로그인 성공 처리
  useEffect(() => {
    if (!hadTokenRef.current && token) {
      window.gtag?.('event', 'login', { method: 'google_webview' })
      if (onLoginSuccess) onLoginSuccess()
      else onClose()
    }
  }, [token])

  useEffect(() => {
    if (inWebView) return

    const initGoogle = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
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
      const { token, user } = await api.post('/auth/google', {
        credential: response.credential,
      })
      setToken(token)
      setUser(user)
      window.gtag?.('event', 'login', { method: 'google' })
      if (onLoginSuccess) onLoginSuccess()
      else onClose()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleWebViewLogin = () => {
    // 시스템 브라우저에서 OAuth를 열어야 Google이 차단하지 않음
    const authUrl = `${API_URL}/auth/google/redirect`
    if (window.Android?.openInBrowser) {
      window.Android.openInBrowser(authUrl)
    } else {
      window.open(authUrl, '_system')
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* 모달 */}
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
        <p className="text-lg font-bold text-gray-100 mb-2">{t('login.title')}</p>
        <p className="text-sm text-gray-400 mb-6">
          {t('login.description')}
        </p>

        <div className="flex flex-col gap-2.5 items-center">
          {inWebView ? (
            <button
              onClick={handleWebViewLogin}
              className="flex items-center gap-3 px-6 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', width: 280 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/></svg>
              {t('login.googleLogin')}
            </button>
          ) : (
            <div ref={googleBtnRef} />
          )}
          <button
            onClick={onClose}
            className="px-10 py-2.5 bg-gray-800 text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
