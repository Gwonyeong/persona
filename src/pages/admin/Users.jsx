import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const ADMIN_BACKUP_KEY = 'adminBackupSession'

function isTestUser(u) {
  return typeof u.googleId === 'string' && u.googleId.startsWith('test_')
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [creating, setCreating] = useState(false)
  const [filterTest, setFilterTest] = useState(false)
  const navigate = useNavigate()
  const { token, user: currentUser, setToken, setUser } = useStore()

  const load = () => {
    api.get('/admin/users').then(({ users }) => setUsers(users))
  }

  useEffect(() => {
    load()
  }, [])

  const createAndLogin = async () => {
    if (creating) return
    setCreating(true)
    try {
      const { token: testToken, user: testUser } = await api.post('/admin/test-users', {})

      sessionStorage.setItem(
        ADMIN_BACKUP_KEY,
        JSON.stringify({ token, user: currentUser, at: Date.now() }),
      )
      window.dispatchEvent(new Event('admin-backup-changed'))

      setToken(testToken)
      setUser(testUser)
      navigate('/')
    } catch (e) {
      alert('테스트 계정 생성 실패: ' + (e.message || 'unknown'))
    } finally {
      setCreating(false)
    }
  }

  const loginAs = (u) => {
    sessionStorage.setItem(
      ADMIN_BACKUP_KEY,
      JSON.stringify({ token, user: currentUser, at: Date.now() }),
    )
    api
      .post(`/admin/test-users/${u.id}/login`, {})
      .then(({ token: testToken, user: testUser }) => {
        setToken(testToken)
        setUser(testUser)
        navigate('/')
      })
      .catch((e) => {
        sessionStorage.removeItem(ADMIN_BACKUP_KEY)
        alert('로그인 실패: ' + (e.message || 'unknown'))
      })
  }

  const remove = async (u) => {
    if (!confirm(`테스트 계정 #${u.id} (${u.name || u.email})을 삭제할까요? 관련 대화/구독/이력이 모두 사라집니다.`)) return
    try {
      await api.delete(`/admin/test-users/${u.id}`)
      load()
    } catch (e) {
      alert('삭제 실패: ' + (e.message || 'unknown'))
    }
  }

  const visibleUsers = filterTest ? users.filter(isTestUser) : users
  const testCount = users.filter(isTestUser).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="text-xl font-bold">유저 관리</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-400 select-none">
            <input
              type="checkbox"
              checked={filterTest}
              onChange={(e) => setFilterTest(e.target.checked)}
              className="accent-indigo-500"
            />
            테스트 계정만 보기 ({testCount})
          </label>
          <button
            type="button"
            onClick={createAndLogin}
            disabled={creating}
            className="px-3 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {creating ? '생성 중...' : '+ 테스트 계정 만들기'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        "테스트 계정 만들기"를 누르면 새 유저(SIGNUP_BONUS 30 마스크 포함)가 생성되고, 그 즉시 어드민 세션을 임시로 백업한 뒤 해당 계정으로 전환됩니다. 화면 상단의 "어드민으로 복귀" 배너로 원래 세션으로 돌아올 수 있습니다.
      </p>

      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {visibleUsers.length === 0 ? (
          <p className="p-4 text-gray-500">유저가 없습니다.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">ID</th>
                <th className="p-3">이름</th>
                <th className="p-3">이메일</th>
                <th className="p-3">역할</th>
                <th className="p-3">대화 수</th>
                <th className="p-3">가입일</th>
                <th className="p-3">액션</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => {
                const test = isTestUser(u)
                return (
                  <tr key={u.id} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3 text-gray-500">{u.id}</td>
                    <td className="p-3">
                      {u.name || '-'}
                      {test && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 align-middle">
                          TEST
                        </span>
                      )}
                    </td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">
                      <span className={u.role === 'ADMIN' ? 'text-indigo-400' : 'text-gray-400'}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3">{u._count.conversations}</td>
                    <td className="p-3 text-gray-400">
                      {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="p-3">
                      {test && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => loginAs(u)}
                            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            로그인
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(u)}
                            className="px-2 py-1 text-xs rounded bg-red-900/60 hover:bg-red-800 text-red-200 transition-colors"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
