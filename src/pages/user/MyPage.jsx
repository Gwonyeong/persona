import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

export default function MyPage() {
  const { clearAuth } = useStore()
  const navigate = useNavigate()
  const [dbUser, setDbUser] = useState(null)

  useEffect(() => {
    api.get('/auth/me').then(({ user }) => setDbUser(user))
  }, [])

  const handleLogout = () => {
    clearAuth()
    navigate('/')
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-bold mb-6">마이</h1>

      {/* 프로필 */}
      <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <div className="w-14 h-14 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
          {dbUser?.avatarUrl ? (
            <img src={dbUser.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl">
              {dbUser?.name?.[0] || '?'}
            </div>
          )}
        </div>
        <div>
          <p className="font-semibold">{dbUser?.name || '사용자'}</p>
          <p className="text-sm text-gray-400">{dbUser?.email}</p>
        </div>
      </div>

      {/* 메뉴 */}
      <div className="mt-4 bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
        {dbUser?.role === 'ADMIN' && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-800/50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-indigo-400">어드민 페이지</span>
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
          로그아웃
        </button>
      </div>
    </div>
  )
}
