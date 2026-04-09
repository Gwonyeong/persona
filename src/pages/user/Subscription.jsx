import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import {
  isNativeBillingAvailable,
  initBilling,
  getSubscriptionProducts,
  purchaseSubscription,
  getActiveSubscriptions,
} from '../../lib/billing'

const FEATURES = [
  { key: 'chat', label: '채팅' },
  { key: 'dailyMasks', label: '일일 가면 지급' },
  { key: 'characters', label: '대화 캐릭터' },
  { key: 'contentLevel', label: '콘텐츠 수위' },
  { key: 'imageGen', label: '이미지 생성' },
  { key: 'adFree', label: '광고 제거' },
]

const PLANS = [
  {
    id: null,
    tier: 'FREE',
    name: '무료',
    price: '₩0',
    features: {
      chat: '가면 소모',
      dailyMasks: '-',
      characters: '10명',
      contentLevel: '기본',
      imageGen: '가면 소모',
      adFree: '-',
    },
  },
  {
    id: 'light_plan',
    tier: 'LIGHT',
    name: '라이트',
    price: '₩9,900',
    trial: '첫 1주일 무료',
    features: {
      chat: '가면 소모',
      dailyMasks: '30개/일',
      characters: '무제한',
      contentLevel: '과감한 이미지',
      imageGen: '가면 소모',
      adFree: true,
    },
  },
]

