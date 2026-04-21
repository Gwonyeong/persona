import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import FeedPostCard from '../../components/FeedPostCard'
import CommentSheet from '../../components/CommentSheet'
import Lightbox from '../../components/Lightbox'
import TagFilterBar from '../../components/TagFilterBar'
import useBackHandler from '../../hooks/useBackHandler'
import useTagFilter from '../../hooks/useTagFilter'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function Feed() {
  const { t, i18n } = useTranslation()
  const CAPTIONS = t('feed.defaultCaptions', { returnObjects: true }) || []
  const [characters, setCharacters] = useState([])
  const [followedIds, setFollowedIds] = useState(null)
  const [likeState, setLikeState] = useState({})
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [commentPostId, setCommentPostId] = useState(null)
  const [followOnly, setFollowOnly] = useState(() => {
    try { return JSON.parse(localStorage.getItem('feedFilter_followOnly')) === true }
    catch { return false }
  })
  const { selectedTags, tagCategories, applyTags, filterByTags } = useTagFilter('feedFilter')
  const { token } = useStore()
  const navigate = useNavigate()

  // 무한스크롤 상태
  const [feedPosts, setFeedPosts] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const observerRef = useRef(null)
  const sentinelRef = useRef(null)

  const goToChat = async (character) => {
    try {
      const { conversation } = await api.post('/conversations', { characterId: character.id })
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error('Start chat error:', error)
      navigate(`/characters/${character.id}`)
    }
  }

  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(!!commentPostId, () => setCommentPostId(null))

  // 캐릭터 목록 (스토리용)
  useEffect(() => {
    api.get('/characters').then(({ characters }) => setCharacters(characters))
  }, [i18n.language])

  useEffect(() => {
    if (!token) { setFollowedIds([]); return }
    api.get('/follows').then(({ characterIds }) => setFollowedIds(characterIds)).catch(() => setFollowedIds([]))
  }, [token])

  // 피드 포스트 fetch
  const fetchPosts = useCallback(async (cursor = null, reset = false) => {
    if (loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '10' })
      if (cursor) params.set('cursor', cursor)
      if (followOnly) params.set('followOnly', 'true')
      if (selectedTags.length > 0) {
        selectedTags.forEach((t) => params.append('tags', t))
      }

      const data = await api.get(`/feed-posts?${params.toString()}`)
      const posts = (data.feedPosts || []).map((post, idx) => ({
        ...post,
        caption: post.caption || CAPTIONS[(cursor ? feedPosts.length + idx : idx) % CAPTIONS.length],
      }))

      if (reset) {
        setFeedPosts(posts)
      } else {
        setFeedPosts((prev) => [...prev, ...posts])
      }
      setNextCursor(data.nextCursor)
      setHasMore(!!data.nextCursor)
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      setLoading(false)
      setInitialLoaded(true)
    }
  }, [loading, followOnly, selectedTags, CAPTIONS, feedPosts.length])

  // 필터 변경 시 리셋
  useEffect(() => {
    setFeedPosts([])
    setNextCursor(null)
    setHasMore(true)
    setInitialLoaded(false)
  }, [followOnly, selectedTags, i18n.language])

  // 초기 로딩 + 리셋 후 로딩
  useEffect(() => {
    if (!initialLoaded && hasMore) {
      fetchPosts(null, true)
    }
  }, [initialLoaded, hasMore])

  // IntersectionObserver로 무한스크롤
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPosts(nextCursor)
        }
      },
      { threshold: 0.1 }
    )

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => observerRef.current?.disconnect()
  }, [hasMore, loading, nextCursor])

  const followedCharacters = followedIds
    ? characters.filter((c) => followedIds.includes(c.id))
    : []

  const storyCharacters = followedCharacters.map((c) => {
    const style = c.styles?.[0]
    const neutralImg = style?.images?.find((img) => img.emotion === 'NEUTRAL')
    const fallbackImg = style?.images?.[0]
    return {
      ...c,
      thumbUrl: getImageUrl((neutralImg || fallbackImg)?.filePath),
    }
  })

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
        <h1 className="text-xl font-bold">{t('feed.title')}</h1>
      </div>

      {/* 스토리 */}
      <div className="px-4 py-3">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {storyCharacters.map((c) => {
            return (
              <button
                key={c.id}
                onClick={() => token ? goToChat(c) : navigate(`/characters/${c.id}`)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
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

      {/* 필터 */}
      <div className="px-4 py-2">
        <TagFilterBar
          selectedTags={selectedTags}
          tagCategories={tagCategories}
          onApply={applyTags}
          followOnly={followOnly}
          onFollowOnlyChange={(v) => {
            setFollowOnly(v)
            localStorage.setItem('feedFilter_followOnly', JSON.stringify(v))
          }}
          showFollowFilter
        />
      </div>

      {/* 피드 포스트 */}
      <div>
        {feedPosts.map((post) => {
          const ls = likeState[post.id]
          return (
            <FeedPostCard
              key={post.id}
              postId={post.id}
              images={post.images}
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
              onImageClick={(url) => setLightboxUrl(url || post.imageUrl)}
              showChatLink
            />
          )
        })}
      </div>

      {/* 무한스크롤 센티넬 */}
      <div ref={sentinelRef} className="h-1" />

      {/* 로딩 */}
      {loading && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {initialLoaded && feedPosts.length === 0 && !loading && (
        <div className="text-center text-gray-500 py-20 px-6">
          <p className="text-lg mb-2">{followOnly ? t('feed.emptyFollowed') : t('feed.empty')}</p>
          <p className="text-sm">{t('feed.emptyHint')}</p>
        </div>
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
