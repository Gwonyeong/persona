import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// PortOne SDK는 CDN으로 동적 로드. (npm 의존성 추가 없이 운영)
const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js'

// Capacitor WebView 감지. WebView는 popup window를 못 띄우므로 redirect 모드로 전환.
function isWebView() {
  const ua = navigator.userAgent || ''
  return /wv|WebView/i.test(ua) || (ua.includes('Android') && ua.includes('Version/'))
}

function loadPortoneSdk() {
  if (window.PortOne) return Promise.resolve(window.PortOne)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PORTONE_SDK_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.PortOne))
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.src = PORTONE_SDK_URL
    s.async = true
    s.onload = () => resolve(window.PortOne)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

const ERROR_TO_I18N = {
  ALREADY_VERIFIED: 'adultVerify.error.alreadyVerified',
  DAILY_LIMIT_EXCEEDED: 'adultVerify.error.dailyLimit',
  FOREIGNER_REJECTED: 'adultVerify.error.foreigner',
  UNDERAGE: 'adultVerify.error.underage',
  DI_DUPLICATE: 'adultVerify.error.diDuplicate',
  NOT_VERIFIED: 'adultVerify.error.notVerified',
  BIRTH_DATE_MISSING: 'adultVerify.error.birthMissing',
  DI_MISSING: 'adultVerify.error.diMissing',
  PORTONE_ERROR: 'adultVerify.error.portone',
  NOT_FOUND: 'adultVerify.error.notFound',
}

export default function AdultVerify() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token } = useStore()

  const [status, setStatus] = useState(null) // { verified, verifiedAt, birthDate, gender }
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  const [errorRaw, setErrorRaw] = useState(null)
  const handledReturnRef = useRef(false)

  // PortOne redirect 모드에서 돌아오면 쿼리스트링에 identityVerificationId/code/message가 붙는다.
  // 한 번만 처리하고 URL 정리.
  useEffect(() => {
    if (!token || handledReturnRef.current) return
    const params = new URLSearchParams(window.location.search)
    const returnIvId = params.get('identityVerificationId')
    if (!returnIvId) return
    handledReturnRef.current = true

    const returnCode = params.get('code')
    const returnMessage = params.get('message')
    window.history.replaceState({}, '', window.location.pathname)

    if (returnCode) {
      setErrorKey('adultVerify.error.cancelled')
      setErrorRaw(returnMessage || returnCode)
      setLoading(false)
      return
    }

    setVerifying(true)
    api.post('/identity/confirm', { identityVerificationId: returnIvId })
      .then((result) => {
        setStatus({
          verified: true,
          verifiedAt: result.verifiedAt,
          birthDate: result.birthDate,
          gender: result.gender,
        })
      })
      .catch((err) => {
        const code = err?.data?.error
        if (code && ERROR_TO_I18N[code]) {
          setErrorKey(ERROR_TO_I18N[code])
          setErrorRaw(err?.data?.message || null)
        } else {
          setErrorKey('adultVerify.error.unknown')
          setErrorRaw(err?.message || null)
        }
      })
      .finally(() => {
        setVerifying(false)
        setLoading(false)
      })
  }, [token])

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    // redirect 복귀 처리가 진행 중이면 status 조회는 건너뜀 (handledReturnRef로 중복 방지)
    if (handledReturnRef.current) return
    api.get('/identity/status')
      .then(setStatus)
      .catch(() => setStatus({ verified: false }))
      .finally(() => setLoading(false))
  }, [token, navigate])

  const startVerification = async () => {
    if (verifying) return
    setVerifying(true)
    setErrorKey(null)
    setErrorRaw(null)
    try {
      // 1. 서버에서 identityVerificationId 발급
      const { identityVerificationId, channelKey, storeId } = await api.post('/identity/start', {})

      // 2. PortOne SDK 로드 + 본인인증 요청 (다날 채널, PASS 우선 + SMS 폴백)
      const PortOne = await loadPortoneSdk()

      // WebView는 popup window를 못 띄움 → redirect 모드로 전환.
      // 같은 페이지(/adult-verify)로 돌아오면 useEffect가 쿼리스트링을 잡아 /confirm 호출.
      if (isWebView()) {
        PortOne.requestIdentityVerification({
          storeId,
          identityVerificationId,
          channelKey,
          redirectUrl: window.location.origin + window.location.pathname,
        })
        // 페이지가 PortOne으로 navigate되므로 여기 이후 코드는 실행되지 않음.
        return
      }

      // 일반 브라우저: popup 모드
      const sdkResult = await PortOne.requestIdentityVerification({
        storeId,
        identityVerificationId,
        channelKey,
      })

      // SDK 결과: code가 있으면 실패, 없으면 성공으로 서버에 confirm 요청
      if (sdkResult?.code) {
        setErrorKey('adultVerify.error.cancelled')
        setErrorRaw(sdkResult.message || sdkResult.code)
        return
      }

      // 3. 서버에 confirm (PortOne 단건조회 + 정책검증 + DI 중복체크)
      const result = await api.post('/identity/confirm', { identityVerificationId })
      setStatus({
        verified: true,
        verifiedAt: result.verifiedAt,
        birthDate: result.birthDate,
        gender: result.gender,
      })
    } catch (err) {
      const code = err?.data?.error
      if (code && ERROR_TO_I18N[code]) {
        setErrorKey(ERROR_TO_I18N[code])
        setErrorRaw(err?.data?.message || null)
      } else {
        setErrorKey('adultVerify.error.unknown')
        setErrorRaw(err?.message || null)
      }
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
      >
        <button onClick={() => navigate('/my')} className="text-gray-400 hover:text-white" style={NO_OUTLINE}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-semibold text-sm text-white">{t('adultVerify.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {status?.verified ? (
          <div className="bg-gray-900 rounded-xl border border-emerald-700/40 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-300">{t('adultVerify.statusVerified')}</p>
                <p className="text-[11px] text-gray-500">
                  {status.verifiedAt && new Date(status.verifiedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{t('adultVerify.verifiedDesc')}</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-4">
              <h2 className="text-sm font-semibold text-white mb-2">{t('adultVerify.heading')}</h2>
              <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-line">
                {t('adultVerify.description')}
              </p>
            </div>

            <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 p-4 mb-4">
              <p className="text-[11px] text-gray-500 mb-2">{t('adultVerify.policyTitle')}</p>
              <ul className="text-[11px] text-gray-400 space-y-1.5 list-disc list-inside leading-relaxed">
                <li>{t('adultVerify.policy.adultOnly')}</li>
                <li>{t('adultVerify.policy.koreanOnly')}</li>
                <li>{t('adultVerify.policy.oneAccount')}</li>
                <li>{t('adultVerify.policy.dailyLimit')}</li>
                <li>{t('adultVerify.policy.dataPolicy')}</li>
              </ul>
            </div>

            {errorKey && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs text-red-300">{t(errorKey)}</p>
                {errorRaw && <p className="text-[10px] text-red-400/70 mt-1">{errorRaw}</p>}
              </div>
            )}

            <button
              onClick={startVerification}
              disabled={verifying}
              className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              style={NO_OUTLINE}
            >
              {verifying ? t('adultVerify.verifying') : t('adultVerify.start')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
