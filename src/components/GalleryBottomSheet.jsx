import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import GalleryGrid from './GalleryGrid'
import ImageSlideViewer from './ImageSlideViewer'

export default function GalleryBottomSheet({ characterId, characterName, affinity, onClose, onAttachFeed }) {
  const navigate = useNavigate()
  const [contents, setContents] = useState([])
  const [feedPosts, setFeedPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [slideViewer, setSlideViewer] = useState(null) // { images, title, description, initialIndex }
  const [tab, setTab] = useState('FEED')
  const [selectedFeed, setSelectedFeed] = useState(null)
  const overlayRef = useRef(null)

  // 마운트 애니메이션
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
  }, [])

  // 배경 스크롤 방��
  useEffect(() => {
    const locked = []
    let el = overlayRef.current?.parentElement
    while (el) {
      const { overflow, overflowY } = getComputedStyle(el)
      if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
        el.dataset.prevOverflow = el.style.overflow
        el.style.overflow = 'hidden'
        locked.push(el)
      }
      el = el.parentElement
    }
    return () => locked.forEach((el) => {
      el.style.overflow = el.dataset.prevOverflow || ''
      delete el.dataset.prevOverflow
    })
  }, [])

  // 데이터 로드
  useEffect(() => {
    Promise.all([
      api.get(`/characters/${characterId}/gallery`).catch(() => ({ galleryContents: [] })),
      api.get(`/characters/${characterId}`).catch(() => ({ character: { feedPosts: [] } })),
    ]).then(([galleryRes, charRes]) => {
      setContents(galleryRes.galleryContents || [])
      setFeedPosts(charRes.character?.feedPosts || [])
    }).finally(() => setLoading(false))
  }, [characterId])

  const filtered = contents.filter((item) => item.unlockType === tab)

  const handleContentClick = (content) => {
    setSlideViewer({
      images: content.images,
      title: content.title,
      description: content.description,
      initialIndex: 0,
    })
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-50 flex flex-col"
      onClick={onClose}
    >
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/60"
        style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s ease-out' }}
      />

      {/* 상단 여백 */}
      <div className="flex-1 min-h-[40px]" />

      {/* 시트 */}
      <div
        className="relative bg-gray-900 rounded-t-xl flex flex-col"
        style={{
          height: '70%',
          transform: mounted ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-1 rounded-full bg-gray-600" />
          </div>
          <div className="flex justify-end px-4 pb-2">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 탭 */}
          <div className="border-t border-gray-800">
            <div className="flex">
              <button
                onClick={() => setTab('FEED')}
                className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${tab === 'FEED' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                onClick={() => setTab('AFFINITY')}
                className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${tab === 'AFFINITY' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
              <button
                onClick={() => setTab('MISSION')}
                className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${tab === 'MISSION' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-auto" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {loading ? (
            <div className="text-center text-gray-500 py-16">
              <p className="text-sm">불러오는 중...</p>
            </div>
          ) : (
            <>
              {tab === 'FEED' && (
                <>
                  <div className="grid grid-cols-3 gap-[1px]">
                    {feedPosts.map((post) => (
                      <button
                        key={post.id}
                        onClick={() => setSelectedFeed(selectedFeed?.id === post.id ? null : post)}
                        className="aspect-square overflow-hidden relative"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <img
                          src={post.images?.[0]?.filePath || post.filePath}
                          alt={post.caption || ''}
                          className={`w-full h-full object-cover transition-opacity ${selectedFeed?.id === post.id ? 'opacity-60' : 'hover:opacity-80'}`}
                          loading="lazy"
                        />
                        {selectedFeed?.id === post.id && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          </div>
                        )}
                        {post.images?.length > 1 && (
                          <div className="absolute top-1.5 right-1.5">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none" className="drop-shadow">
                              <rect x="3" y="3" width="15" height="15" rx="2" fill="none" stroke="white" strokeWidth="2" />
                              <rect x="6" y="6" width="15" height="15" rx="2" fill="none" stroke="white" strokeWidth="2" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  {feedPosts.length === 0 && (
                    <div className="text-center text-gray-500 py-16">
                      <p className="text-sm">게시물이 없습니다.</p>
                    </div>
                  )}
                </>
              )}
              {(tab === 'AFFINITY' || tab === 'MISSION') && (
                <GalleryGrid
                  contents={filtered}
                  affinity={affinity}
                  onContentClick={handleContentClick}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* 피드 선택 액션 버튼 */}
      {selectedFeed && (
        <div
          className="absolute bottom-0 left-0 right-0 z-[51] bg-gray-900 border-t border-gray-800"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2 p-3">
            <button
              onClick={() => {
                onAttachFeed?.(selectedFeed)
                setSelectedFeed(null)
                onClose()
              }}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              피드 첨부하기
            </button>
            <button
              onClick={() => {
                navigate(`/characters/${characterId}/feed?postId=${selectedFeed.id}`)
              }}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-300 bg-gray-800 rounded-xl"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              더 보기
            </button>
          </div>
        </div>
      )}

      {/* 슬라이드 이미지 뷰어 */}
      {slideViewer && (
        <ImageSlideViewer
          images={slideViewer.images}
          initialIndex={slideViewer.initialIndex}
          title={slideViewer.title}
          description={slideViewer.description}
          onClose={() => setSlideViewer(null)}
        />
      )}
    </div>
  )
}
