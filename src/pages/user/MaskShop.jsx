import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation, Trans } from 'react-i18next'
import i18n from '../../i18n'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { isNativeBillingAvailable, initBilling, getProducts, purchaseProduct, consumePurchase, getPendingPurchases, getSubscriptionProducts, purchaseSubscription, getActiveSubscriptions } from '../../lib/billing'
import { isAdMobAvailable, initAdMob, showRewardedAd } from '../../lib/admob'
import { requestInAppReview, REVIEW_REWARD_UI_ENABLED } from '../../lib/review'
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
  const { token, masks, setMasks, subscription, user } = useStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = ['subscription', 'shop', 'free', 'styles'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'shop'

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
  const [videoReward, setVideoReward] = useState(null)
  const [dailyChatReward, setDailyChatReward] = useState(null)
  const [checkinClaimed, setCheckinClaimed] = useState(null)
  const [claimingCheckin, setClaimingCheckin] = useState(false)
  const [firstPurchaseEligible, setFirstPurchaseEligible] = useState(false)
  const [toast, setToast] = useState(null) // { kind: 'error' | 'success', text }
  const [shopStyles, setShopStyles] = useState(null) // 상점 표정 스타일 목록 (lazy)
  const [stylesLoading, setStylesLoading] = useState(false)
  const [purchasingStyleId, setPurchasingStyleId] = useState(null)
  const [detailStyle, setDetailStyle] = useState(null) // 의상 상세 모달 대상

  // 다른 페이지에서 스크롤된 상태로 진입해도 상점은 항상 최상단부터 보이게.
  // UserLayout 의 main 이 실제 스크롤 컨테이너 — 그쪽을 0 으로.
  useEffect(() => {
    const main = document.querySelector('main')
    if (main) main.scrollTop = 0
    else window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(id)
  }, [toast])

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
    api.get('/masks/daily-chat-reward/available').then((data) => setDailyChatReward(data)).catch(() => {})
    api.get('/masks/checkin/available').then(({ claimed }) => setCheckinClaimed(claimed)).catch(() => {})
    api.get('/masks/first-purchase-eligible').then(({ eligible }) => setFirstPurchaseEligible(eligible)).catch(() => {})
  }, [token])

  // 표정 스타일 탭 진입 시 지연 로드
  useEffect(() => {
    if (activeTab !== 'styles' || shopStyles !== null || stylesLoading) return
    setStylesLoading(true)
    api.get('/characters/shop/styles')
      .then(({ items }) => setShopStyles(items || []))
      .catch(() => setShopStyles([]))
      .finally(() => setStylesLoading(false))
  }, [activeTab, shopStyles, stylesLoading])

  // 상점 표정 스타일 구매 — 마스크 차감 후 통째 해금
  const purchaseStyle = async (item) => {
    if (requireLogin()) return
    if (purchasingStyleId) return
    // 성인 전용 의상은 성인 인증 완료 유저만 구매 가능
    if (item.adultOnly && !user?.adultVerified) {
      navigate('/adult-verify')
      return
    }
    if (masks < item.maskCost) {
      setDetailStyle(null)
      setActiveTab('shop')
      return
    }
    setPurchasingStyleId(item.styleId)
    try {
      const res = await api.post(`/characters/${item.characterId}/styles/${item.styleId}/purchase`, {})
      if (res.masks !== undefined) setMasks(res.masks)
      setShopStyles((prev) => prev.map((s) => (s.styleId === item.styleId ? { ...s, owned: true } : s)))
      setDetailStyle(null)
      setToast({ kind: 'success', text: t('maskShop.stylePurchased') })
    } catch (err) {
      if (err?.error === 'INSUFFICIENT_MASKS') {
        setDetailStyle(null)
        setActiveTab('shop')
      } else setToast({ kind: 'error', text: t('common.error') })
    } finally {
      setPurchasingStyleId(null)
    }
  }

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
    <div className="relative px-4 pt-4 pb-8">
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
        {['subscription', 'shop', 'styles', 'free'].map((tab) => (
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
                        // 광고를 끝까지 시청하지 않음 — 토스트 없이 조용히 무시
                      } else {
                        // No fill / AD_FAILED / 기타 SDK 에러: 사용자에게 안내
                        setToast({ kind: 'error', text: t('myPage.watchAdNoFill') })
                        if (e.message !== 'AD_FAILED') console.error('Ad reward error:', e)
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
              <p className="text-xs text-gray-600 text-center mt-2">{t('myPage.comingSoon')}</p>
            </>
          )}

          {/* 미션 탭 */}
          {maskModalTab === 'mission' && (
            <div className="flex flex-col gap-2">
              {/* 앱 후기 작성 미션 — 10마스크 리뷰 보상 UI 임시 숨김 (REVIEW_REWARD_UI_ENABLED) */}
              {REVIEW_REWARD_UI_ENABLED && (missions?.review?.claimed ? (
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
              ))}

              {/* 성인 인증 미션 (1회성) */}
              {missions?.adultVerify?.claimed ? (
                <div className="w-full flex items-center justify-center px-4 py-4 rounded-xl border border-gray-700 bg-gray-800/50">
                  <span className="text-xs text-gray-500">{t('myPage.missionClaimed')}</span>
                </div>
              ) : missions?.adultVerify?.completed ? (
                <button
                  onClick={async () => {
                    if (requireLogin()) return
                    if (claimingMission) return
                    setClaimingMission('adultVerify')
                    try {
                      const result = await api.post('/masks/adult-verify-reward')
                      if (result.rewardType === 'EMOTION_VIDEO' && result.video) {
                        setVideoReward(result.video)
                      } else if (!result.alreadyClaimed && result.masks !== undefined) {
                        setMasks(result.masks)
                      }
                      setMissions((prev) => ({ ...prev, adultVerify: { ...prev.adultVerify, claimed: true } }))
                    } catch (e) {
                      console.error('Adult verify reward error:', e)
                    }
                    setClaimingMission(null)
                  }}
                  disabled={claimingMission === 'adultVerify'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-300 font-bold text-sm hover:bg-rose-500/20 transition-all disabled:opacity-50"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span>🔞</span>
                  <span>{t('myPage.missionAdultVerifyClaim')}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (requireLogin()) return
                    navigate('/adult-verify')
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-300 font-bold text-sm hover:bg-rose-500/20 transition-all"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span>🔞</span>
                  <span>{t('myPage.missionAdultVerifyVerify')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 표정 스타일 상점 탭 */}
      {activeTab === 'styles' && (
        <div>
          <p className="text-xs text-gray-500 mb-4">{t('maskShop.stylesTagline')}</p>
          {stylesLoading ? (
            <p className="text-sm text-gray-500 text-center py-10">{t('common.loading')}</p>
          ) : !shopStyles || shopStyles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">{t('maskShop.stylesEmpty')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-x-2 gap-y-4">
              {shopStyles.map((item) => {
                const isBusy = purchasingStyleId === item.styleId
                const needVerify = item.adultOnly && !user?.adultVerified
                return (
                  <button
                    key={item.styleId}
                    onClick={() => setDetailStyle(item)}
                    className="flex flex-col items-center gap-1.5"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* 의상 썸네일 — 홈 스토리처럼 그라데이션 링 원형 */}
                    <div
                      className={`relative w-16 h-16 rounded-full p-[2px] ${
                        item.owned
                          ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                          : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400'
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                        <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-800">
                          {/* 미인증 유저에게 성인전용 의상: 미리보기 완전 숨김 + 가운데 safety */}
                          {item.thumbnailUrl && !needVerify && (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.name || ''}
                              draggable={false}
                              className={`absolute inset-0 w-full h-full object-cover ${item.owned ? '' : 'brightness-[0.55]'}`}
                              loading="lazy"
                            />
                          )}
                          {needVerify && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 pointer-events-none">
                              <span className="text-[10px] font-bold tracking-wide text-white/90 uppercase">safety</span>
                            </div>
                          )}
                          {item.owned && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-6 h-6 rounded-full bg-emerald-600/85 flex items-center justify-center ring-1 ring-white/30">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 캐릭터 프로필 이미지 + 이름 */}
                    <div className="flex items-center gap-1 max-w-full px-0.5">
                      {item.characterProfileImage ? (
                        <img
                          src={item.characterProfileImage}
                          alt=""
                          draggable={false}
                          className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-700"
                        />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-gray-800 flex-shrink-0" />
                      )}
                      <span className="text-[11px] text-gray-200 truncate">{item.characterName}</span>
                    </div>
                    {/* 가격 / 상태 */}
                    <span className="text-[10px] leading-tight w-full text-center truncate">
                      {isBusy ? (
                        <span className="text-gray-400">{t('common.loading')}</span>
                      ) : item.owned ? (
                        <span className="text-emerald-400 font-semibold">{t('maskShop.styleOwned')}</span>
                      ) : needVerify ? (
                        <span className="text-rose-300 font-semibold">{t('maskShop.styleAdultVerify')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-indigo-300 font-bold">
                          <MaskIcon /> {item.maskCost}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 의상 상세 모달 — 흥분/도발 영상 블러 미리보기 + 구매 */}
      {detailStyle && (
        <div
          className="fixed inset-0 z-[80] max-w-[480px] mx-auto bg-black/75 flex items-end"
          onClick={() => { if (purchasingStyleId !== detailStyle.styleId) setDetailStyle(null) }}
        >
          <div
            className="w-full rounded-t-3xl bg-gray-900 border-t border-gray-700 p-5"
            // FREE 티어 네이티브에서는 하단 AdMob 배너(~60px)가 시트를 덮으므로 그만큼 여백 추가
            style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${20 + ((currentTier === 'FREE' && isAdMobAvailable()) ? 60 : 0)}px)` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더: 캐릭터 프로필 + 이름 + 의상명 */}
            <div className="flex items-center gap-2 mb-4">
              {detailStyle.characterProfileImage ? (
                <img src={detailStyle.characterProfileImage} alt="" draggable={false} className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-700" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-800" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400 truncate">{detailStyle.characterName}</p>
                <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                  {detailStyle.name}
                  {detailStyle.adultOnly && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-600/90 text-white text-[9px] font-bold">19+</span>
                  )}
                </p>
              </div>
            </div>

            {/* 미리보기 — 흥분/도발 영상 2개 (미보유 시 블러) */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-gray-500">{t('maskShop.stylePreviewLabel')}</p>
              {detailStyle.videoCount > 0 && (
                <span className="text-[11px] font-semibold text-indigo-300">
                  {t('maskShop.styleVideoCount', { count: detailStyle.videoCount })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(detailStyle.previewVideos?.length ? detailStyle.previewVideos : [detailStyle.thumbnailUrl]).slice(0, 2).map((src, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden bg-gray-800" style={{ aspectRatio: '9 / 16' }}>
                  {src && (detailStyle.previewVideos?.length ? (
                    <video
                      src={src}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={detailStyle.owned ? undefined : { filter: 'blur(16px)', transform: 'scale(1.25)' }}
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={src}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={detailStyle.owned ? undefined : { filter: 'blur(16px)', transform: 'scale(1.25)' }}
                    />
                  ))}
                  {!detailStyle.owned && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 text-center mb-3">{t('maskShop.styleUnlockNote')}</p>

            {/* 구매 버튼 */}
            {detailStyle.owned ? (
              <div className="w-full py-3.5 rounded-xl bg-gray-800 text-gray-500 text-sm font-bold text-center">
                {t('maskShop.styleOwned')}
              </div>
            ) : (
              <button
                onClick={() => purchaseStyle(detailStyle)}
                disabled={purchasingStyleId === detailStyle.styleId}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-bold active:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {purchasingStyleId === detailStyle.styleId ? (
                  t('common.loading')
                ) : detailStyle.adultOnly && !user?.adultVerified ? (
                  t('maskShop.styleAdultVerify')
                ) : (
                  <><MaskIcon /> {detailStyle.maskCost} · {t('maskShop.stylePurchaseConfirm')}</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 성인인증 보상: 랜덤 표정영상 지급 리빌 */}
      {videoReward && (
        <div
          className="fixed inset-0 z-[90] max-w-[480px] mx-auto bg-black/85 flex items-center justify-center p-6"
          onClick={() => setVideoReward(null)}
        >
          <div
            className="w-full rounded-3xl bg-gray-900 border border-gray-700 p-5 flex flex-col items-center"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-rose-300 mb-1">{t('maskShop.videoRewardTitle')}</p>
            <p className="text-[11px] text-gray-400 mb-3 text-center">{t('maskShop.videoRewardDesc')}</p>

            <div className="relative rounded-2xl overflow-hidden bg-gray-800 w-40 mb-3" style={{ aspectRatio: '9 / 16' }}>
              <video
                src={videoReward.videoFilePath}
                poster={videoReward.filePath}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
              />
            </div>

            <p className="text-sm font-bold text-white mb-4">{videoReward.characterName}</p>

            <button
              onClick={() => {
                const cid = videoReward.characterId
                setVideoReward(null)
                navigate(`/collection/${cid}`)
              }}
              className="w-full py-3.5 rounded-xl bg-rose-600 text-white text-sm font-bold active:bg-rose-500 transition-colors mb-2"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('maskShop.videoRewardView')}
            </button>
            <button
              onClick={() => setVideoReward(null)}
              className="w-full py-2 text-xs text-gray-500"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-xs text-white shadow-lg z-50 max-w-[90%] text-center"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
            background: toast.kind === 'success' ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
