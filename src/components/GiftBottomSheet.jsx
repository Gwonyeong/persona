import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import MaskIcon from './MaskIcon'

const PURCHASE_TABS = [
  { key: 'UNBOUGHT', labelKey: 'gift.tabUnbought' },
  { key: 'BOUGHT', labelKey: 'gift.tabBought' },
]

// 채팅 페이지의 선물 바텀시트
// - 상단 탭: 미구매 / 구매로 분기
// - 미구매: 썸네일 + 이름 + 비용 + 해금 콘텐츠 블러 미리보기 (기존 row 레이아웃)
// - 구매: 썸네일 + 이름만 (해금 콘텐츠는 갤러리 바텀시트 → 선물 탭에서 확인)
export default function GiftBottomSheet({ characterId, characterName, conversationId, onClose, onGiftSent, onOutfitApplied }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { masks, setMasks } = useStore()

  const [gifts, setGifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('UNBOUGHT')
  const [mounted, setMounted] = useState(false)
  const [applyingId, setApplyingId] = useState(null)
  const overlayRef = useRef(null)

  // 확인 모달
  const [pendingGift, setPendingGift] = useState(null)
  const [sending, setSending] = useState(false)

  // 결과 모달 (해금 콘텐츠 미리보기)
  const [result, setResult] = useState(null) // { gift, contents }
  const [contentIndex, setContentIndex] = useState(0)

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
    api.get(`/gifts/character/${characterId}`)
      .then(({ gifts }) => setGifts(gifts || []))
      .catch(() => setGifts([]))
      .finally(() => setLoading(false))
  }, [characterId])

  // 탭에 따라 미구매/구매 분기. 서버 정렬 유지.
  const unboughtCount = gifts.filter((g) => !g.unlocked).length
  const boughtCount = gifts.length - unboughtCount
  const filtered = gifts.filter((g) => (tab === 'BOUGHT' ? g.unlocked : !g.unlocked))

  const handleSelect = (gift) => {
    if (gift.unlocked) {
      // 이미 선물한 경우엔 알림만 — 콘텐츠 다시 보기는 캐릭터 상세 페이지의 갤러리 탭에서
      return
    }
    setPendingGift(gift)
  }

  // 구매한 OUTFIT 선물 → 캐릭터에게 입혀달라고 요청
  // 선물 이름과 동일한 CharacterStyle을 서버가 찾아서 변경. 매칭 실패 시 안내.
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
      alert(t('gift.outfitChangeFailed'))
    } finally {
      setApplyingId(null)
    }
  }

  const confirmSend = async () => {
    if (!pendingGift) return
    if (masks < pendingGift.maskCost) {
      alert(t('gift.insufficientMasks'))
      onClose?.()
      navigate('/subscription')
      return
    }
    setSending(true)
    try {
      const res = await api.post(`/gifts/conversation/${conversationId}/send/${pendingGift.id}`)
      setMasks(res.masks)
      // 목록 업데이트 (해금 표시)
      setGifts((prev) => prev.map((g) => (g.id === pendingGift.id ? { ...g, unlocked: true } : g)))
      // 부모(Chat.jsx)에 새 메시지(GIFT + 감사 인사들 + 이미지 버블)와 호감도 변화 전달
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
        alert(t('gift.insufficientMasks'))
        onClose?.()
        navigate('/subscription')
      } else if (err.status === 409) {
        alert(t('gift.alreadyGifted'))
        setGifts((prev) => prev.map((g) => (g.id === pendingGift.id ? { ...g, unlocked: true } : g)))
        setPendingGift(null)
      } else {
        alert(t('gift.sendFailed'))
      }
    } finally {
      setSending(false)
    }
  }

  const closeResult = () => {
    setResult(null)
    onClose?.()
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
          <div className="flex items-center justify-between px-4 pb-2">
            <h3 className="text-sm font-bold text-white">{t('gift.sheetTitle', { name: characterName })}</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-gray-300">
                <MaskIcon className="w-3.5 h-3.5" />
                <span>{masks}</span>
              </div>
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
          </div>

          {/* 구매 상태 탭 (미구매 / 구매) */}
          <div className="border-t border-gray-800 px-2 pt-1">
            <div className="flex">
              {PURCHASE_TABS.map((pt) => {
                const count = pt.key === 'BOUGHT' ? boughtCount : unboughtCount
                return (
                  <button
                    key={pt.key}
                    onClick={() => setTab(pt.key)}
                    className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      tab === pt.key
                        ? 'border-white text-white'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {t(pt.labelKey)}
                    <span className="ml-1 text-xs opacity-70">({count})</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 리스트 — 1행 = 1선물 (좌: 썸네일 / 우: 해금 콘텐츠 블러 미리보기) */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="text-center text-gray-500 py-12 text-sm">{t('gift.loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-500 py-12 text-sm">
              {tab === 'BOUGHT'
                ? t('gift.emptyBought')
                : (gifts.length > 0 ? t('gift.allSent') : t('gift.emptyGifts'))}
            </div>
          ) : (
            <div className={tab === 'BOUGHT' ? 'grid grid-cols-3 gap-2' : 'flex flex-col gap-2'}>
              {filtered.map((g) => {
                // ── 구매 탭: 썸네일 + 이름 + 착용시키기 버튼 (OUTFIT 태그) ───
                if (tab === 'BOUGHT') {
                  const canApply = g.tag === 'OUTFIT'
                  const isApplying = applyingId === g.id
                  return (
                    <div
                      key={g.id}
                      className={`rounded-xl overflow-hidden border ${
                        g.adminOnly
                          ? 'bg-amber-950/40 border-amber-700/60'
                          : 'bg-gray-800/70 border-gray-700'
                      }`}
                    >
                      <div className="aspect-square relative">
                        <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-emerald-500/90 flex items-center justify-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        {g.adminOnly && (
                          <div className="absolute top-1.5 left-1.5 bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                            {t('gift.test')}
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-[11px] text-white font-medium truncate">{g.name}</p>
                      </div>
                      {canApply && (
                        <div className="px-2 pb-2">
                          <button
                            onClick={() => handleApplyOutfit(g)}
                            disabled={isApplying}
                            className="w-full py-1 text-[10px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            {isApplying ? t('gift.applying') : t('gift.apply')}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                }

                // ── 미구매 탭: row 레이아웃 (썸네일 + 이름 + 비용 + 블러 미리보기) ───
                return (
                  <button
                    key={g.id}
                    onClick={() => handleSelect(g)}
                    className={`w-full rounded-xl border p-2.5 flex items-center gap-2.5 text-left transition-colors ${
                      g.adminOnly
                        ? 'bg-amber-950/40 border-amber-700/60 hover:border-amber-500'
                        : 'bg-gray-800/70 border-gray-700 hover:border-gray-500'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* 좌: 선물 썸네일 */}
                    <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900">
                      <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                    </div>

                    {/* 우: 이름/비용 + 해금 콘텐츠 블러 미리보기 */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {g.adminOnly && (
                            <span className="flex-shrink-0 text-[9px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wide">
                              {t('gift.test')}
                            </span>
                          )}
                          <p className="text-[13px] text-white font-medium truncate">{g.name}</p>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1 bg-gray-900/80 px-2 py-0.5 rounded-full">
                          <MaskIcon className="w-3 h-3" />
                          <span className="text-[11px] text-white">{g.maskCost}</span>
                        </div>
                      </div>

                      {/* 콘텐츠 미리보기 (블러) */}
                      {g.contents?.length > 0 ? (
                        <div className="flex gap-1 overflow-hidden">
                          {g.contents.slice(0, 4).map((c) => (
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
                              {g.contents.length > 4 && c === g.contents[3] && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <span className="text-[11px] text-white font-medium">+{g.contents.length - 4}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-12 flex items-center">
                          <span className="text-[10px] text-gray-500 italic">{t('gift.noUnlockContent')}</span>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 확인 모달 */}
      {pendingGift && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center px-6" onClick={() => !sending && setPendingGift(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-800 mb-3">
                <img src={pendingGift.imageUrl} alt={pendingGift.name} className="w-full h-full object-cover" />
              </div>
              <p className="text-base text-white font-bold mb-1">{pendingGift.name}</p>
              <p className="text-xs text-gray-400 mb-4">
                {t('gift.confirmSend', { name: characterName })}
              </p>
              <div className="flex items-center gap-1 text-sm text-white bg-gray-800 px-3 py-1.5 rounded-full mb-4">
                <MaskIcon className="w-3.5 h-3.5" />
                <span>{t('gift.deductAmount', { count: pendingGift.maskCost })}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingGift(null)}
                disabled={sending}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-lg"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmSend}
                disabled={sending}
                className="flex-1 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {sending ? t('gift.sending') : t('gift.send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 모달 (해금 콘텐츠 미리보기) */}
      {result && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center px-4" onClick={closeResult}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 text-center">
              <p className="text-xs text-emerald-400 mb-1">{t('gift.completed')}</p>
              <p className="text-base font-bold text-white">{result.gift.name}</p>
            </div>
            {result.contents.length > 0 ? (
              <>
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
              </>
            ) : (
              <div className="px-5 py-6 text-center text-xs text-gray-500">
                {t('gift.noUnlockedContent')}
              </div>
            )}
            <div className="px-5 py-4 flex flex-col gap-2">
              <p className="text-[11px] text-gray-500 text-center">
                {t('gift.rewatchHint')}
              </p>
              <button
                onClick={closeResult}
                className="w-full py-2.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
