import { useState, useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'

const TABS = [
  {
    to: '/',
    label: '홈',
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
    label: '피드',
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
    label: '대화',
    requireAuth: true,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: '/my',
    label: '마이',
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
  const { token } = useStore()
  const location = useLocation()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const isChatPage = location.pathname.startsWith('/chats/')

  useEffect(() => {
    const handler = (e) => setHasUnread(e.detail > 0)
    window.addEventListener('unread-count', handler)
    return () => window.removeEventListener('unread-count', handler)
  }, [])

  return (
    <div className="user-layout flex flex-col h-dvh max-h-dvh bg-gray-950 text-gray-100" style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none' }}>
      <main className={`flex-1 ${isChatPage ? 'overflow-hidden' : 'overflow-auto'}`}>
        <Outlet />

        {/* 푸터 */}
        {!isChatPage && (
          <footer className="px-4 py-6 mt-4 border-t border-gray-800">
            <div className="flex justify-center gap-3 text-xs text-gray-500">
              <Link to="/about" className="hover:text-gray-300 transition-colors">서비스 소개</Link>
              <span>·</span>
              <Link to="/terms" className="hover:text-gray-300 transition-colors">이용약관</Link>
              <span>·</span>
              <a href="/privacy-policy.html" className="hover:text-gray-300 transition-colors">개인정보처리방침</a>
            </div>
            <p className="text-center text-[10px] text-gray-600 mt-2">© 2026 Pesona. All rights reserved.</p>
          </footer>
        )}
      </main>

      {/* 하단 탭바 */}
      <nav className={`flex flex-shrink-0 border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm ${isChatPage ? 'hidden' : ''}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((tab) =>
          tab.requireAuth && !token ? (
            <button
              key={tab.to}
              onClick={() => setShowLoginModal(true)}
              className="flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs text-gray-500 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ) : (
            <NavLink
              key={tab.to}
              to={tab.to}
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
              <span>{tab.label}</span>
            </NavLink>
          )
        )}
      </nav>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </div>
  )
}
