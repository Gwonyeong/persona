import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export default function ChatList() {
  const { token } = useStore()
  const [conversations, setConversations] = useState([])
  const [showLoginModal, setShowLoginModal] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    if (!token) return
    api.get('/conversations').then(({ conversations }) => setConversations(conversations))
  }

  useEffect(() => { load() }, [token])

  const remove = async (e, id) => {
    e.stopPropagation()
    if (!confirm('이 대화를 삭제하시겠습니까?')) return
    await api.delete(`/conversations/${id}`)
    load()
  }

  return (
    <div className="px-4 pt-4">
      <Helmet>
        <title>대화 목록 - Pesona</title>
        <meta name="description" content="AI 캐릭터와 나눈 대화 목록을 확인하세요." />
      </Helmet>
      <h1 className="text-xl font-bold mb-4">대화</h1>
      <div className="mb-3">
        <AdBanner slot="3193498609" />
      </div>

      {!token ? (
        <div className="text-center py-20">
          <p className="text-gray-300 font-semibold mb-2">로그인하고 대화를 시작해보세요</p>
          <p className="text-sm text-gray-500 mb-6">AI 캐릭터와 감정이 담긴 실시간 대화를 경험할 수 있습니다.</p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            로그인
          </button>
          {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p>진행 중인 대화가 없습니다.</p>
          <p className="text-sm mt-1">홈에서 캐릭터를 선택해 대화를 시작해보세요.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {conversations.map((conv) => {
            const thumb = conv.character.styles?.[0]?.images?.[0]
            const thumbUrl = getImageUrl(thumb?.filePath)
            const lastMsg = conv.messages?.[0]

            return (
              <div
                key={conv.id}
                onClick={() => navigate(`/chats/${conv.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-900 cursor-pointer transition-colors group"
              >
                {/* 프로필 */}
                <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">?</div>
                  )}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{conv.character.name}</p>
                    <span className="text-xs text-gray-500">{timeAgo(conv.updatedAt)}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {lastMsg?.content || '대화를 시작해보세요'}
                  </p>
                </div>

                {/* 삭제 */}
                <button
                  onClick={(e) => remove(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity p-1"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
