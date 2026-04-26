import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import FeedbackButton from '../../components/FeedbackButton'

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
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const isChatPage = location.pathname.match(/^\/chats\/\d/)
  const isFullscreenPage = isChatPage || location.pathname.startsWith('/characters/')
  const showFeedback = location.pathname === '/' || location.pathname === '/my'

  useEffect(() => {
    const handler = (e) => setHasUnread(e.detail > 0)
    window.addEventListener('unread-count', handler)
    return () => window.removeEventListener('unread-count', handler)
  }, [])

  return (
    <div className="user-layout relative flex flex-col h-dvh max-h-dvh bg-gray-950 text-gray-100" style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none', paddingTop: 'env(safe-area-inset-top)' }}>
      <main className={`flex-1 ${isChatPage ? 'overflow-hidden' : 'overflow-auto'}`}>
        <Outlet />

        {/* 푸터 */}
        {!isFullscreenPage && (
          <footer className="px-4 py-6 mt-4 border-t border-gray-800">
            <div className="flex justify-center gap-3 text-xs text-gray-500">
              <Link to="/about" className="hover:text-gray-300 transition-colors">{t('footer.about')}</Link>
              <span>·</span>
              <Link to="/terms" className="hover:text-gray-300 transition-colors">{t('footer.terms')}</Link>
              <span>·</span>
              <Link to="/privacy" className="hover:text-gray-300 transition-colors">{t('footer.privacy')}</Link>
            </div>
            <p className="text-center text-[10px] text-gray-600 mt-2">© 2026 Pesona. All rights reserved.</p>
          </footer>
        )}
      </main>

      {/* 피드백 버튼 */}
      {showFeedback && <FeedbackButton />}

      {/* 하단 탭바 */}
      <nav className="relative flex flex-shrink-0 border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((tab, i) => (
          <React.Fragment key={tab.to}>
            {i === 2 && (
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={() => navigate('/mask-shop')}
                  className="absolute -top-5 w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="28" height="28" viewBox="0 0 32 20" fill="white" fillRule="evenodd" style={{ transform: 'scaleY(-1)' }}>
                    <path d="M0 10C0 5 3.5 0 8.5 0c2.5 0 4.5 1.2 7.5 4 3-2.8 5-4 7.5-4C28.5 0 32 5 32 10c0 2.5-1 4.5-2.8 6-1.2 1-2.8 1.8-4.2 2.2-1.5.4-2.8.3-3.8-.2-1.2-.6-2.2-1.8-3.5-3.8L16 11l-1.7 3.2c-1.3 2-2.3 3.2-3.5 3.8-1 .5-2.3.6-3.8.2C5.6 17.8 4 17 2.8 16 1 14.5 0 12.5 0 10zM7 7.5C5.5 7.5 4.2 8.5 3.8 10c-.3 1 .2 1.8 1 2.2 1 .5 2.3.3 3.4-.3 1.2-.7 2-1.7 2.3-2.8.3-1-.1-1.8-1-2.2-.5-.2-1.2-.2-1.8-.1l-.7.2zM25 7.5l-.7-.2c-.6-.1-1.3-.1-1.8.1-.9.4-1.3 1.2-1 2.2.3 1.1 1.1 2.1 2.3 2.8 1.1.6 2.4.8 3.4.3.8-.4 1.3-1.2 1-2.2-.4-1.5-1.7-2.5-3.2-2.5z" />
                  </svg>
                  {subscription?.tier !== 'LIGHT' && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-900" />
                  )}
                </button>
              </div>
            )}
            {tab.requireAuth && !token ? (
              <button
                onClick={() => setShowLoginModal(true)}
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

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </div>
  )
}
