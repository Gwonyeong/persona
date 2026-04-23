import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import GalleryGrid from './GalleryGrid'
import ImageSlideViewer from './ImageSlideViewer'

export default function GalleryBottomSheet({ characterId, characterName, conversationId, affinity, onClose, onAttachFeed, onBackgroundChange }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [contents, setContents] = useState([])
  const [feedPosts, setFeedPosts] = useState([])
  const [generatedImages, setGeneratedImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [slideViewer, setSlideViewer] = useState(null)
  const [tab, setTab] = useState('FEED')
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [bgPickMode, setBgPickMode] = useState(false)
  const [bgPickImages, setBgPickImages] = useState(null) // 다중 이미지 선택용 { images: [] }
  const [bgSelected, setBgSelected] = useState(null) // 선택된 이미지 URL
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
    const promises = [
      api.get(`/characters/${characterId}/gallery`).catch(() => ({ galleryContents: [] })),
      api.get(`/characters/${characterId}`).catch(() => ({ character: { feedPosts: [] } })),
    ]
    if (conversationId) {
      promises.push(
        api.get(`/conversations/${conversationId}/generated-images`).catch(() => ({ images: [] }))
      )
    }

    Promise.all(promises).then(([galleryRes, charRes, genRes]) => {
      setContents(galleryRes.galleryContents || [])
      setFeedPosts(charRes.character?.feedPosts || [])
      if (genRes) setGeneratedImages(genRes.images || [])
    }).finally(() => setLoading(false))
  }, [characterId, conversationId])

  const filtered = contents.filter((item) => item.unlockType === tab)

  const handleContentClick = (content) => {
    if (bgPickMode) {
      if (content.images?.length > 1) {
        setBgPickImages(content.images)
        setBgSelected(null)
      } else if (content.images?.length === 1) {
        setBgSelected(content.images[0].filePath)
        setBgPickImages(null)
      }
      return
    }
    setSlideViewer({
      images: content.images,
      title: content.title,
      description: content.description,
      initialIndex: 0,
    })
  }

  const handleBgFeedClick = (post) => {
    if (!bgPickMode) {
      setSelectedFeed(selectedFeed?.id === post.id ? null : post)
      return
    }
    if (post.images?.length > 1) {
      setBgPickImages(post.images)
      setBgSelected(null)
    } else {
      const url = post.images?.[0]?.filePath || post.filePath
      if (url) {
        setBgSelected(url)
        setBgPickImages(null)
      }
    }
  }

  const handleBgGeneratedClick = (img) => {
    if (!bgPickMode) {
      setSlideViewer({
        images: [{ filePath: img.filePath }],
        title: null,
        description: null,
        initialIndex: 0,
      })
      return
    }
    setBgSelected(img.filePath)
    setBgPickImages(null)
  }

  const confirmBackground = async () => {
    if (!bgSelected || !conversationId) return
    try {
      await api.put(`/conversations/${conversationId}/background`, { backgroundImage: bgSelected })
      onBackgroundChange?.(bgSelected)
      setBgPickMode(false)
      setBgSelected(null)
      setBgPickImages(null)
      onClose()
    } catch (err) {
      console.error('Set background error:', err)
    }
  }

  const resetBackground = async () => {
    if (!conversationId) return
    try {
      await api.put(`/conversations/${conversationId}/background`, { backgroundImage: null })
      onBackgroundChange?.(null)
      setBgPickMode(false)
      setBgSelected(null)
      setBgPickImages(null)
      onClose()
    } catch (err) {
      console.error('Reset background error:', err)
    }
  }

  const tabs = [
    {
      key: 'FEED',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
      label: t('gallery.tabFeed'),
    },
    {
      key: 'AFFINITY',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
      label: t('gallery.tabAffinity'),
    },
    {
      key: 'MISSION',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ),
      label: t('gallery.tabMission'),
    },
    {
      key: 'GENERATED',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" />
          <path d="M17.8 11.8L19 13" /><path d="M15 9h0" /><path d="M17.8 6.2L19 5" />
          <path d="M3 21l9-9" /><path d="M12.2 6.2L11 5" />
        </svg>
      ),
      label: t('gallery.tabGenerated'),
    },
  ]

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

          {/* 2x2 탭 그리드 */}
          <div className="border-t border-gray-800 px-4 py-2">
            <div className="grid grid-cols-2 gap-1.5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setBgPickImages(null); setBgSelected(null) }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tab === t.key
                      ? 'bg-white/10 text-white'
                      : 'bg-gray-800/50 text-gray-500'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* 배경 이미지 변경 버튼 */}
            <div className="flex justify-end mt-2">
              {!bgPickMode ? (
                <button
                  onClick={() => { setBgPickMode(true); setSelectedFeed(null) }}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  {t('gallery.changeBg')}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetBackground}
                    className="text-[11px] text-gray-400 hover:text-white transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {t('gallery.resetBg')}
                  </button>
                  <button
                    onClick={() => { setBgPickMode(false); setBgSelected(null); setBgPickImages(null) }}
                    className="text-[11px] text-gray-400 hover:text-white transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 배경 선택 안내 */}
        {bgPickMode && !bgPickImages && (
          <div className="px-4 py-1.5">
            <p className="text-xs text-indigo-400">{t('gallery.bgPickHint')}</p>
          </div>
        )}

        {/* 다중 이미지 선택 뷰 */}
        {bgPickMode && bgPickImages && (
          <div className="px-4 py-2">
            <p className="text-xs text-gray-400 mb-2">{t('gallery.bgPickImage')}</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {bgPickImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setBgSelected(img.filePath)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                    bgSelected === img.filePath ? 'border-indigo-500' : 'border-transparent'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <img src={img.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-auto" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {loading ? (
            <div className="text-center text-gray-500 py-16">
              <p className="text-sm">{t('gallery.loading')}</p>
            </div>
          ) : (
            <>
              {tab === 'FEED' && (
                <>
                  <div className="grid grid-cols-3 gap-[1px]">
                    {feedPosts.map((post) => {
                      const isSelected = bgPickMode
                        ? bgSelected === (post.images?.[0]?.filePath || post.filePath)
                        : selectedFeed?.id === post.id
                      return (
                        <button
                          key={post.id}
                          onClick={() => handleBgFeedClick(post)}
                          className="aspect-[9/16] overflow-hidden relative"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <img
                            src={post.images?.[0]?.filePath || post.filePath}
                            alt={post.caption || ''}
                            className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-60' : 'hover:opacity-80'}`}
                            loading="lazy"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className={`w-7 h-7 rounded-full ${bgPickMode ? 'bg-indigo-500' : 'bg-indigo-600'} flex items-center justify-center`}>
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
                      )
                    })}
                  </div>
                  {feedPosts.length === 0 && (
                    <div className="text-center text-gray-500 py-16">
                      <p className="text-sm">{t('gallery.emptyPosts')}</p>
                    </div>
                  )}
                </>
              )}
              {(tab === 'AFFINITY' || tab === 'MISSION') && (
                <GalleryGrid
                  contents={filtered}
                  affinity={affinity}
                  onContentClick={handleContentClick}
                  bgPickMode={bgPickMode}
                  bgSelected={bgSelected}
                />
              )}
              {tab === 'GENERATED' && (
                <>
                  <div className="grid grid-cols-3 gap-[1px]">
                    {generatedImages.map((img) => {
                      const isSelected = bgPickMode && bgSelected === img.filePath
                      return (
                        <button
                          key={img.id}
                          onClick={() => handleBgGeneratedClick(img)}
                          className="aspect-[9/16] overflow-hidden relative"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <img
                            src={img.filePath}
                            alt=""
                            className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-60' : 'hover:opacity-80'}`}
                            loading="lazy"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {generatedImages.length === 0 && (
                    <div className="text-center text-gray-500 py-16">
                      <p className="text-sm">{t('gallery.emptyGenerated')}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 피드 선택 액션 버튼 (일반 모드) */}
      {!bgPickMode && selectedFeed && (
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
              {t('gallery.attachFeed')}
            </button>
            <button
              onClick={() => {
                navigate(`/characters/${characterId}/feed?postId=${selectedFeed.id}`)
              }}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-300 bg-gray-800 rounded-xl"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('gallery.loadMore')}
            </button>
          </div>
        </div>
      )}

      {/* 배경 확인 버튼 */}
      {bgPickMode && bgSelected && (
        <div
          className="absolute bottom-0 left-0 right-0 z-[51] bg-gray-900 border-t border-gray-800"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3">
            <button
              onClick={confirmBackground}
              className="w-full py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl flex items-center justify-center gap-2"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t('gallery.confirmBg')}
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
