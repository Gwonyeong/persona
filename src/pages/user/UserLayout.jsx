import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'
import MaskIcon from '../../components/MaskIcon'
import { isAdMobAvailable, initAdMob, showBannerAd, removeBannerAd } from '../../lib/admob'

const TABS = [
  {
    to: '/',
    labelKey: 'nav.home',
    requireAuth: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    to: '/feed',
    labelKey: 'nav.feed',
    requireAuth: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    to: '/chats',
    labelKey: 'nav.chats',
    requireAuth: true,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: '/my',
    labelKey: 'nav.my',
    requireAuth: true,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

export default function UserLayout() {
  const { t } = useTranslation()
  const { token, subscription } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [hasUnread, setHasUnread] = useState(false)
  const isChatPage =
    location.pathname.match(/^\/chats\/\d/) ||
    location.pathname.match(/^\/chats-v2\/\d/) ||
    location.pathname.match(/^\/group-chats\/\d/) ||
    location.pathname === '/group-chats/new' ||
    location.pathname.match(/^\/vn\/\d/)
  const isFullscreenPage = isChatPage || location.pathname.startsWith('/characters/')
  // 가챠 페이지는 박스가 화면을 풀-블리드로 채우는 디자인 — 탭바·푸터·하단 spacer 모두 숨김.
  const isGachaPage = location.pathname.startsWith('/gacha')
  const hideFooter = isFullscreenPage || isGachaPage
  const hideNav = isFullscreenPage || isGachaPage

  const isFreeTier = (subscription?.tier || 'FREE') === 'FREE'
  const shouldShowBanner = !isFullscreenPage && isFreeTier
  const adMobAvailable = isAdMobAvailable()
  const reserveBannerSlot = shouldShowBanner && adMobAvailable

  useEffect(() => {
    const handler = (e) => setHasUnread(e.detail > 0)
    window.addEventListener('unread-count', handler)
    return () => window.removeEventListener('unread-count', handler)
  }, [])

  useEffect(() => {
    if (!adMobAvailable) return
    if (!shouldShowBanner) {
      removeBannerAd()
      return
    }
    let cancelled = false
    initAdMob().then((ok) => {
      if (!cancelled && ok) showBannerAd()
    })
    return () => {
      cancelled = true
    }
  }, [adMobAvailable, shouldShowBanner])

  useEffect(() => {
    return () => {
      if (isAdMobAvailable()) removeBannerAd()
    }
  }, [])

  return (
    <div className="user-layout relative flex flex-col h-dvh max-h-dvh bg-gray-950 text-gray-100" style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none', paddingTop: 'env(safe-area-inset-top)' }}>
      <main className={`flex-1 ${isChatPage ? 'overflow-hidden' : 'overflow-auto'}`}>
        <Outlet />

        {/* 푸터 */}
        {!hideFooter && (
          <footer className="px-4 py-6 mt-4 border-t border-gray-800">
            <div className="flex justify-center gap-3 text-xs text-gray-500">
              <Link to="/about" className="hover:text-gray-300 transition-colors">{t('footer.about')}</Link>
              <span>·</span>
              <Link to="/terms" className="hover:text-gray-300 transition-colors">{t('footer.terms')}</Link>
              <span>·</span>
              <Link to="/refund" className="hover:text-gray-300 transition-colors">{t('footer.refund')}</Link>
              <span>·</span>
              <Link to="/privacy" className="hover:text-gray-300 transition-colors">{t('footer.privacy')}</Link>
            </div>
            <p className="text-center text-[10px] text-gray-600 mt-2">© 2026 Pesona. All rights reserved.</p>
          </footer>
        )}
      </main>

      {/* 하단 탭바 (채팅 / 캐릭터 풀스크린 / 가챠 페이지에서는 숨김) */}
      {!hideNav && (
      <nav className="relative z-[60] flex flex-shrink-0 border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm">
        {TABS.map((tab, i) => (
          <React.Fragment key={tab.to}>
            {i === 2 && (
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={() => navigate('/mask-shop')}
                  className="absolute -top-5 z-[60] w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <MaskIcon style={{ width: 44, height: 44 }} />
                  {subscription?.tier !== 'LIGHT' && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-900" />
                  )}
                </button>
              </div>
            )}
            {tab.requireAuth && !token ? (
              <button
                onClick={() => goToLogin(navigate)}
                className="flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs text-gray-500 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {tab.icon}
                <span>{t(tab.labelKey)}</span>
              </button>
            ) : (
              <NavLink
                to={tab.to}
                replace
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${
                    isActive ? 'text-indigo-400' : 'text-gray-500'
                  }`
                }
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="relative">
                  {tab.icon}
                  {tab.to === '/chats' && hasUnread && (
                    <div className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </div>
                <span>{t(tab.labelKey)}</span>
              </NavLink>
            )}
          </React.Fragment>
        ))}
      </nav>
      )}

      {/* nav 하단 spacer
          - reserveBannerSlot=true → AdMob 네이티브 배너가 화면 절대 하단에 오버레이됨.
            spacer 높이를 (배너 ~60px + safe-area)로 확보해 nav 오탭/가림 방지.
          - false → safe-area 패딩만 (LIGHT 구독자 / iOS / web). */}
      {!hideNav && (
        <div
          className="flex-shrink-0 bg-gray-900/95"
          style={
            reserveBannerSlot
              ? { height: 'calc(60px + env(safe-area-inset-bottom))' }
              : { paddingBottom: 'env(safe-area-inset-bottom)' }
          }
        />
      )}
    </div>
  )
}
