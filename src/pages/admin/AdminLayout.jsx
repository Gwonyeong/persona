import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NAV_ITEMS = [
  { to: '/admin', label: '대시보드', end: true },
  {
    key: 'character',
    label: '캐릭터',
    children: [
      { to: '/admin/characters', label: '캐릭터 관리' },
      { to: '/admin/storylines', label: '스토리' },
      { to: '/admin/expressions', label: '표정 이미지' },
      { to: '/admin/base-images', label: '베이스 이미지', deprecated: true },
      { to: '/admin/affinity-images', label: '호감도 이미지', deprecated: true },
    ],
  },
  { to: '/admin/banners', label: '광고 배너' },
  { to: '/admin/mask-pass', label: '마스크 패스' },
  { to: '/admin/broadcasts', label: '푸시 알림' },
  { to: '/admin/notifications', label: '인앱 알림' },
  { to: '/admin/users', label: '유저 관리' },
  { to: '/admin/surveys', label: '설문조사' },
  { to: '/admin/inquiries', label: '문의 관리', badgeKey: 'pendingInquiries' },
  {
    key: 'finance',
    label: '재무',
    children: [
      { to: '/admin/finance/subscriptions', label: '구독' },
      { to: '/admin/finance/mask-purchases', label: '마스크 구매' },
      { to: '/admin/finance/mask-stats', label: '마스크 사용 통계' },
    ],
  },
]

const STORAGE_KEY = 'admin:sidebar:openGroups'

function loadOpenGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export default function AdminLayout() {
  const { token } = useStore()
  const [authorized, setAuthorized] = useState(null)
  const location = useLocation()

  const activeGroupKeys = useMemo(() => {
    const keys = new Set()
    for (const item of NAV_ITEMS) {
      if (!item.children) continue
      const hit = item.children.some((c) => location.pathname.startsWith(c.to))
      if (hit) keys.add(item.key)
    }
    return keys
  }, [location.pathname])

  const [openGroups, setOpenGroups] = useState(() => {
    const stored = loadOpenGroups()
    if (stored) return stored
    const initial = {}
    for (const item of NAV_ITEMS) {
      if (item.children) initial[item.key] = true
    }
    return initial
  })

  useEffect(() => {
    if (activeGroupKeys.size === 0) return
    setOpenGroups((prev) => {
      let changed = false
      const next = { ...prev }
      for (const key of activeGroupKeys) {
        if (!next[key]) {
          next[key] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [activeGroupKeys])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups))
    } catch {
      // ignore storage errors
    }
  }, [openGroups])

  useEffect(() => {
    if (!token) return
    api
      .get('/auth/me')
      .then(({ user }) => setAuthorized(user.role === 'ADMIN'))
      .catch(() => setAuthorized(false))
  }, [token])

  const [badges, setBadges] = useState({ pendingInquiries: 0 })

  useEffect(() => {
    if (!authorized) return
    let cancelled = false
    const refresh = () => {
      api
        .get('/inquiries/admin/pending-count')
        .then(({ count }) => {
          if (!cancelled) setBadges((prev) => ({ ...prev, pendingInquiries: count }))
        })
        .catch(() => {})
    }
    refresh()
    const interval = setInterval(refresh, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [authorized, location.pathname])

  if (!token) return <Navigate to="/" replace />
  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        로딩 중...
      </div>
    )
  }
  if (!authorized) return <Navigate to="/" replace />

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="admin-layout flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold">Pesona Admin</h1>
        </div>
        <div className="flex-1 py-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              const isOpen = !!openGroups[item.key]
              const hasActiveChild = activeGroupKeys.has(item.key)
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.key)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                      hasActiveChild
                        ? 'text-white font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                    style={{
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`text-xs transition-transform ${
                        isOpen ? 'rotate-90' : ''
                      }`}
                    >
                      ▶
                    </span>
                  </button>
                  {isOpen && (
                    <div className="pb-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          className={({ isActive }) =>
                            `block pl-8 pr-4 py-2 text-sm transition-colors ${
                              isActive
                                ? child.deprecated
                                  ? 'bg-gray-800/60 text-gray-400 font-medium'
                                  : 'bg-gray-800 text-white font-medium'
                                : child.deprecated
                                ? 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/30'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                            }`
                          }
                        >
                          {child.label}
                          {child.deprecated && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-600">
                              deprecated
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            const badgeCount = item.badgeKey ? badges[item.badgeKey] || 0 : 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`
                }
              >
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span
                    className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none"
                    title={`답변 대기 ${badgeCount}건`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
        <div className="p-4 border-t border-gray-800">
          <NavLink to="/" className="text-sm text-gray-500 hover:text-gray-300">
            ← 서비스로 돌아가기
          </NavLink>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
