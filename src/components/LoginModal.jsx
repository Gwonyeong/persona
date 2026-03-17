import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function LoginModal({ onClose }) {
  const { setToken, setUser } = useStore()
  const googleBtnRef = useRef(null)

  useEffect(() => {
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
        locale: 'ko',
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
      onClose()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* 모달 */}
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
        <p className="text-lg font-bold text-gray-100 mb-2">로그인이 필요해요</p>
        <p className="text-sm text-gray-400 mb-6">
          이 기능을 사용하려면 로그인해주세요.
        </p>

        <div className="flex flex-col gap-2.5 items-center">
          <div ref={googleBtnRef} />
          <button
            onClick={onClose}
            className="px-10 py-2.5 bg-gray-800 text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
