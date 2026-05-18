import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const LINK_OPTIONS = [
  { value: '', label: '이동 없음' },
  { value: '/', label: '홈' },
  { value: '/feed', label: '피드' },
  { value: '/chats', label: '채팅 목록' },
  { value: '/my', label: '마이페이지' },
  { value: '/subscription', label: '구독' },
  { value: '/mask-shop', label: '마스크 샵' },
  { value: '/feedback', label: '피드백' },
]

const EMPTY_FORM = {
  title: '',
  body: '',
  imageUrl: '',
  linkPath: '',
  audience: 'ALL',
}

function formatKST(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', { hour12: false })
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [targetUsers, setTargetUsers] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState([])
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)

  const load = () => {
    api.get(`/notifications/admin/all?page=${page}`).then((data) => {
      setNotifications(data.notifications)
      setTotalPages(data.totalPages)
    })
  }

  useEffect(() => {
    load()
  }, [page])

  const openNew = () => {
    setForm(EMPTY_FORM)
    setTargetUsers([])
    setUserQuery('')
    setUserResults([])
    setShowForm(true)
  }

  const close = () => {
    setShowForm(false)
  }

  const searchUsers = async () => {
    if (!userQuery.trim()) return
    const { users } = await api.get(`/notifications/admin/users/search?q=${encodeURIComponent(userQuery.trim())}`)
    setUserResults(users)
  }

  const addUser = (user) => {
    if (targetUsers.find((u) => u.id === user.id)) return
    setTargetUsers([...targetUsers, user])
  }

  const removeUser = (userId) => {
    setTargetUsers(targetUsers.filter((u) => u.id !== userId))
  }

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      alert('제목과 본문을 입력해 주세요.')
      return
    }
    if (form.audience === 'TARGETED' && targetUsers.length === 0) {
      alert('대상 유저를 1명 이상 지정해 주세요.')
      return
    }
    setSaving(true)
    try {
      await api.post('/notifications', {
        title: form.title.trim(),
        body: form.body.trim(),
        imageUrl: form.imageUrl.trim() || null,
        linkPath: form.linkPath || null,
        audience: form.audience,
        userIds: form.audience === 'TARGETED' ? targetUsers.map((u) => u.id) : [],
      })
      close()
      load()
    } catch (e) {
      alert(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('알림을 삭제할까요? 이미 발송된 알림도 모든 유저에게서 사라집니다.')) return
    try {
      await api.delete(`/notifications/admin/${id}`)
      load()
      if (detail?.id === id) setDetail(null)
    } catch (e) {
      alert(e.message || '삭제 실패')
    }
  }

  const openDetail = async (id) => {
    const { notification } = await api.get(`/notifications/admin/${id}`)
    setDetail(notification)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">인앱 알림</h1>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          새 알림 작성
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50 text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">제목</th>
              <th className="px-4 py-3 text-left">대상</th>
              <th className="px-4 py-3 text-right">수신자</th>
              <th className="px-4 py-3 text-right">읽음</th>
              <th className="px-4 py-3 text-left">발송일시</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {notifications.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  등록된 알림이 없습니다.
                </td>
              </tr>
            ) : (
              notifications.map((n) => (
                <tr key={n.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400">{n.id}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(n.id)}
                      className="text-indigo-300 hover:text-indigo-200 text-left"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
                    >
                      {n.title}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs border ${
                        n.audience === 'ALL'
                          ? 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40'
                          : 'bg-blue-600/20 text-blue-300 border-blue-600/40'
                      }`}
                    >
                      {n.audience === 'ALL' ? '전체' : '지정'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {n.audience === 'ALL' ? '전체' : n._count?.recipients ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{n._count?.reads ?? 0}</td>
                  <td className="px-4 py-3 text-gray-400">{formatKST(n.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(n.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium ${
                page === p ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* 작성 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">새 알림 작성</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">대상</label>
                <div className="flex gap-2">
                  {[
                    { v: 'ALL', label: '전체 유저' },
                    { v: 'TARGETED', label: '지정 유저' },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setForm({ ...form, audience: opt.v })}
                      className={`px-4 py-2 rounded-lg text-sm ${
                        form.audience === opt.v
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.audience === 'TARGETED' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">대상 유저 검색</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          searchUsers()
                        }
                      }}
                      placeholder="이메일 또는 이름"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={searchUsers}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      검색
                    </button>
                  </div>
                  {userResults.length > 0 && (
                    <div className="border border-gray-800 rounded-lg max-h-40 overflow-y-auto mb-2">
                      {userResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => addUser(u)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 border-b border-gray-800 last:border-b-0"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
                        >
                          <span className="text-gray-200">{u.name || '(이름 없음)'}</span>
                          <span className="text-gray-500 text-xs ml-2">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {targetUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {targetUsers.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-600/20 border border-indigo-600/40 rounded text-xs text-indigo-200"
                        >
                          {u.name || u.email}
                          <button
                            onClick={() => removeUser(u.id)}
                            className="text-indigo-300 hover:text-white"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">제목</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  maxLength={100}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">본문</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  maxLength={2000}
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">이미지 URL (선택)</label>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">클릭 시 이동</label>
                <select
                  value={form.linkPath}
                  onChange={(e) => setForm({ ...form, linkPath: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {LINK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={close}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {saving ? '저장 중...' : '발송'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">알림 상세</h2>
              <button
                onClick={() => setDetail(null)}
                className="text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">제목: </span>
                <span className="text-gray-100">{detail.title}</span>
              </div>
              <div>
                <span className="text-gray-500">본문:</span>
                <p className="text-gray-200 whitespace-pre-line mt-1">{detail.body}</p>
              </div>
              {detail.imageUrl && (
                <div>
                  <span className="text-gray-500">이미지:</span>
                  <img src={detail.imageUrl} alt="" className="mt-1 max-w-xs rounded-lg" />
                </div>
              )}
              {detail.linkPath && (
                <div>
                  <span className="text-gray-500">링크: </span>
                  <span className="text-gray-100">{detail.linkPath}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">대상: </span>
                <span className="text-gray-100">
                  {detail.audience === 'ALL' ? '전체 유저' : `지정 유저 (${detail._count?.recipients ?? 0}명)`}
                </span>
              </div>
              <div>
                <span className="text-gray-500">읽음: </span>
                <span className="text-gray-100">{detail._count?.reads ?? 0}명</span>
              </div>
              <div>
                <span className="text-gray-500">발송일시: </span>
                <span className="text-gray-100">{formatKST(detail.createdAt)}</span>
              </div>

              {detail.audience === 'TARGETED' && detail.recipients?.length > 0 && (
                <div>
                  <div className="text-gray-500 mb-1">수신자 목록</div>
                  <div className="border border-gray-800 rounded-lg max-h-40 overflow-y-auto">
                    {detail.recipients.map((r) => (
                      <div key={r.userId} className="px-3 py-1.5 text-xs border-b border-gray-800 last:border-b-0">
                        <span className="text-gray-200">{r.user?.name || '(이름 없음)'}</span>
                        <span className="text-gray-500 ml-2">{r.user?.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
