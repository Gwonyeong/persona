import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import TagFilterBar from '../../components/TagFilterBar'
import useTagFilter from '../../hooks/useTagFilter'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

// 페이지 이탈 후 복귀 시 스크롤/데이터 유지를 위한 모듈 스코프 캐시
const feedCache = {
  key: null,
  posts: [],
  nextCursor: null,
  hasMore: true,
  scrollTop: 0,
}

function makeCacheKey(followOnly, selectedTags, lang) {
  return `${followOnly}|${[...selectedTags].sort().join(',')}|${lang}`
}

export default function Feed() {
  const { t, i18n } = useTranslation()
  const CAPTIONS = t('feed.defaultCaptions', { returnObjects: true }) || []
  const [characters, setCharacters] = useState([])
  const [followedIds, setFollowedIds] = useState(null)
  const [followOnly, setFollowOnly] = useState(() => {
    try { return JSON.parse(localStorage.getItem('feedFilter_followOnly')) === true }
    catch { return false }
  })
  const { selectedTags, tagCategories, applyTags, filterByTags } = useTagFilter('feedFilter')
  const { token } = useStore()
  const navigate = useNavigate()

  // 캐시 hydration: 같은 필터로 돌아왔을 때 데이터/스크롤 복원
  const cacheKey = makeCacheKey(followOnly, selectedTags, i18n.language)
  const useCachedInit = feedCache.key === cacheKey && feedCache.posts.length > 0

  // 무한스크롤 상태
  const [feedPosts, setFeedPosts] = useState(() => useCachedInit ? feedCache.posts : [])
  const [nextCursor, setNextCursor] = useState(() => useCachedInit ? feedCache.nextCursor : null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(() => useCachedInit ? feedCache.hasMore : true)
  const [initialLoaded, setInitialLoaded] = useState(() => useCachedInit)
  const observerRef = useRef(null)
  const sentinelRef = useRef(null)
  const nextCursorRef = useRef(useCachedInit ? feedCache.nextCursor : null)
  const loadingRef = useRef(false)
  const containerRef = useRef(null)
  const skipFilterResetRef = useRef(true)
  const scrollHandlerRef = useRef(null)

  const goToChat = async (character) => {
    try {
      const { conversation } = await api.post('/conversations', { characterId: character.id })
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error('Start chat error:', error)
      navigate(`/characters/${character.id}`)
    }
  }

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
    if (loadingRef.current) return
    loadingRef.current = true
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
        caption: post.caption || CAPTIONS[idx % CAPTIONS.length],
      }))

      if (reset) {
        setFeedPosts(posts)
      } else {
        setFeedPosts((prev) => [...prev, ...posts])
      }
      nextCursorRef.current = data.nextCursor
      setNextCursor(data.nextCursor)
      setHasMore(!!data.nextCursor)
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      loadingRef.current = false
      setLoading(false)
      setInitialLoaded(true)
    }
  }, [followOnly, selectedTags, CAPTIONS])

  // 필터 변경 시 리셋 (초기 마운트는 건너뜀 — 캐시 복원이 우선)
  useEffect(() => {
    if (skipFilterResetRef.current) {
      skipFilterResetRef.current = false
      return
    }
    setFeedPosts([])
    setNextCursor(null)
    setHasMore(true)
    setInitialLoaded(false)
  }, [followOnly, selectedTags, i18n.language])

  // 캐시 동기화 — 데이터 변경 시 모듈 캐시 갱신
  useEffect(() => {
    if (!initialLoaded) return
    feedCache.key = cacheKey
    feedCache.posts = feedPosts
    feedCache.nextCursor = nextCursor
    feedCache.hasMore = hasMore
  }, [feedPosts, nextCursor, hasMore, cacheKey, initialLoaded])

  // 스크롤 위치 추적 — UserLayout의 <main>이 실제 스크롤 컨테이너
  useEffect(() => {
    const main = containerRef.current?.parentElement
    if (!main) return
    const handler = () => {
      feedCache.scrollTop = main.scrollTop
    }
    scrollHandlerRef.current = { main, handler }
    main.addEventListener('scroll', handler, { passive: true })
    return () => {
      main.removeEventListener('scroll', handler)
      scrollHandlerRef.current = null
    }
  }, [])

  // 캐시에서 hydration된 경우 스크롤 위치 복원
  // (commit 직후 한 번 + 다음 frame에 한 번 더 — 레이아웃 안정 후를 보장)
  useLayoutEffect(() => {
    if (!useCachedInit) return
    const main = containerRef.current?.parentElement
    if (!main) return
    const target = feedCache.scrollTop
    main.scrollTop = target
    const raf = requestAnimationFrame(() => {
      main.scrollTop = target
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 네비게이션 직전 스크롤 위치를 캐시에 저장하고 리스너를 즉시 detach
  // (commit phase의 콘텐츠 교체로 main.scrollTop이 자동 클램프되어 fire되는 scroll 이벤트가
  //  effect cleanup 전에 캐시를 0으로 덮어쓰는 race를 막음)
  const navigateWithScrollSave = useCallback((path) => {
    const ref = scrollHandlerRef.current
    if (ref) {
      feedCache.scrollTop = ref.main.scrollTop
      ref.main.removeEventListener('scroll', ref.handler)
      scrollHandlerRef.current = null
    }
    navigate(path)
  }, [navigate])

  // 초기 로딩 + 리셋 후 로딩
  useEffect(() => {
    if (!initialLoaded && hasMore) {
      fetchPosts(null, true)
    }
  }, [initialLoaded, hasMore, fetchPosts])

  // IntersectionObserver로 무한스크롤
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && nextCursorRef.current) {
          fetchPosts(nextCursorRef.current)
        }
      },
      { threshold: 0.1 }
    )

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => observerRef.current?.disconnect()
  }, [fetchPosts])

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

  return (
    <div ref={containerRef} className="pb-2">
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

      {/* 피드 포스트 그리드 */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {feedPosts.map((post) => {
          const firstImage = post.images?.[0]?.filePath || post.imageUrl
          const isMulti = (post.images?.length || 0) > 1
          return (
            <button
              key={post.id}
              onClick={() => navigateWithScrollSave(`/characters/${post.character.id}/feed?postId=${post.id}`)}
              className="relative aspect-[9/16] bg-gray-900 overflow-hidden"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {firstImage ? (
                <img
                  src={firstImage}
                  alt={post.caption || ''}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
              )}
              {isMulti && (
                <div className="absolute top-1.5 right-1.5 text-white drop-shadow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
                  </svg>
                </div>
              )}

              {/* 캐릭터 프로필 오버레이 */}
              <div className="absolute bottom-1 right-1 left-1 flex justify-end pointer-events-none">
                <div className="flex items-center gap-1 max-w-full bg-black/55 backdrop-blur-sm rounded-full pl-0.5 pr-1.5 py-0.5">
                  {post.thumbUrl ? (
                    <img
                      src={post.thumbUrl}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-gray-600 flex-shrink-0" />
                  )}
                  <span className="text-[10px] text-white truncate">{post.character.name}</span>
                </div>
              </div>
            </button>
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

    </div>
  )
}
