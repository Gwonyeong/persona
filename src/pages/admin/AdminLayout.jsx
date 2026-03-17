import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NAV_ITEMS = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/characters', label: '캐릭터 관리' },
  { to: '/admin/users', label: '유저 관리' },
]

export default function AdminLayout() {
  const { token } = useStore()
  const [authorized, setAuthorized] = useState(null)

  useEffect(() => {
    if (!token) return
    api
      .get('/auth/me')
      .then(({ user }) => setAuthorized(user.role === 'ADMIN'))
      .catch(() => setAuthorized(false))
  }, [token])

  if (!token) return <Navigate to="/login" replace />
  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        로딩 중...
      </div>
    )
  }
  if (!authorized) return <Navigate to="/" replace />

  return (
    <div className="admin-layout flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold">Pesona Admin</h1>
        </div>
        <div className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
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
