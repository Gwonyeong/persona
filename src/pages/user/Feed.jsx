import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import StoryViewer from '../../components/StoryViewer'
import FeedPostCard from '../../components/FeedPostCard'
import CommentSheet from '../../components/CommentSheet'
import Lightbox from '../../components/Lightbox'
import useBackHandler from '../../hooks/useBackHandler'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

const CAPTIONS = [
  '오늘도 좋은 하루 보내세요 ☀️',
  '이런 날엔 산책이 최고야 🌿',
  '새로운 하루, 새로운 시작 ✨',
  '오늘의 기분은 이 정도? 😊',
  '혼자만의 시간도 소중하니까 💭',
  '이 순간을 기억하고 싶어 📸',
  '당신과 함께라면 어디든 좋아 💕',
  '오늘은 특별한 날이 될 거야 🎉',
  '가끔은 멈춰서 하늘을 올려다봐 🌙',
  '맛있는 거 먹으면 기분이 좋아지지 🍰',
]

export default function Feed() {
  const [characters, setCharacters] = useState([])
  const [followedIds, setFollowedIds] = useState(null)
  const [viewedStories, setViewedStories] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]')) }
    catch { return new Set() }
  })
  const [likeState, setLikeState] = useState({})
  const [storyModal, setStoryModal] = useState(null)
  const [storyIndex, setStoryIndex] = useState(0)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [commentPostId, setCommentPostId] = useState(null)
  const { token } = useStore()
  const navigate = useNavigate()

  const markStoryViewed = (characterId) => {
    setViewedStories((prev) => {
      const next = new Set(prev)
      next.add(characterId)
      sessionStorage.setItem('viewedStories', JSON.stringify([...next]))
      return next
    })
  }

  const openStory = (character) => {
    const stories = character.stories || []
    if (stories.length === 0) {
      navigate(`/characters/${character.id}`)
      return
    }
    const style = character.styles?.[0]
    const neutralImg = style?.images?.find((img) => img.emotion === 'NEUTRAL')
    const profileUrl = getImageUrl((neutralImg || style?.images?.[0])?.filePath)
    setStoryIndex(0)
    setStoryModal({ character, stories, profileUrl })
  }

  const closeStory = () => {
    if (storyModal) markStoryViewed(storyModal.character.id)
    setStoryModal(null)
  }

  useBackHandler(!!storyModal, closeStory)
  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(!!commentPostId, () => setCommentPostId(null))

  useEffect(() => {
    api.get('/characters').then(({ characters }) => setCharacters(characters))
  }, [])

  useEffect(() => {
    if (!token) { setFollowedIds([]); return }
    api.get('/follows').then(({ characterIds }) => setFollowedIds(characterIds)).catch(() => setFollowedIds([]))
  }, [token])

  const followedCharacters = followedIds
    ? characters.filter((c) => followedIds.includes(c.id))
    : characters

  const storyCharacters = followedCharacters.map((c) => {
    const style = c.styles?.[0]
    const neutralImg = style?.images?.find((img) => img.emotion === 'NEUTRAL')
    const fallbackImg = style?.images?.[0]
    return {
      ...c,
      thumbUrl: getImageUrl((neutralImg || fallbackImg)?.filePath),
    }
  })

  const feedPosts = followedCharacters.flatMap((c, cIdx) => {
    const posts = c.feedPosts || []
    if (posts.length === 0) return []
    const style = c.styles?.[0]
    const thumbUrl = getImageUrl(
      (style?.images?.find((i) => i.emotion === 'NEUTRAL') || style?.images?.[0])?.filePath
    )
    return posts.map((post, pIdx) => ({
      id: post.id,
      character: c,
      imageUrl: post.filePath,
      caption: post.caption || CAPTIONS[(cIdx + pIdx) % CAPTIONS.length],
      publishAt: post.publishAt,
      likesCount: post.likesCount || 0,
      liked: post.liked || false,
      thumbUrl,
    }))
  }).sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt))

  const toggleLike = async (postId) => {
    if (!token) return
    const prev = likeState[postId]
    setLikeState((s) => ({
      ...s,
      [postId]: {
        liked: prev ? !prev.liked : true,
        likesCount: prev ? prev.likesCount + (prev.liked ? -1 : 1) : 1,
      },
    }))
    try {
      const data = await api.post(`/feed-likes/${postId}`)
      setLikeState((s) => ({ ...s, [postId]: { liked: data.liked, likesCount: data.likesCount, affinityUp: data.affinityUp } }))
    } catch {
      if (prev) setLikeState((s) => ({ ...s, [postId]: prev }))
    }
  }

  // 댓글 열려있는 포스트의 캐릭터 정보
  const commentPost = commentPostId ? feedPosts.find((p) => p.id === commentPostId) : null
  const commentCharacterName = commentPost?.character?.name || ''
  const commentCharacterThumbUrl = commentPost?.thumbUrl || ''

  return (
    <div className="pb-2">
      {/* 슬라이드업 애니메이션 */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-gray-950 px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">피드</h1>
      </div>

      {/* 스토리 */}
      <div className="px-4 py-3">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {storyCharacters.map((c) => {
            const hasStories = (c.stories || []).length > 0
            const isViewed = viewedStories.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => hasStories ? openStory(c) : navigate(`/characters/${c.id}`)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className={`w-16 h-16 rounded-full p-[2px] ${
                  hasStories && !isViewed
                    ? 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400'
                    : 'bg-gray-600'
                }`}>
                  <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                    {c.thumbUrl ? (
                      <img
                        src={c.thumbUrl}
                        alt={c.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center">
                        <span className="text-lg text-gray-500">?</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-gray-300 w-16 text-center truncate">
                  {c.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-gray-800" />

      {/* 피드 포스트 */}
      <div>
        {feedPosts.map((post) => {
          const ls = likeState[post.id]
          return (
            <FeedPostCard
              key={post.id}
              postId={post.id}
              imageUrl={post.imageUrl}
              caption={post.caption}
              publishAt={post.publishAt}
              characterName={post.character.name}
              characterId={post.character.id}
              thumbUrl={post.thumbUrl}
              liked={ls ? ls.liked : post.liked}
              likesCount={ls ? ls.likesCount : post.likesCount}
              affinityUp={ls?.affinityUp}
              onLike={() => toggleLike(post.id)}
              onComment={() => setCommentPostId(post.id)}
              onImageClick={() => setLightboxUrl(post.imageUrl)}
              showChatLink
            />
          )
        })}
      </div>

      {feedPosts.length === 0 && (
        <div className="text-center text-gray-500 py-20 px-6">
          <p className="text-lg mb-2">피드가 비어있어요</p>
          <p className="text-sm">홈에서 캐릭터를 팔로우하면 피드에 게시물이 나타납니다.</p>
        </div>
      )}

      {/* 스토리 뷰어 */}
      {storyModal && (
        <StoryViewer
          stories={storyModal.stories}
          character={storyModal.character}
          profileUrl={storyModal.profileUrl}
          currentIndex={storyIndex}
          onIndexChange={setStoryIndex}
          onClose={closeStory}
        />
      )}

      {/* 라이트박스 */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* 댓글 바텀 시트 */}
      {commentPostId && (
        <CommentSheet
          postId={commentPostId}
          characterName={commentCharacterName}
          characterThumbUrl={commentCharacterThumbUrl}
          onClose={() => setCommentPostId(null)}
        />
      )}
    </div>
  )
}
