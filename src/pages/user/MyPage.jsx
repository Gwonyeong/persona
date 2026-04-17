import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import { requestPushPermission, getPushPermissionStatus, unregisterPushNotifications } from '../../lib/push'
import { isNativeBillingAvailable, initBilling, getProducts, purchaseProduct, consumePurchase, getPendingPurchases } from '../../lib/billing'
import { isAdMobAvailable, initAdMob, showRewardedAd } from '../../lib/admob'
import { requestInAppReview } from '../../lib/review'
// import AdBanner from '../../components/AdBanner'

function resizeImage(file, maxSize = 512) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > height) {
        if (width > maxSize) { height = (height * maxSize) / width; width = maxSize }
      } else {
        if (height > maxSize) { width = (width * maxSize) / height; height = maxSize }
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8)
    }
    img.src = url
  })
}

async function verifyOnServer(productId, purchaseToken) {
  const result = await api.post('/masks/verify-purchase', { productId, purchaseToken })
  useStore.getState().setMasks(result.masks)
  return result
}

export default function MyPage() {
  const { t } = useTranslation()
  const { token, masks, setMasks, clearAuth, subscription } = useStore()
  const navigate = useNavigate()

  const PACKAGES = [
    { amount: 30, price: '₩1,000', label: t('masks.pkg30'), productId: 'masks_30' },
    { amount: 100, price: '₩3,000', label: t('masks.pkg100'), badge: t('masks.badgePopular'), productId: 'masks_100' },
    { amount: 300, price: '₩8,000', label: t('masks.pkg300'), badge: t('masks.badgeDiscount'), productId: 'masks_300' },
  ]
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [dbUser, setDbUser] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pushStatus, setPushStatus] = useState('default')
  const fileInputRef = useRef(null)

  // 마스크 충전
  const [selectedPkg, setSelectedPkg] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')
  const [billingReady, setBillingReady] = useState(false)
  const [isNative, setIsNative] = useState(false)

  // 리워드 광고
  const [adRewardAvailable, setAdRewardAvailable] = useState(false)
  const [adLoading, setAdLoading] = useState(false)
  const [adMobReady, setAdMobReady] = useState(false)
  const [showMaskModal, setShowMaskModal] = useState(false)

  useEffect(() => {
    getPushPermissionStatus().then(setPushStatus)
    const native = isNativeBillingAvailable()
    setIsNative(native)
    if (native) {
      initBilling().then(async (ready) => {
        setBillingReady(ready)
        if (ready) {
          await getProducts()
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

  useEffect(() => {
    if (!token) return
    api.get('/auth/me').then(({ user }) => setDbUser(user))
    api.get('/masks/balance').then(({ masks }) => setMasks(masks)).catch(() => {})
    api.get('/masks/ad-reward/available').then(({ available }) => setAdRewardAvailable(available)).catch(() => {})
  }, [token])

  const startEdit = () => {
    setEditName(dbUser?.name || '')
    setPreviewUrl(null)
    setSelectedFile(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setPreviewUrl(null)
    setSelectedFile(null)
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const resized = await resizeImage(file)
    setSelectedFile(resized)
    setPreviewUrl(URL.createObjectURL(resized))
  }

  const handleSave = async () => {
    if (saving) return
    const name = editName.trim()
    if (!name || name.length > 20) return

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      if (selectedFile) {
        formData.append('avatar', selectedFile, 'avatar.webp')
      }
      const { user } = await api.put('/auth/profile', formData)
      setDbUser(user)
      setEditing(false)
      setPreviewUrl(null)
      setSelectedFile(null)
    } catch (error) {
      console.error('Profile update error:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    navigate('/')
  }

  const handlePurchase = async () => {
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
    } catch (err) {
      const msg = err?.message || ''
      if (!msg.includes('USER_CANCELED') && !msg.includes('userCancelled')) {
        setPurchaseError(msg || t('myPage.purchaseFailed'))
      }
    }
    setPurchasing(false)
  }

  const avatarDisplay = previewUrl || dbUser?.avatarUrl

  return (
    <div className="px-4 pt-4">
      <Helmet>
        <title>{t('myPage.title')}</title>
        <meta name="description" content={t('myPage.metaDescription')} />
      </Helmet>
      <h1 className="text-xl font-bold mb-6">{t('myPage.heading')}</h1>
      {/* <div className="mb-4">
        <AdBanner slot="3193498609" />
      </div> */}

      {!token ? (
        <div className="text-center py-20">
          <p className="text-gray-300 font-semibold mb-2">{t('myPage.loginRequired')}</p>
          <p className="text-sm text-gray-500 mb-6">{t('myPage.loginRequiredDesc')}</p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.login')}
          </button>
          {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
        </div>
      ) : (
      <>
      {/* 프로필 */}
      <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
        {editing ? (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 group"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {avatarDisplay ? (
                <img src={avatarDisplay} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl">
                  {editName?.[0] || '?'}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={20}
              placeholder={t('myPage.nickname')}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none text-center"
            />
            <div className="flex gap-2 w-full">
              <button
                onClick={cancelEdit}
                className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex-1 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
              {dbUser?.avatarUrl ? (
                <img src={dbUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl">
                  {dbUser?.name?.[0] || '?'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{dbUser?.name || t('common.user')}</p>
              <p className="text-sm text-gray-400">{dbUser?.email}</p>
            </div>
            <button
              onClick={startEdit}
              className="px-3 py-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('common.edit')}
            </button>
          </div>
        )}
      </div>

      {/* 구독 플랜 */}
      <div className="mt-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-100">{t('myPage.subscriptionPlan')}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {subscription?.tier === 'LIGHT' ? t('myPage.light') : t('myPage.free')}
              {subscription?.tier === 'LIGHT' && subscription?.expiresAt && (
                <span className="text-gray-500"> · {t('myPage.until', { date: new Date(subscription.expiresAt).toLocaleDateString(i18n.language) })}</span>
              )}
            </p>
          </div>
          <button
            onClick={() => navigate('/subscription')}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
              subscription?.tier === 'LIGHT'
                ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {subscription?.tier === 'LIGHT' ? t('myPage.manage') : t('myPage.subscribe')}
          </button>
        </div>
      </div>

      {/* 마스크 충전 */}
      <div className="mt-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎭</span>
            <div>
              <p className="text-sm font-bold text-gray-100">{t('myPage.masks')}</p>
              <p className="text-xs text-gray-400">{t('myPage.masksDesc')}</p>
            </div>
          </div>
          <span className="text-lg font-bold text-indigo-400">{t('myPage.masksCount', { count: masks })}</span>
        </div>

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
                <span className="text-base">🎭</span>
                <span className="font-semibold text-sm text-gray-100">{pkg.label}</span>
                {pkg.badge && (
                  <span className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] font-bold text-white">
                    {pkg.badge}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-gray-300">{pkg.price}</span>
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

      {/* 마스크 얻기 버튼 */}
      <button
        onClick={() => setShowMaskModal(true)}
        className="w-full mt-4 py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-400 transition-colors"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        {t('myPage.earnMasks')}
      </button>

      {/* 마스크 얻기 모달 */}
      {showMaskModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowMaskModal(false)}>
          <div
            className="w-full max-w-[480px] bg-gray-900 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{t('myPage.earnMasks')}</h2>
              <button
                onClick={() => setShowMaskModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 광고보고 마스크 얻기 */}
            {adMobReady && (
              <button
                onClick={async () => {
                  if (!adRewardAvailable || adLoading) return
                  setAdLoading(true)
                  try {
                    await showRewardedAd()
                    const result = await api.post('/masks/ad-reward')
                    setMasks(result.masks)
                    setAdRewardAvailable(false)
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
                      {adRewardAvailable ? t('myPage.watchAdAvailable') : t('myPage.watchAdClaimed')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {adRewardAvailable && (
                    <>
                      <span className="text-sm">🎭</span>
                      <span className="text-sm font-bold text-amber-400">+5</span>
                    </>
                  )}
                  {!adRewardAvailable && <span className="text-xs text-gray-500">{t('myPage.watchAdLimit')}</span>}
                </div>
              </button>
            )}

            <p className="text-xs text-gray-600 text-center mt-2">{t('myPage.comingSoon')}</p>
          </div>
        </div>
      )}

      {/* 메뉴 */}
      <div className="mt-4 bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
        {pushStatus !== 'unsupported' && (
          <button
            onClick={async () => {
              if (pushStatus === 'granted') {
                await unregisterPushNotifications()
                setPushStatus('default')
              } else {
                const result = await requestPushPermission()
                setPushStatus(result)
              }
            }}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-800/50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-gray-200">{t('myPage.notifications')}</span>
            <div className={`w-10 h-[22px] rounded-full relative transition-colors ${pushStatus === 'granted' ? 'bg-indigo-600' : 'bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform ${pushStatus === 'granted' ? 'translate-x-[20px]' : 'translate-x-0.5'}`} />
            </div>
          </button>
        )}
        {pushStatus === 'granted' && (
          <button
            onClick={async () => {
              try {
                const result = await api.post('/push/test')
                alert(`알림 전송 완료 (Web: ${result.webSubs}, FCM: ${result.fcmTokens})`)
              } catch (err) {
                alert(`알림 전송 실패: ${err.message}`)
              }
            }}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-800/50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-gray-200">{t('myPage.testNotification')}</span>
            <span className="text-xs text-gray-500">{t('myPage.testNotificationDesc')}</span>
          </button>
        )}
        {dbUser?.role === 'ADMIN' && (
          <button
            onClick={async () => {
              try {
                await requestInAppReview()
                alert('리뷰 다이얼로그 호출 완료')
              } catch (e) {
                alert(`리뷰 호출 실패: ${e.message}`)
              }
            }}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-800/50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-amber-400">{t('myPage.reviewTest')}</span>
            <span className="text-xs text-gray-500">In-App Review</span>
          </button>
        )}
        {dbUser?.role === 'ADMIN' && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-800/50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-indigo-400">{t('myPage.adminPage')}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center px-4 py-3.5 text-sm text-red-400 hover:bg-gray-800/50 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('common.logout')}
        </button>
        <button
          onClick={() => navigate('/account/delete')}
          className="w-full flex items-center px-4 py-3.5 text-sm text-gray-500 hover:bg-gray-800/50 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('myPage.deleteAccount')}
        </button>
      </div>
      </>
      )}
    </div>
  )
}
