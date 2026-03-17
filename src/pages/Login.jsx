import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Helmet } from 'react-helmet-async'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token, setToken, setUser } = useStore()
  const googleBtnRef = useRef(null)

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'signin_with',
        locale: 'ko',
      })
    }
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const handleCredentialResponse = async (response) => {
    try {
      const { token, user } = await api.post('/auth/google', {
        credential: response.credential,
      })
      setToken(token)
      setUser(user)
      navigate('/', { replace: true })
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <Helmet>
        <title>{t('auth.login')} - Pesona</title>
      </Helmet>
      <h1 className="text-2xl font-bold mb-8">Pesona</h1>
      <div ref={googleBtnRef} />
    </div>
  )
}

export default Login
