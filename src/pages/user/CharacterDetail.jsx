import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function getCharacterOnlineStatus(activeHours) {
  if (!activeHours?.schedule) return 'free'
  const hour = new Date().getHours()
  const slot = activeHours.schedule.find((s) => {
    if (s.start < s.end) return hour >= s.start && hour < s.end
    return hour >= s.start || hour < s.end
  })
  return slot?.status || 'free'
}

import StoryViewer from '../../components/StoryViewer'
import useBackHandler from '../../hooks/useBackHandler'

export default function CharacterDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()
  const [character, setCharacter] = useState(null)
  const [existingConv, setExistingConv] = useState(null)
  const [starting, setStarting] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [showStory, setShowStory] = useState(false)
  const [storyIndex, setStoryIndex] = useState(0)
  const [storyViewed, setStoryViewed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]')).has(parseInt(id)) }
    catch { return false }
  })
  const [isFollowing, setIsFollowing] = useState(false)
  const storyTimerRef = useRef(null)

  const stories = character?.stories || []
  const hasStories = stories.length > 0

  // 모달/오버레이 뒤로가기 처리
  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(showStory, () => {
    setShowStory(false)
    setStoryViewed(true)
    try {
      const viewed = new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]'))
      viewed.add(parseInt(id))
      sessionStorage.setItem('viewedStories', JSON.stringify([...viewed]))
    } catch {}
  })
  useBackHandler(showResetModal, () => setShowResetModal(false))

  useEffect(() => {
    api.get(`/characters/${id}`).then(({ character }) => setCharacter(character))
  }, [id])

  useEffect(() => {
    if (!token) return
    api.get(`/conversations/check/${id}`)
      .then((data) => {
        if (data.exists) setExistingConv(data)
        else setExistingConv(null)
      })
      .catch(() => setExistingConv(null))
    api.get(`/follows/${id}`)
      .then(({ following }) => setIsFollowing(following))
      .catch(() => {})
  }, [id, token])

  const toggleFollow = async () => {
    if (!token) return
    try {
      const { following } = await api.post(`/follows/${id}`)
      setIsFollowing(following)
    } catch (error) {
      console.error('Toggle follow error:', error)
    }
  }

  const startChat = async () => {
    setStarting(true)
    try {
      const { conversation } = await api.post('/conversations', { characterId: parseInt(id) })
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  const resumeChat = () => {
    if (existingConv) navigate(`/chats/${existingConv.conversationId}`)
  }

  const resetChat = async () => {
    setShowResetModal(false)
    setStarting(true)
    try {
      const { conversation } = await api.post(`/conversations/${existingConv.conversationId}/reset`)
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  if (!character) {
    return <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">로딩 중...</div>
  }

  const mainStyle = character.styles?.[0]
  const mainImage = mainStyle?.images?.find((i) => i.emotion === 'NEUTRAL') || mainStyle?.images?.[0]
  const profileUrl = getImageUrl(mainImage?.filePath)
  const onlineStatus = getCharacterOnlineStatus(character.activeHours)

  const feedPosts = character.feedPosts || []

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{character.name} - Pesona</title>
        <meta name="description" content={character.description} />
      </Helmet>

      {/* 헤더 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-base">{character.name}</span>
          {onlineStatus === 'free' && (
            <div className="w-2 h-2 rounded-full bg-green-500" />
          )}
        </div>
      </header>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-auto">
        {/* 프로필 섹션 */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-6">
            {/* 프로필 이미지 (스토리가 있으면 그라데이션 링) */}
            <button
              onClick={() => { if (hasStories) { setStoryIndex(0); setShowStory(true) } }}
              className="flex-shrink-0"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className={`w-[90px] h-[90px] rounded-full p-[3px] ${hasStories ? (storyViewed ? 'bg-gray-600' : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400') : ''}`}>
                <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                  <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden">
                    {profileUrl ? (
                      <img src={profileUrl} alt={character.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl text-gray-600">?</div>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* 통계 */}
            <div className="flex flex-1 justify-around">
              <div className="text-center">
                <p className="text-lg font-bold">{feedPosts.length}</p>
                <p className="text-xs text-gray-400">게시물</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{(character.followerCount || 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">팔로워</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{(character.followingCount || 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">팔로잉</p>
              </div>
            </div>
          </div>

          {/* 이름 + 소개 */}
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm">{character.name}</p>
              {(existingConv?.affinity ?? 0) >= 20 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-600/20 text-indigo-400 rounded-full">맞팔로우</span>
              )}
            </div>
            {character.concept && (
              <p className="text-sm text-gray-400 mt-0.5">{character.concept}</p>
            )}
            {character.description && (
              <p className="text-sm text-gray-300 mt-1 leading-relaxed">{character.description}</p>
            )}
            {character.tags?.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {character.tags.map((tag) => (
                  <span key={tag} className="text-xs text-indigo-400">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex gap-2">
              {existingConv ? (
                <>
                  <button
                    onClick={resumeChat}
                    disabled={starting}
                    className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    메시지 보내기
                  </button>
                  <button
                    onClick={() => setShowResetModal(true)}
                    disabled={starting}
                    className="py-2 px-4 bg-gray-800 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors border border-gray-700"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    새로하기
                  </button>
                </>
              ) : (
                <button
                  onClick={startChat}
                  disabled={starting}
                  className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {starting ? '시작 중...' : '메시지 보내기'}
              </button>
            )}
              <button
                onClick={toggleFollow}
                className={`py-2 px-4 text-sm font-semibold rounded-lg transition-colors ${
                  isFollowing
                    ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                    : 'bg-gray-800 text-white border border-gray-700 hover:bg-gray-700'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {isFollowing ? '팔로잉' : '팔로우'}
              </button>
            </div>
          </div>
        </div>

        {/* 구분선 + 그리드 탭 */}
        <div className="border-t border-gray-800 mt-2">
          <div className="flex justify-center py-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
        </div>

        {/* 피드 그리드 (3열) */}
        <div className="grid grid-cols-3 gap-[1px]">
          {feedPosts.map((post) => (
            <button
              key={post.id}
              onClick={() => setLightboxUrl(post.filePath)}
              className="aspect-square overflow-hidden"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <img
                src={post.filePath}
                alt={post.caption || ''}
                className="w-full h-full object-cover hover:opacity-80 transition-opacity"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {feedPosts.length === 0 && (
          <div className="text-center text-gray-500 py-16">
            <p className="text-sm">게시물이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 스토리 뷰어 */}
      {showStory && hasStories && (
        <StoryViewer
          stories={stories}
          character={character}
          profileUrl={profileUrl}
          currentIndex={storyIndex}
          onIndexChange={setStoryIndex}
          onClose={() => {
            setShowStory(false)
            setStoryViewed(true)
            // 스토리 본 기록 저장 (Feed와 공유)
            try {
              const viewed = new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]'))
              viewed.add(character.id)
              sessionStorage.setItem('viewedStories', JSON.stringify([...viewed]))
            } catch {}
          }}
        />
      )}

      {/* 리셋 경고 모달 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">대화를 새로 시작할까요?</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              기존 대화 내역과 호감도가 모두 초기화됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={resetChat}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                새로 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