export default function Subscription() {
  const navigate = useNavigate()
  const { subscription } = useStore()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [billingReady, setBillingReady] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const currentTier = subscription?.tier || 'FREE'

  useEffect(() => {
    const init = async () => {
      const native = isNativeBillingAvailable()
      setIsNative(native)
      if (native) {
        const ready = await initBilling()
        setBillingReady(ready)
        if (ready) await getSubscriptionProducts()
      }
    }
    init()
  }, [])

  const handleSubscribe = async () => {
    if (currentTier === 'LIGHT') return
    setLoading(true)
    setErrorMsg('')

    try {
      if (!isNative || !billingReady) {
        setErrorMsg('Google Play 결제를 사용할 수 없습니다.')
        setLoading(false)
        return
      }

      const result = await purchaseSubscription('light_plan')
      const token = result?.purchaseToken || result?.transactionReceipt?.purchaseToken || result?.receipt

      if (!token) {
        setErrorMsg('구매 토큰을 찾을 수 없습니다.')
        setLoading(false)
        return
      }

      const serverRes = await api.post('/subscriptions/verify', {
        productId: 'light_plan',
        purchaseToken: token,
      })

      if (serverRes.error) {
        setErrorMsg(serverRes.error)
        setLoading(false)
        return
      }

      useStore.getState().setSubscription(serverRes.subscription)
      const meRes = await api.get('/auth/me')
      if (meRes.user) useStore.getState().setUser(meRes.user)

      navigate('/my')
    } catch (err) {
      const msg = err?.message || ''
      if (!msg.includes('USER_CANCELED') && !msg.includes('userCancelled')) {
        setErrorMsg(msg || '구독 처리 중 오류가 발생했습니다.')
      }
    }

    setLoading(false)
  }

  const handleRestore = async () => {
    setRestoring(true)
    setErrorMsg('')
    try {
      const activeSubs = await getActiveSubscriptions()
      let restored = false
      for (const sub of activeSubs) {
        const pt = sub.purchaseToken
        if (pt) {
          const res = await api.post('/subscriptions/restore', { purchaseToken: pt })
          if (res.subscription) {
            useStore.getState().setSubscription(res.subscription)
            restored = true
            break
          }
        }
      }
      if (!restored) {
        setErrorMsg('복원할 구독이 없습니다.')
      } else {
        navigate('/my')
      }
    } catch {
      setErrorMsg('구독 복원에 실패했습니다.')
    }
    setRestoring(false)
  }

  const manageSubscription = () => {
    window.open(
      'https://play.google.com/store/account/subscriptions?sku=light_plan&package=com.pesona.app',
      '_blank'
    )
  }

  const renderCell = (value) => {
    if (value === true) {
      return <span className="text-green-400 text-sm font-bold">&#10003;</span>
    }
    if (value === '-') {
      return <span className="text-gray-600">-</span>
    }
    return <span className="text-gray-200 text-xs">{value}</span>
  }

  return (
    <div className="px-4 pt-4 pb-8">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/my')}
          className="w-8 h-8 flex items-center justify-center text-gray-400"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">구독 플랜</h1>
      </div>

      {/* 비교 테이블 */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {/* 플랜 헤더 */}
        <div className="grid grid-cols-3 border-b border-gray-800">
          <div className="p-3" />
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.tier
            const isLight = plan.tier === 'LIGHT'
            return (
              <div
                key={plan.tier}
                className={`p-3 text-center ${isLight ? 'bg-indigo-500/5' : ''}`}
              >
                {isCurrent && (
                  <span className="inline-block px-1.5 py-0.5 bg-green-600/80 rounded text-[9px] font-bold text-white mb-1">
                    현재
                  </span>
                )}
                <p className={`text-sm font-bold ${isLight ? 'text-indigo-300' : 'text-gray-100'}`}>
                  {plan.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {plan.price}
                  {plan.id && <span className="text-gray-600">/월</span>}
                </p>
                {plan.trial && !isCurrent && (
                  <p className="text-[10px] text-green-400 font-semibold mt-1">{plan.trial}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* 기능 행 */}
        {FEATURES.map((feature, i) => (
          <div
            key={feature.key}
            className={`grid grid-cols-3 ${i < FEATURES.length - 1 ? 'border-b border-gray-800/50' : ''}`}
          >
            <div className="p-3 flex items-center">
              <span className="text-xs text-gray-400 font-medium">{feature.label}</span>
            </div>
            {PLANS.map((plan) => {
              const isLight = plan.tier === 'LIGHT'
              return (
                <div
                  key={plan.tier}
                  className={`p-3 flex items-center justify-center ${isLight ? 'bg-indigo-500/5' : ''}`}
                >
                  {renderCell(plan.features[feature.key])}
                </div>
              )
            })}
          </div>
        ))}

        {/* CTA 버튼 행 */}
        <div className="grid grid-cols-3 border-t border-gray-800 p-3 gap-2">
          <div />
          <div /> {/* 무료는 빈칸 */}
          {currentTier === 'LIGHT' ? (
            <button
              onClick={manageSubscription}
              className="py-2.5 text-xs font-medium text-gray-400 bg-gray-800 rounded-lg border border-gray-700"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              구독 관리
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {loading ? '처리중...' : '무료로 시작하기'}
            </button>
          )}
        </div>
      </div>

      {/* 에러 메시지 */}
      {errorMsg && (
        <p className="text-sm text-red-400 text-center mt-4">{errorMsg}</p>
      )}

      {/* 라이트 하이라이트 */}
      <div className="mt-5 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
        <p className="text-sm font-bold text-indigo-300 mb-2">라이트 플랜의 혜택</p>
        <ul className="space-y-1.5">
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>매일 가면 30개 지급 — 매일 꾸준히 대화하세요</span>
          </li>
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>모든 캐릭터와 자유롭게 대화</span>
          </li>
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>더 과감한 이미지 콘텐츠 잠금 해제</span>
          </li>
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>광고 없이 깔끔한 경험</span>
          </li>
        </ul>
        <p className="text-xs text-green-400/80 mt-3">
          첫 1주일은 무료! 체험 기간 내 해지하면 요금이 청구되지 않아요.
        </p>
      </div>

      {/* 하단 링크 */}
      <div className="mt-5 flex flex-col items-center gap-3">
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {restoring ? '복원 중...' : '이전 구독 복원'}
        </button>
        <p className="text-[10px] text-gray-600 text-center leading-relaxed">
          구독은 Google Play를 통해 관리됩니다.<br />
          언제든 Play Store에서 해지할 수 있습니다.
        </p>
      </div>
    </div>
  )
}
