import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일`
  const weeks = Math.floor(days / 7)
  return `${weeks}주`
}

export default function ChatList() {
  const { token } = useStore()
  const [conversations, setConversations] = useState([])
  const [search, setSearch] = useState('')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    if (!token) return
    api.get('/conversations').then(({ conversations }) => setConversations(conversations))
  }

  useEffect(() => { load() }, [token])

  // 폴링 이벤트로 자동 갱신
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('conversations-updated', handler)
    return () => window.removeEventListener('conversations-updated', handler)
  }, [token])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/conversations/${deleteTarget.id}`)
      setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (error) {
      console.error(error)
    } finally {
      setDeleting(false)
    }
  }

  const filtered = search.trim()
    ? conversations.filter((c) => c.character.name.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <div className="pt-2 pb-2">
      <Helmet>
        <title>메시지 - Pesona</title>
        <meta name="description" content="AI 캐릭터와 나눈 대화 목록을 확인하세요." />
      </Helmet>

      {/* 헤더 */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">메시지</h1>
        {token && conversations.length > 0 && (
          <button
            onClick={() => setEditMode((prev) => !prev)}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${editMode ? 'text-indigo-400 bg-indigo-400/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {editMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {!token ? (
        <div className="text-center py-20 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-gray-300 font-semibold mb-1">내 메시지</p>
          <p className="text-sm text-gray-500 mb-5">로그인하고 캐릭터와 대화를 시작하세요</p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            로그인
          </button>
          {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
        </div>
      ) : (
        <>
          {/* 검색바 */}
          <div className="px-4 mb-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">
                {search ? '검색 결과가 없습니다' : '아직 대화가 없습니다'}
              </p>
              {!search && (
                <p className="text-gray-500 text-xs mt-1">홈에서 캐릭터를 선택해 대화를 시작해보세요</p>
              )}
            </div>
          ) : (
            <div>
              {filtered.map((conv) => {
                const thumb = conv.character.styles?.[0]?.images?.[0]
                const thumbUrl = getImageUrl(conv.character.profileImage) || getImageUrl(thumb?.filePath)
                const previewMsg = conv.lastCharMessage || conv.messages?.[0]
                const isUnread = conv.updatedAt && (!conv.lastReadAt || new Date(conv.updatedAt) > new Date(conv.lastReadAt))

                return (
                  <div key={conv.id} className="flex items-center">
                    <button
                      onClick={() => navigate(`/chats/${conv.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-gray-900/60 transition-colors text-left group"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {/* 프로필 이미지 */}
                      <div className="w-14 h-14 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">?</div>
                        )}
                      </div>

                      {/* 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm truncate ${isUnread ? 'text-white' : 'text-gray-300'}`}>{conv.character.name}</p>
                          <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(conv.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-sm truncate flex-1 ${isUnread ? 'text-gray-300' : 'text-gray-500'}`}>
                            {previewMsg?.content || '대화를 시작해보세요'}
                          </p>
                          {isUnread && (
                            <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </button>
                    {editMode && (
                      <button
                        onClick={() => setDeleteTarget(conv)}
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-full mr-2 transition-colors"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">대화를 삭제할까요?</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              <span className="text-white font-medium">{deleteTarget.character.name}</span>과의 대화 내역과 호감도가 모두 초기화됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-medium disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
