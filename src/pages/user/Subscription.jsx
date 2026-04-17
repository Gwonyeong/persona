import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import {
  isNativeBillingAvailable,
  initBilling,
  getSubscriptionProducts,
  purchaseSubscription,
  getActiveSubscriptions,
} from '../../lib/billing'

export default function Subscription() {
  const { t } = useTranslation()

  const FEATURES = [
    { key: 'chat', label: t('subscription.feature.chat') },
    { key: 'dailyMasks', label: t('subscription.feature.dailyMasks') },
    { key: 'characters', label: t('subscription.feature.characters') },
    { key: 'contentLevel', label: t('subscription.feature.contentLevel') },
    { key: 'imageGen', label: t('subscription.feature.imageGen') },
    { key: 'adFree', label: t('subscription.feature.adFree') },
  ]

  const PLANS = [
    {
      id: null,
      tier: 'FREE',
      name: t('subscription.free'),
      price: '₩0',
      features: {
        chat: t('subscription.featureValue.maskCost'),
        dailyMasks: t('subscription.featureValue.none'),
        characters: t('subscription.featureValue.tenCharacters'),
        contentLevel: t('subscription.featureValue.basic'),
        imageGen: t('subscription.featureValue.maskCost'),
        adFree: t('subscription.featureValue.none'),
      },
    },
    {
      id: 'light_plan',
      tier: 'LIGHT',
      name: t('subscription.light'),
      price: '₩9,900',
      trial: t('subscription.trial'),
      features: {
        chat: t('subscription.featureValue.maskCost'),
        dailyMasks: t('subscription.featureValue.thirtyPerDay'),
        characters: t('subscription.featureValue.unlimited'),
        contentLevel: t('subscription.featureValue.boldImages'),
        imageGen: t('subscription.featureValue.maskCost'),
        adFree: true,
      },
    },
  ]
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
        setErrorMsg(t('subscription.googlePlayError'))
        setLoading(false)
        return
      }

      const result = await purchaseSubscription('light_plan')
      const token = result?.purchaseToken || result?.transactionReceipt?.purchaseToken || result?.receipt

      if (!token) {
        setErrorMsg(t('subscription.tokenNotFound'))
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
        setErrorMsg(msg || t('subscription.subscribeError'))
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
        setErrorMsg(t('subscription.restoreNone'))
      } else {
        navigate('/my')
      }
    } catch {
      setErrorMsg(t('subscription.restoreFailed'))
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
        <h1 className="text-xl font-bold">{t('subscription.title')}</h1>
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
                    {t('subscription.current')}
                  </span>
                )}
                <p className={`text-sm font-bold ${isLight ? 'text-indigo-300' : 'text-gray-100'}`}>
                  {plan.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {plan.price}
                  {plan.id && <span className="text-gray-600">{t('subscription.perMonth')}</span>}
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
              {t('subscription.manageSubscription')}
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {loading ? t('common.processing') : t('subscription.startFree')}
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
        <p className="text-sm font-bold text-indigo-300 mb-2">{t('subscription.lightBenefitsTitle')}</p>
        <ul className="space-y-1.5">
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>{t('subscription.lightBenefit1')}</span>
          </li>
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>{t('subscription.lightBenefit2')}</span>
          </li>
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>{t('subscription.lightBenefit3')}</span>
          </li>
          <li className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">&#10003;</span>
            <span>{t('subscription.lightBenefit4')}</span>
          </li>
        </ul>
        <p className="text-xs text-green-400/80 mt-3">
          {t('subscription.lightTrialNote')}
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
          {restoring ? t('subscription.restoring') : t('subscription.restoreLink')}
        </button>
        <p className="text-[10px] text-gray-600 text-center leading-relaxed">
          {t('subscription.managedByGoogle')}<br />
          {t('subscription.cancelAnytime')}
        </p>
      </div>
    </div>
  )
}
