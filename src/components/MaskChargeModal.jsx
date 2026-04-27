import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import { isNativeBillingAvailable, initBilling, getProducts, purchaseProduct, consumePurchase, getPendingPurchases } from '../lib/billing'

async function verifyOnServer(productId, purchaseToken) {
  const result = await api.post('/masks/verify-purchase', { productId, purchaseToken })
  useStore.getState().setMasks(result.masks)
  return result
}

export default function MaskChargeModal({ onClose }) {
  const { t } = useTranslation()
  const { masks } = useStore()

  const PACKAGES = [
    { amount: 60, price: t('pricing.masks30'), label: t('masks.pkg30'), productId: 'masks_30' },
    { amount: 200, price: t('pricing.masks100'), label: t('masks.pkg100'), badge: t('masks.badgePopular'), productId: 'masks_100' },
    { amount: 700, price: t('pricing.masks300'), label: t('masks.pkg300'), badge: t('masks.badgeDiscount'), productId: 'masks_300' },
  ]
  const [selected, setSelected] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [billingReady, setBillingReady] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const [firstPurchaseEligible, setFirstPurchaseEligible] = useState(false)

  useEffect(() => {
    api.get('/masks/first-purchase-eligible').then(({ eligible }) => setFirstPurchaseEligible(eligible)).catch(() => {})
  }, [])

  useEffect(() => {
    const init = async () => {
      const native = isNativeBillingAvailable()
      setIsNative(native)
      if (native) {
        const ready = await initBilling()
        setBillingReady(ready)
        if (ready) {
          const products = await getProducts()
          setDebugInfo(`products: ${JSON.stringify(products?.map(p => p.productIdentifier || p.productId) || null)}`)
          // 미완료 구매 복구 — 검증 시도 후 실패하면 강제 소비
          const pending = await getPendingPurchases()
          for (const purchase of pending) {
            const pid = purchase.productIdentifier || purchase.productId
            const pt = purchase.purchaseToken
            try {
              await verifyOnServer(pid, pt)
            } catch {
              try { await api.post('/masks/consume-purchase', { productId: pid, purchaseToken: pt }) } catch {}
            }
            // 서버 검증 성공/실패 무관하게 클라이언트 측 consume 처리
            await consumePurchase(pt)
          }
        }
      }
    }
    init()
  }, [])

  const handlePurchase = async () => {
    setLoading(true)
    setErrorMsg('')

    try {
      const pkg = PACKAGES[selected]

      // 구매 시도 기록
      api.post('/masks/purchase-attempt', { package: pkg.productId }).catch(() => {})

      if (!isNative || !billingReady) {
        const cap = window.Capacitor
        setErrorMsg(`[DEBUG] isNative=${isNative}, billingReady=${billingReady}, window.Capacitor=${!!cap}, platform=${cap?.getPlatform?.()}, isNative=${cap?.isNativePlatform?.()}`)
        setLoading(false)
        return
      }

      // Google Play 결제
      const result = await purchaseProduct(pkg.productId)
      setDebugInfo(`purchaseResult: ${JSON.stringify(result).slice(0, 500)}`)

      // 서버에서 검증 + 마스크 지급
      const token = result?.purchaseToken || result?.transactionReceipt?.purchaseToken || result?.receipt
      if (!token) {
        setErrorMsg(`[DEBUG] No purchaseToken found in result: ${JSON.stringify(result).slice(0, 300)}`)
        setLoading(false)
        return
      }

      const serverRes = await api.post('/masks/verify-purchase', { productId: pkg.productId, purchaseToken: token })
      if (serverRes.error) {
        setErrorMsg(`[DEBUG] Server: ${serverRes.error}`)
        setLoading(false)
        return
      }

      // 클라이언트 측에서도 consume 처리 (재구매 가능하게)
      await consumePurchase(token)

      useStore.getState().setMasks(serverRes.masks)
      onClose()
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('USER_CANCELED') || msg.includes('userCancelled')) {
        // 사용자 취소 — 에러 표시 안 함
      } else {
        setErrorMsg(`[DEBUG] ${msg || JSON.stringify(err)}`)
      }
    }

    setLoading(false)
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
        {/* 헤더 */}
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">🎭</div>
          <p className="text-lg font-bold text-gray-100">{t('masks.chargeTitle')}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t('masks.currentBalance', { count: masks })}
          </p>
        </div>

        {debugInfo && <p className="text-xs text-yellow-400 text-center mb-2 break-all">{debugInfo}</p>}

        {firstPurchaseEligible && (
          <div className="mb-4 p-2.5 bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 rounded-xl flex items-center gap-2.5">
            <span className="text-xl">🎉</span>
            <div>
              <p className="text-xs font-bold text-amber-300">{t('masks.firstPurchaseBanner')}</p>
              <p className="text-[10px] text-amber-400/70">{t('masks.firstPurchaseDesc')}</p>
            </div>
          </div>
        )}

        {/* 패키지 선택 */}
        <div className="flex flex-col gap-2.5 mb-5">
          {PACKAGES.map((pkg, i) => (
            <button
              key={pkg.amount}
              onClick={() => setSelected(i)}
              className={`relative flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
                selected === i
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🎭</span>
                <span className="font-semibold text-gray-100">{pkg.label}</span>
                {firstPurchaseEligible && (
                  <span className="px-1.5 py-0.5 bg-amber-500 rounded text-[10px] font-bold text-white">
                    {t('masks.firstPurchaseBadge')}
                  </span>
                )}
                {pkg.badge && (
                  <span className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] font-bold text-white">
                    {pkg.badge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {firstPurchaseEligible && (
                  <span className="text-xs font-bold text-amber-400">{pkg.amount * 2}</span>
                )}
                <span className="text-sm font-medium text-gray-300">{pkg.price}</span>
              </div>
            </button>
          ))}
        </div>

        {/* 안내 */}
        <p className="text-xs text-gray-500 text-center mb-4">
          {t('masks.hint')}
        </p>

        {errorMsg && (
          <p className="text-sm text-red-400 text-center mb-4">{errorMsg}</p>
        )}

        {/* 버튼 */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {loading ? t('common.processing') : t('masks.purchaseButton', { price: PACKAGES[selected].price })}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
