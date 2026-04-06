import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import GalleryGrid from './GalleryGrid'

export default function GalleryBottomSheet({ characterId, characterName, affinity, onClose }) {
  const navigate = useNavigate()
  const [images, setImages] = useState([])
  const [feedPosts, setFeedPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [tab, setTab] = useState('FEED')
  const overlayRef = useRef(null)

  // 마운트 애니메이션
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
  }, [])

  // 배경 스크롤 방지
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
      api.get(`/characters/${characterId}/gallery`).catch(() => ({ galleryImages: [] })),
      api.get(`/characters/${characterId}`).catch(() => ({ character: { feedPosts: [] } })),
    ]).then(([galleryRes, charRes]) => {
      setImages(galleryRes.galleryImages || [])
      setFeedPosts(charRes.character?.feedPosts || [])
    }).finally(() => setLoading(false))
  }, [characterId])

  const filtered = images.filter((img) => img.unlockType === tab)

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
                        onClick={() => navigate(`/characters/${characterId}/feed?postId=${post.id}`)}
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
                </>
              )}
              {(tab === 'AFFINITY' || tab === 'MISSION') && (
                <GalleryGrid
                  images={filtered}
                  affinity={affinity}
                  onImageClick={(img) => setLightbox(img.filePath)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* 라이트박스 */}
      {lightbox && (
        <div
          className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  )
}
