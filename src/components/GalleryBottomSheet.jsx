import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import GalleryGrid from './GalleryGrid'
import ImageSlideViewer from './ImageSlideViewer'
import MaskIcon from './MaskIcon'

export default function GalleryBottomSheet({ characterId, characterName, conversationId, affinity, onClose, onAttachFeed, onBackgroundChange, affinityBadge, onAffinityBadgeClear, onGiftSent, onOutfitApplied, allowBackgroundChange = true }) {
  // allowBackgroundChange — false면 "배경으로 설정" 액션을 모두 숨김 (V2 채팅용).
  // V2에서는 AI가 backgroundImage를 mode 기반으로 자동 갱신하므로 유저 수동 변경이 충돌.
  const navigate = useNavigate()
  const { t } = useTranslation()
  const token = useStore((s) => s.token)
  const masks = useStore((s) => s.masks)
  const setMasks = useStore((s) => s.setMasks)
  const [contents, setContents] = useState([])
  const [feedPosts, setFeedPosts] = useState([])
  const [generatedImages, setGeneratedImages] = useState([])
  const [gifts, setGifts] = useState([])
  const [giftViewer, setGiftViewer] = useState(null) // { gift, index }
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [slideViewer, setSlideViewer] = useState(null)
  const [tab, setTab] = useState('FEED')
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [bgPickMode, setBgPickMode] = useState(false)
  const [bgPickImages, setBgPickImages] = useState(null) // 다중 이미지 선택용 { images: [] }
  const [showAffinityBadge, setShowAffinityBadge] = useState(!!affinityBadge)
  const [bgSelected, setBgSelected] = useState(null) // 선택된 이미지 URL
  const [purchaseTab, setPurchaseTab] = useState('UNBOUGHT') // GIFT 탭 내부 하위 탭
  const [pendingGift, setPendingGift] = useState(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null) // { gift, contents }
  const [contentIndex, setContentIndex] = useState(0)
  const [applyingId, setApplyingId] = useState(null)
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
    } else {
      promises.push(Promise.resolve(null))
    }
    if (token) {
      promises.push(
        api.get(`/gifts/character/${characterId}`).catch(() => ({ gifts: [] }))
      )
    } else {
      promises.push(Promise.resolve({ gifts: [] }))
    }

    Promise.all(promises).then(([galleryRes, charRes, genRes, giftRes]) => {
      setContents(galleryRes.galleryContents || [])
      setFeedPosts(charRes.character?.feedPosts || [])
      if (genRes) setGeneratedImages(genRes.images || [])
      setGifts(giftRes?.gifts || [])
    }).finally(() => setLoading(false))
  }, [characterId, conversationId, token])

  // 선물 관련 핸들러
  const unboughtCount = gifts.filter((g) => !g.unlocked).length
  const boughtCount = gifts.length - unboughtCount

  const handleGiftSelect = (gift) => {
    if (gift.unlocked) return
    setPendingGift(gift)
  }

  const handleApplyOutfit = async (gift) => {
    setApplyingId(gift.id)
    try {
      const res = await api.post(`/gifts/conversation/${conversationId}/apply/${gift.id}`)
      onOutfitApplied?.({
        gift,
        messages: res.messages || [],
        characterStatus: res.characterStatus,
      })
      onClose?.()
    } catch (err) {
      console.error('Apply outfit error:', err)
      alert('의상 변경에 실패했어요.')
    } finally {
      setApplyingId(null)
    }
  }

  const confirmSendGift = async () => {
    if (!pendingGift) return
    if (masks < pendingGift.maskCost) {
      alert('마스크가 부족합니다.')
      onClose?.()
      navigate('/subscription')
      return
    }
    setSending(true)
    try {
      const res = await api.post(`/gifts/conversation/${conversationId}/send/${pendingGift.id}`)
      setMasks(res.masks)
      setGifts((prev) => prev.map((g) => (g.id === pendingGift.id ? { ...g, unlocked: true, contents: res.contents || g.contents } : g)))
      onGiftSent?.({
        gift: pendingGift,
        message: res.message,
        thanksMessages: res.thanksMessages || [],
        imageBubble: res.imageBubble || null,
        affinity: res.affinity,
        affinityChange: res.affinityChange,
      })
      setResult({ gift: pendingGift, contents: res.contents || [] })
      setPendingGift(null)
      setContentIndex(0)
    } catch (err) {
      console.error('Send gift error:', err)
      if (err.status === 402) {
        alert('마스크가 부족합니다.')
        onClose?.()
        navigate('/subscription')
      } else if (err.status === 409) {
        alert('이미 선물한 항목입니다.')
        setGifts((prev) => prev.map((g) => (g.id === pendingGift.id ? { ...g, unlocked: true } : g)))
        setPendingGift(null)
      } else {
        alert('선물 전송에 실패했습니다.')
      }
    } finally {
      setSending(false)
    }
  }

  const closeGiftResult = () => {
    setResult(null)
  }

  const filtered = contents
    .filter((item) => item.unlockType === tab)
    .sort((a, b) => (b.affinityThreshold ?? 0) - (a.affinityThreshold ?? 0))

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
      key: 'GENERATED',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" />
          <path d="M17.8 11.8L19 13" /><path d="M15 9h0" /><path d="M17.8 6.2L19 5" />
          <path d="M3 21l9-9" /><path d="M12.2 6.2L11 5" />
        </svg>
      ),
      label: t('gallery.tabMemories'),
    },
    {
      key: 'GIFT',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      ),
      label: '선물',
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
            <div className="grid grid-cols-2 gap-1.5" data-onboarding-target="gallery-tabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key); setBgPickImages(null); setBgSelected(null)
                    if (t.key === 'AFFINITY' && showAffinityBadge) {
                      setShowAffinityBadge(false)
                      onAffinityBadgeClear?.()
                    }
                  }}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tab === t.key
                      ? 'bg-white/10 text-white'
                      : 'bg-gray-800/50 text-gray-500'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {t.key === 'AFFINITY' && showAffinityBadge && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* 배경 이미지 변경 버튼 — V2 채팅(allowBackgroundChange=false)에서는 숨김 */}
            {allowBackgroundChange && (
            <div className="flex justify-end mt-2">
              {!bgPickMode ? (
                <button
                  onClick={() => { setBgPickMode(true); setSelectedFeed(null) }}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  data-onboarding-target="change-bg"
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
            )}
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
                    {feedPosts.map((post, idx) => {
                      const isSelected = bgPickMode
                        ? bgSelected === (post.images?.[0]?.filePath || post.filePath)
                        : selectedFeed?.id === post.id
                      return (
                        <button
                          key={post.id}
                          onClick={() => handleBgFeedClick(post)}
                          className="aspect-[9/16] overflow-hidden relative"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          data-onboarding-target={idx === 0 ? 'first-feed' : undefined}
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
              {tab === 'GIFT' && (
                <>
                  {/* 하위 탭: 미구매 / 구매 + 마스크 잔고 */}
                  <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-3 pt-2 pb-2 flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      <button
                        onClick={() => setPurchaseTab('UNBOUGHT')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          purchaseTab === 'UNBOUGHT'
                            ? 'bg-white/10 text-white'
                            : 'bg-gray-800/50 text-gray-500'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        미구매 <span className="opacity-70">({unboughtCount})</span>
                      </button>
                      <button
                        onClick={() => setPurchaseTab('BOUGHT')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          purchaseTab === 'BOUGHT'
                            ? 'bg-white/10 text-white'
                            : 'bg-gray-800/50 text-gray-500'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        구매 <span className="opacity-70">({boughtCount})</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded-md flex-shrink-0">
                      <MaskIcon className="w-3 h-3" />
                      <span>{masks}</span>
                    </div>
                  </div>

                  {purchaseTab === 'UNBOUGHT' && (
                    <>
                      {gifts.filter((g) => !g.unlocked).length === 0 ? (
                        <div className="text-center text-gray-500 py-16 px-6">
                          <p className="text-sm">{gifts.length > 0 ? '모든 선물을 보냈어요!' : '등록된 선물이 없습니다.'}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 px-3 py-3">
                          {gifts.filter((g) => !g.unlocked).map((g) => (
                            <button
                              key={g.id}
                              onClick={() => handleGiftSelect(g)}
                              disabled={!token}
                              className={`w-full rounded-xl border p-2.5 flex items-center gap-2.5 text-left transition-colors ${
                                g.adminOnly
                                  ? 'bg-amber-950/40 border-amber-700/60 hover:border-amber-500'
                                  : 'bg-gray-800/70 border-gray-700 hover:border-gray-500'
                              } disabled:opacity-50`}
                              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                            >
                              <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900">
                                <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {g.adminOnly && (
                                      <span className="flex-shrink-0 text-[9px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wide">
                                        테스트
                                      </span>
                                    )}
                                    <p className="text-[13px] text-white font-medium truncate">{g.name}</p>
                                  </div>
                                  <div className="flex-shrink-0 flex items-center gap-1 bg-gray-900/80 px-2 py-0.5 rounded-full">
                                    <MaskIcon className="w-3 h-3" />
                                    <span className="text-[11px] text-white">{g.maskCost}</span>
                                  </div>
                                </div>
                                {g.contents?.length > 0 ? (
                                  <div className="flex gap-1 overflow-hidden">
                                    {g.contents.slice(0, 4).map((c, idx) => (
                                      <div
                                        key={c.id}
                                        className="relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-gray-900"
                                      >
                                        {c.type === 'VIDEO' ? (
                                          <video
                                            src={c.filePath}
                                            muted
                                            playsInline
                                            preload="metadata"
                                            className="w-full h-full object-cover"
                                            style={{ filter: 'blur(2px)' }}
                                          />
                                        ) : (
                                          <img
                                            src={c.filePath}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            style={{ filter: 'blur(2px)' }}
                                          />
                                        )}
                                        {c.type === 'VIDEO' && (
                                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                                              <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                                <polygon points="8 5 19 12 8 19" />
                                              </svg>
                                            </div>
                                          </div>
                                        )}
                                        {g.contents.length > 4 && idx === 3 && (
                                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <span className="text-[11px] text-white font-medium">+{g.contents.length - 4}</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="h-12 flex items-center">
                                    <span className="text-[10px] text-gray-500 italic">해금 콘텐츠 없음</span>
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {purchaseTab === 'BOUGHT' && (
                    <>
                      {gifts.filter((g) => g.unlocked).length === 0 ? (
                        <div className="text-center text-gray-500 py-16 px-6">
                          <p className="text-sm">아직 선물한 항목이 없습니다.</p>
                          <p className="text-xs text-gray-600 mt-1">미구매 탭에서 선물할 수 있어요.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4 py-3">
                          {gifts.filter((g) => g.unlocked).map((g) => {
                            const canApply = g.tag === 'OUTFIT'
                            const isApplying = applyingId === g.id
                            return (
                              <section key={g.id} className="px-3">
                                <div className="flex items-center gap-2.5 mb-2">
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0">
                                    <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white font-medium truncate">{g.name}</p>
                                    <p className="text-[11px] text-gray-500">
                                      해금 콘텐츠 {g.contents?.length || 0}개
                                    </p>
                                  </div>
                                  {canApply && (
                                    <button
                                      onClick={() => handleApplyOutfit(g)}
                                      disabled={isApplying}
                                      className="flex-shrink-0 px-3 py-1.5 text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50"
                                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                                    >
                                      {isApplying ? '변경 중...' : '착용시키기'}
                                    </button>
                                  )}
                                </div>

                                {g.contents?.length > 0 ? (
                                  <div className="grid grid-cols-3 gap-[2px] bg-gray-900 rounded-lg overflow-hidden">
                                    {g.contents.map((c, idx) => (
                                      <button
                                        key={c.id}
                                        onClick={() => setGiftViewer({ gift: g, index: idx })}
                                        className="aspect-square relative bg-gray-950 overflow-hidden"
                                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                                      >
                                        {c.type === 'VIDEO' ? (
                                          <>
                                            <video
                                              src={c.filePath}
                                              muted
                                              playsInline
                                              preload="metadata"
                                              className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                              <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                                                  <polygon points="8 5 19 12 8 19" />
                                                </svg>
                                              </div>
                                            </div>
                                          </>
                                        ) : (
                                          <img
                                            src={c.filePath}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                          />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-gray-600 italic py-3 text-center bg-gray-900/50 rounded-lg">
                                    해금된 콘텐츠가 없습니다
                                  </div>
                                )}
                              </section>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </>
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
              data-onboarding-target="attach-feed"
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
          actions={conversationId && allowBackgroundChange ? [
            {
              key: 'set-bg',
              label: '배경으로 설정',
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              ),
              onClick: async (image) => {
                try {
                  await api.put(`/conversations/${conversationId}/background`, { backgroundImage: image.filePath })
                  onBackgroundChange?.(image.filePath)
                  setSlideViewer(null)
                  onClose()
                } catch (err) {
                  console.error('Set background error:', err)
                }
              },
            },
          ] : undefined}
          onClose={() => setSlideViewer(null)}
        />
      )}

      {/* 선물 콘텐츠 뷰어 — 이미지/비디오 혼합. ImageSlideViewer 재사용 */}
      {giftViewer && (
        <ImageSlideViewer
          images={giftViewer.gift.contents.map((c) => ({ filePath: c.filePath, type: c.type }))}
          initialIndex={giftViewer.index}
          title={`🎁 ${giftViewer.gift.name}`}
          onClose={() => setGiftViewer(null)}
        />
      )}

      {/* 선물 구매 확인 모달 */}
      {pendingGift && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center px-6" onClick={() => !sending && setPendingGift(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-800 mb-3">
                <img src={pendingGift.imageUrl} alt={pendingGift.name} className="w-full h-full object-cover" />
              </div>
              <p className="text-base text-white font-bold mb-1">{pendingGift.name}</p>
              <p className="text-xs text-gray-400 mb-4">{characterName}에게 선물하시겠습니까?</p>
              <div className="flex items-center gap-1 text-sm text-white bg-gray-800 px-3 py-1.5 rounded-full mb-4">
                <MaskIcon className="w-3.5 h-3.5" />
                <span>{pendingGift.maskCost} 차감</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingGift(null)}
                disabled={sending}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-lg"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={confirmSendGift}
                disabled={sending}
                className="flex-1 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {sending ? '전송 중...' : '선물하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 선물 완료 결과 모달 */}
      {result && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center px-4" onClick={closeGiftResult}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 text-center">
              <p className="text-xs text-emerald-400 mb-1">🎁 선물 완료</p>
              <p className="text-base font-bold text-white">{result.gift.name}</p>
            </div>
            {result.contents.length > 0 ? (
              <div className="relative bg-black">
                <div className="aspect-[3/4]">
                  {result.contents[contentIndex]?.type === 'VIDEO' ? (
                    <video
                      src={result.contents[contentIndex].filePath}
                      className="w-full h-full object-contain"
                      autoPlay
                      controls
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={result.contents[contentIndex]?.filePath}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                {result.contents.length > 1 && (
                  <>
                    <button
                      onClick={() => setContentIndex((i) => Math.max(0, i - 1))}
                      disabled={contentIndex === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setContentIndex((i) => Math.min(result.contents.length - 1, i + 1))}
                      disabled={contentIndex === result.contents.length - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {contentIndex + 1} / {result.contents.length}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-xs text-gray-500">해금된 콘텐츠가 없습니다.</div>
            )}
            <div className="px-5 py-4 flex flex-col gap-2">
              <p className="text-[11px] text-gray-500 text-center">해금한 콘텐츠는 선물 탭의 구매 목록에서 다시 볼 수 있어요.</p>
              <button
                onClick={closeGiftResult}
                className="w-full py-2.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
