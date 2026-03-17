import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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
  const [showLoginModal, setShowLoginModal] = useState(false)

  return (
    <div className="user-layout flex flex-col h-screen bg-gray-950 text-gray-100">
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* 하단 탭바 */}
      <nav className="flex border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm">
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
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          )
        )}
      </nav>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </div>
  )
}
