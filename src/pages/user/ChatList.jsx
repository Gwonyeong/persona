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
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-xl font-bold">메시지</h1>
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
                const thumbUrl = getImageUrl(thumb?.filePath)
                const previewMsg = conv.lastCharMessage || conv.messages?.[0]
                const isUnread = conv.updatedAt && (!conv.lastReadAt || new Date(conv.updatedAt) > new Date(conv.lastReadAt))

                return (
                  <button
                    key={conv.id}
                    onClick={() => navigate(`/chats/${conv.id}`)}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-900/60 transition-colors text-left group"
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
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
