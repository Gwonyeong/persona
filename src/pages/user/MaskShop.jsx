import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation, Trans } from 'react-i18next'
import i18n from '../../i18n'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { isNativeBillingAvailable, initBilling, getProducts, purchaseProduct, consumePurchase, getPendingPurchases, getSubscriptionProducts, purchaseSubscription, getActiveSubscriptions } from '../../lib/billing'
import { isAdMobAvailable, initAdMob, showRewardedAd } from '../../lib/admob'
import { requestInAppReview } from '../../lib/review'
import { goToLogin } from '../../lib/auth'
import MaskIcon from '../../components/MaskIcon'
import ShopPromoSection from '../../components/ShopPromoSection'

const YOONHARIN_IMAGE_URL = 'https://zstwgwszakivdnhwbuei.supabase.co/storage/v1/object/public/pesona/dev/sprites/25/NEUTRAL.png'

async function verifyOnServer(productId, purchaseToken) {
  const result = await api.post('/masks/verify-purchase', { productId, purchaseToken })
  useStore.getState().setMasks(result.masks)
  return result
}

export default function MaskShop() {
  const { t } = useTranslation()
  const { token, masks, setMasks, subscription } = useStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = ['subscription', 'shop', 'free'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'shop'

  const PACKAGES = [
    { amount: 30, price: t('pricing.masks30'), originalPrice: t('pricing.masks30Original'), discount: '50%', label: t('masks.pkg30'), productId: 'masks_30' },
    { amount: 120, price: t('pricing.masks100'), originalPrice: t('pricing.masks100Original'), discount: '50%', label: t('masks.pkg100'), badge: t('masks.badgePopular'), productId: 'masks_100' },
    { amount: 450, price: t('pricing.masks300'), originalPrice: t('pricing.masks300Original'), discount: '50%', label: t('masks.pkg300'), productId: 'masks_300' },
  ]

  const currentTier = subscription?.tier || 'FREE'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [selectedPkg, setSelectedPkg] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')
  const [billingReady, setBillingReady] = useState(false)
  const [isNative, setIsNative] = useState(false)

  // 구독
  const [subLoading, setSubLoading] = useState(false)
  const [subError, setSubError] = useState('')
  const [restoring, setRestoring] = useState(false)

  // 리워드 광고
  const [adRewardAvailable, setAdRewardAvailable] = useState(false)
  const [adRewardRemaining, setAdRewardRemaining] = useState(0)
  const [adLoading, setAdLoading] = useState(false)
  const [adMobReady, setAdMobReady] = useState(false)
  const [maskModalTab, setMaskModalTab] = useState('daily')
  const [missions, setMissions] = useState(null)
  const [claimingMission, setClaimingMission] = useState(null)
  const [feedLikeReward, setFeedLikeReward] = useState(null)
  const [dailyChatReward, setDailyChatReward] = useState(null)
  const [checkinClaimed, setCheckinClaimed] = useState(null)
  const [claimingCheckin, setClaimingCheckin] = useState(false)
  const [firstPurchaseEligible, setFirstPurchaseEligible] = useState(false)

  const requireLogin = () => {
    if (!token) {
      goToLogin(navigate)
      return true
    }
    return false
  }

  useEffect(() => {
    const native = isNativeBillingAvailable()
    setIsNative(native)
    if (native) {
      initBilling().then(async (ready) => {
        setBillingReady(ready)
        if (ready) {
          await getProducts()
          await getSubscriptionProducts()
          const pending = await getPendingPurchases()
          for (const purchase of pending) {
            const pid = purchase.productIdentifier || purchase.productId
            const pt = purchase.purchaseToken
            try { await verifyOnServer(pid, pt) } catch {
              try { await api.post('/masks/consume-purchase', { productId: pid, purchaseToken: pt }) } catch {}
            }
            await consumePurchase(pt)
          }
        }
      })
    }
    if (isAdMobAvailable()) {
      initAdMob().then(setAdMobReady)
    }
  }, [])

  const handleSubscribe = async () => {
    if (requireLogin()) return
    if (currentTier === 'LIGHT') return
    setSubLoading(true)
    setSubError('')
    try {
      if (!isNative || !billingReady) {
        setSubError(t('subscription.googlePlayError'))
        setSubLoading(false)
        return
      }
      const result = await purchaseSubscription('light_plan')
      const purchaseToken = result?.purchaseToken || result?.transactionReceipt?.purchaseToken || result?.receipt
      if (!purchaseToken) {
        setSubError(t('subscription.tokenNotFound'))
        setSubLoading(false)
        return
      }
      const serverRes = await api.post('/subscriptions/verify', { productId: 'light_plan', purchaseToken })
      if (serverRes.error) {
        setSubError(serverRes.error)
        setSubLoading(false)
        return
      }
      useStore.getState().setSubscription(serverRes.subscription)
      window.gtag?.('event', 'subscription_purchase', { plan: 'light_plan' })
      const meRes = await api.get('/auth/me')
      if (meRes.user) useStore.getState().setUser(meRes.user)
    } catch (err) {
      const msg = err?.message || ''
      if (!msg.includes('USER_CANCELED') && !msg.includes('userCancelled')) {
        setSubError(msg || t('subscription.subscribeError'))
      }
    }
    setSubLoading(false)
  }

  const handleRestore = async () => {
    if (requireLogin()) return
    setRestoring(true)
    setSubError('')
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
      if (!restored) setSubError(t('subscription.restoreNone'))
    } catch {
      setSubError(t('subscription.restoreFailed'))
    }
    setRestoring(false)
  }

  const manageSubscription = () => {
    window.open('https://play.google.com/store/account/subscriptions?sku=light_plan&package=com.pesona.app', '_blank')
  }

  useEffect(() => {
    if (!token) return
    api.get('/masks/balance').then(({ masks }) => setMasks(masks)).catch(() => {})
    api.get('/masks/ad-reward/available').then(({ available, remaining }) => { setAdRewardAvailable(available); setAdRewardRemaining(remaining) }).catch(() => {})
    api.get('/masks/missions').then(({ missions }) => setMissions(missions)).catch(() => {})
    api.get('/masks/feed-like-reward/available').then((data) => setFeedLikeReward(data)).catch(() => {})
    api.get('/masks/daily-chat-reward/available').then((data) => setDailyChatReward(data)).catch(() => {})
    api.get('/masks/checkin/available').then(({ claimed }) => setCheckinClaimed(claimed)).catch(() => {})
    api.get('/masks/first-purchase-eligible').then(({ eligible }) => setFirstPurchaseEligible(eligible)).catch(() => {})
  }, [token])

  const handlePurchase = async () => {
    if (requireLogin()) return
    setPurchasing(true)
    setPurchaseError('')
    try {
      const pkg = PACKAGES[selectedPkg]
      api.post('/masks/purchase-attempt', { package: pkg.productId }).catch(() => {})

      if (!isNative || !billingReady) {
        setPurchaseError(t('myPage.purchaseEnvError'))
        setPurchasing(false)
        return
      }

      const result = await purchaseProduct(pkg.productId)
      const purchaseToken = result?.purchaseToken || result?.transactionReceipt?.purchaseToken || result?.receipt
      if (!purchaseToken) {
        setPurchaseError(t('myPage.purchaseInfoError'))
        setPurchasing(false)
        return
      }

      const serverRes = await api.post('/masks/verify-purchase', { productId: pkg.productId, purchaseToken })
      if (serverRes.error) {
        setPurchaseError(serverRes.error)
        setPurchasing(false)
        return
      }

      await consumePurchase(purchaseToken)
      setMasks(serverRes.masks)
      if (serverRes.firstPurchaseBonus) {
        setFirstPurchaseEligible(false)
        window.gtag?.('event', 'first_purchase_bonus', { bonus: serverRes.firstPurchaseBonus })
      }
    } catch (err) {
      const msg = err?.message || ''
      if (!msg.includes('USER_CANCELED') && !msg.includes('userCancelled')) {
        setPurchaseError(msg || t('myPage.purchaseFailed'))
      }
    }
    setPurchasing(false)
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <Helmet>
        <title>{t('maskShop.title')}</title>
      </Helmet>

      {/* 뒤로가기 + 타이틀 + 잔액 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center text-gray-400"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">{t('maskShop.heading')}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <MaskIcon className="text-xl" />
          <span className="text-lg font-bold text-indigo-400">{masks}</span>
        </div>
      </div>

      {/* 메인 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
        {['subscription', 'shop', 'free'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-gray-700 text-white'
                : 'text-gray-400'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t(`maskShop.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
            {tab === 'subscription' && currentTier !== 'LIGHT' && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 구독 탭 */}
      {activeTab === 'subscription' && (
        <>
          {/* 무료 박스 */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-gray-100">{t('subscription.free')}</p>
                {currentTier === 'FREE' && (
                  <span className="inline-block px-1.5 py-0.5 bg-green-600/80 rounded text-[9px] font-bold text-white">
                    {t('subscription.current')}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400">{t('pricing.free')}</p>
            </div>
            <p className="text-xs text-gray-500 mb-4">{t('subscription.freeBoxTagline')}</p>
            <ul className="space-y-2">
              <li className="text-xs text-gray-300 flex items-center gap-2">
                <span className="text-gray-500">&#10003;</span>
                <span>{t('subscription.feature.characters')} · {t('subscription.featureValue.tenCharacters')}</span>
              </li>
              <li className="text-xs text-gray-300 flex items-center gap-2">
                <span className="text-gray-500">&#10003;</span>
                <span>{t('subscription.feature.chat')} · {t('subscription.featureValue.maskCost')}</span>
              </li>
            </ul>
          </div>

          {/* 라이트 박스 */}
          <div className="mt-4 bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-indigo-500/15 rounded-2xl border border-indigo-500/30 p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-indigo-300">{t('subscription.light')}</p>
                {currentTier === 'LIGHT' && (
                  <span className="inline-block px-1.5 py-0.5 bg-green-600/80 rounded text-[9px] font-bold text-white">
                    {t('subscription.current')}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-100">
                  {t('pricing.light')}
                  <span className="text-gray-500 font-normal text-xs">{t('subscription.perMonth')}</span>
                </p>
              </div>
            </div>

            {/* 윤하린 + 가입 보너스 말풍선 */}
            <div className="flex items-end gap-2 my-4">
              <img
                src={YOONHARIN_IMAGE_URL}
                alt=""
                className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/40 shrink-0 bg-indigo-500/10"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
              <div className="relative flex-1 bg-indigo-500/25 border border-indigo-400/40 rounded-2xl rounded-bl-sm px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <MaskIcon className="text-base shrink-0" />
                  <p className="text-xs text-indigo-50 leading-snug font-medium">
                    {t('subscription.signupBonusBubble')}
                  </p>
                </div>
              </div>
            </div>

            {/* 혜택 리스트 */}
            <ul className="space-y-2 mb-4">
              {[1, 2, 4, 5].map((i) => (
                <li key={i} className="text-xs text-gray-200 flex items-start gap-2">
                  <span className="text-indigo-400 mt-0.5">&#10003;</span>
                  <span className="inline-flex items-center gap-1 flex-wrap">
                    <Trans
                      i18nKey={`subscription.lightBenefit${i}`}
                      components={{ mask: <MaskIcon className="text-sm" /> }}
                    />
                  </span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            {currentTier === 'LIGHT' ? (
              <button
                onClick={manageSubscription}
                className="w-full py-3 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg border border-gray-700"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('subscription.manageSubscription')}
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={subLoading}
                className="w-full py-3 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg transition-colors disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {subLoading ? t('common.processing') : t('subscription.startFree')}
              </button>
            )}
          </div>

          {subError && (
            <p className="text-sm text-red-400 text-center mt-4">{subError}</p>
          )}

          {/* 하단 링크 */}
          <div className="mt-4 flex flex-col items-center gap-3">
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
        </>
      )}

      {/* 상점 탭 */}
      {activeTab === 'shop' && (
        <>
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MaskIcon className="text-3xl" />
              <div>
                <p className="text-sm font-bold text-gray-100">{t('myPage.masks')}</p>
                <p className="text-xs text-gray-400">{t('myPage.masksDesc')}</p>
              </div>
            </div>
            <span className="text-lg font-bold text-indigo-400">{t('myPage.masksCount', { count: masks })}</span>
          </div>

          {firstPurchaseEligible && (
            <div className="mb-3 p-3 bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 rounded-xl flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-bold text-amber-300">{t('masks.firstPurchaseBanner')}</p>
                <p className="text-xs text-amber-400/70">{t('masks.firstPurchaseDesc')}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 mb-3">
            {PACKAGES.map((pkg, i) => (
              <button
                key={pkg.amount}
                onClick={() => setSelectedPkg(i)}
                className={`relative flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  selectedPkg === i
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center gap-2">
                  <MaskIcon className="text-xl" />
                  <span className="font-semibold text-sm text-gray-100">{pkg.label}</span>
                  {firstPurchaseEligible && (
                    <span className="text-xs font-bold text-amber-400">
                      {t('masks.firstPurchaseBonus', { count: Math.floor(pkg.amount / 2) })}
                    </span>
                  )}
                  {pkg.badge && (
                    <span className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] font-bold text-white">
                      {pkg.badge}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {pkg.originalPrice && (
                    <span className="text-xs text-gray-500 line-through">{pkg.originalPrice}</span>
                  )}
                  <span className="text-sm font-medium text-gray-300">{pkg.price}</span>
                </div>
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-500 text-center mb-3">
            {t('myPage.masksHint')}
          </p>

          {purchaseError && (
            <p className="text-sm text-red-400 text-center mb-3">{purchaseError}</p>
          )}

          <button
            onClick={handlePurchase}
            disabled={purchasing}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {purchasing ? t('common.processing') : t('myPage.purchase', { price: PACKAGES[selectedPkg].price })}
          </button>
        </div>
        <ShopPromoSection />
        </>
      )}

      {/* 무료 탭 */}
      {activeTab === 'free' && (
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
          {/* 서브 탭 */}
          <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
            {['daily', 'mission'].map((tab) => (
              <button
                key={tab}
                onClick={() => setMaskModalTab(tab)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  maskModalTab === tab
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t(`myPage.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
              </button>
            ))}
          </div>

          {/* 데일리 탭 */}
          {maskModalTab === 'daily' && (
            <>
              {/* 출석체크 */}
              <button
                onClick={async () => {
                  if (requireLogin()) return
                  if (checkinClaimed || claimingCheckin) return
                  setClaimingCheckin(true)
                  try {
                    const result = await api.post('/masks/checkin')
                    if (!result.alreadyClaimed) setMasks(result.masks)
                    setCheckinClaimed(true)
                  } catch (e) {
                    console.error('Checkin error:', e)
                  }
                  setClaimingCheckin(false)
                }}
                disabled={checkinClaimed}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border mb-3 transition-all ${
                  checkinClaimed
                    ? 'border-gray-700 bg-gray-800/50'
                    : 'border-amber-500/50 bg-amber-500/10'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📅</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-100">{t('myPage.dailyCheckin')}</p>
                    <p className="text-xs text-gray-400">{t('myPage.dailyCheckinDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {checkinClaimed ? (
                    <span className="text-xs text-gray-500">{t('myPage.watchAdClaimed')}</span>
                  ) : (
                    <>
                      <MaskIcon className="text-lg" />
                      <span className="text-sm font-bold text-amber-400">+3</span>
                    </>
                  )}
                </div>
              </button>

              {/* 캐릭터와 5회 채팅 데일리 */}
              <button
                onClick={async () => {
                  if (requireLogin()) return
                  if (!dailyChatReward || dailyChatReward.claimed || dailyChatReward.chatCount < 5) {
                    if (!dailyChatReward?.claimed && (!dailyChatReward || dailyChatReward.chatCount < 5)) {
                      navigate('/')
                    }
                    return
                  }
                  try {
                    const result = await api.post('/masks/daily-chat-reward')
                    if (!result.alreadyClaimed) setMasks(result.masks)
                    setDailyChatReward((prev) => ({ ...prev, claimed: true }))
                  } catch (e) {
                    console.error('Daily chat reward error:', e)
                  }
                }}
                disabled={dailyChatReward?.claimed}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border mb-3 transition-all ${
                  dailyChatReward?.claimed
                    ? 'border-gray-700 bg-gray-800/50'
                    : dailyChatReward?.chatCount >= 5
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-gray-700 bg-gray-800/50'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💬</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-100">{t('myPage.dailyChat')}</p>
                    <p className="text-xs text-gray-400">{t('myPage.dailyChatDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {dailyChatReward?.claimed ? (
                    <span className="text-xs text-gray-500">{t('myPage.watchAdClaimed')}</span>
                  ) : dailyChatReward?.chatCount >= 5 ? (
                    <>
                      <MaskIcon className="text-lg" />
                      <span className="text-sm font-bold text-amber-400">+3</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">{t('myPage.dailyChatProgress', { count: dailyChatReward?.chatCount ?? 0 })}</span>
                  )}
                </div>
              </button>

              {adMobReady && (
                <button
                  onClick={async () => {
                    if (requireLogin()) return
                    if (!adRewardAvailable || adLoading) return
                    setAdLoading(true)
                    try {
                      await showRewardedAd()
                      const result = await api.post('/masks/ad-reward')
                      setMasks(result.masks)
                      const newRemaining = adRewardRemaining - 1
                      setAdRewardRemaining(newRemaining)
                      setAdRewardAvailable(newRemaining > 0)
                    } catch (e) {
                      if (e.message === 'AD_DISMISSED') {
                        // 광고를 끝까지 시청하지 않음
                      } else if (e.message !== 'AD_FAILED') {
                        console.error('Ad reward error:', e)
                      }
                    }
                    setAdLoading(false)
                  }}
                  disabled={!adRewardAvailable || adLoading}
                  className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border mb-3 transition-all ${
                    adRewardAvailable
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-gray-700 bg-gray-800/50'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎬</span>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-100">{t('myPage.watchAd')}</p>
                      <p className="text-xs text-gray-400">
                        {adRewardAvailable ? t('myPage.watchAdRemaining', { count: adRewardRemaining }) : t('myPage.watchAdClaimed')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {adRewardAvailable && (
                      <>
                        <MaskIcon className="text-lg" />
                        <span className="text-sm font-bold text-amber-400">+5</span>
                      </>
                    )}
                    {!adRewardAvailable && <span className="text-xs text-gray-500">{t('myPage.watchAdLimit')}</span>}
                  </div>
                </button>
              )}
              {/* 피드 좋아요 3개 데일리 */}
              <button
                onClick={async () => {
                  if (requireLogin()) return
                  if (!feedLikeReward || feedLikeReward.claimed || feedLikeReward.likeCount < 3) {
                    if (!feedLikeReward?.claimed && (!feedLikeReward || feedLikeReward.likeCount < 3)) {
                      navigate('/feed')
                    }
                    return
                  }
                  try {
                    const result = await api.post('/masks/feed-like-reward')
                    if (!result.alreadyClaimed) setMasks(result.masks)
                    setFeedLikeReward((prev) => ({ ...prev, claimed: true }))
                  } catch (e) {
                    console.error('Feed like reward error:', e)
                  }
                }}
                disabled={feedLikeReward?.claimed}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border mb-3 transition-all ${
                  feedLikeReward?.claimed
                    ? 'border-gray-700 bg-gray-800/50'
                    : feedLikeReward?.likeCount >= 3
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-gray-700 bg-gray-800/50'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">❤️</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-100">{t('myPage.dailyFeedLike')}</p>
                    <p className="text-xs text-gray-400">{t('myPage.dailyFeedLikeDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {feedLikeReward?.claimed ? (
                    <span className="text-xs text-gray-500">{t('myPage.watchAdClaimed')}</span>
                  ) : feedLikeReward?.likeCount >= 3 ? (
                    <>
                      <MaskIcon className="text-lg" />
                      <span className="text-sm font-bold text-amber-400">+3</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">{t('myPage.dailyFeedLikeProgress', { count: feedLikeReward?.likeCount ?? 0 })}</span>
                  )}
                </div>
              </button>

              <p className="text-xs text-gray-600 text-center mt-2">{t('myPage.comingSoon')}</p>
            </>
          )}

          {/* 미션 탭 */}
          {maskModalTab === 'mission' && (
            <div className="flex flex-col gap-2">
              {/* 앱 후기 작성 미션 */}
              {missions?.review?.claimed ? (
                <div className="w-full flex items-center justify-center px-4 py-4 rounded-xl border border-gray-700 bg-gray-800/50">
                  <span className="text-xs text-gray-500">{t('myPage.missionClaimed')}</span>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    if (requireLogin()) return
                    if (claimingMission) return
                    setClaimingMission('review')
                    try {
                      await requestInAppReview()
                      const result = await api.post('/masks/review-reward')
                      if (!result.alreadyClaimed) {
                        setMasks(result.masks)
                      }
                      setMissions((prev) => ({ ...prev, review: { ...prev.review, claimed: true } }))
                    } catch (e) {
                      console.error('Review reward error:', e)
                    }
                    setClaimingMission(null)
                  }}
                  disabled={claimingMission === 'review'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-400 font-bold text-sm hover:bg-amber-500/20 transition-all"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span>⭐</span>
                  <span>{t('myPage.missionReviewButton')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
