import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import ImageSlideViewer from '../../components/ImageSlideViewer'
import ProfileVariantPicker from '../../components/ProfileVariantPicker'
import MaskIcon from '../../components/MaskIcon'

const EXPRESSION_VIDEO_COST = 10

// 보관함 — 한 캐릭터에게서 획득한 애셋(보이스/이미지/영상/의상)을 종류별 탭으로 보여준다.
// 진입: 마이페이지 보관함 그리드, (Phase 3) 채팅 갤러리 버튼.

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export default function CharacterCollection() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(null)
  const [viewer, setViewer] = useState(null) // { images: [{filePath, type}], index }
  const [showGachaHint, setShowGachaHint] = useState(false) // 미보유 의상 안내 모달
  const [showProfilePicker, setShowProfilePicker] = useState(false) // 프로필 이미지 변경 시트
  const [unlockingImageId, setUnlockingImageId] = useState(null) // 영상 해금 진행 중
  const masks = useStore((s) => s.masks)
  const setMasks = useStore((s) => s.setMasks)

  useEffect(() => {
    let alive = true
    api.get(`/collection/${characterId}`)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [characterId])

  // 프로필 변경 반영 — 컬렉션 재조회로 character.profileImage 갱신
  const refreshProfile = () => {
    api.get(`/collection/${characterId}`)
      .then((res) => setData(res))
      .catch((e) => console.error(e))
  }

  // 표정 영상 해금 (10마스크) — V1 채팅 갤러리와 동일 엔드포인트
  const unlockVideo = async (vid) => {
    if (unlockingImageId) return
    if (masks < EXPRESSION_VIDEO_COST) {
      navigate('/subscription')
      return
    }
    setUnlockingImageId(vid.characterImageId)
    try {
      const res = await api.post(`/characters/${characterId}/images/${vid.characterImageId}/unlock-video`, {})
      if (res.masks !== undefined) setMasks(res.masks)
      const fresh = await api.get(`/collection/${characterId}`)
      setData(fresh)
    } catch (err) {
      if (err?.error === 'INSUFFICIENT_MASKS') navigate('/subscription')
      else alert(t('common.error') || '해금에 실패했어요.')
    } finally {
      setUnlockingImageId(null)
    }
  }

  const tabs = useMemo(() => {
    if (!data) return []
    return [
      { key: 'voices', label: t('collection.tabVoices'), count: data.counts.voices },
      { key: 'images', label: t('collection.tabImages'), count: data.counts.images },
      { key: 'videos', label: t('collection.tabVideos'), count: data.counts.videos },
      { key: 'outfits', label: t('collection.tabOutfits'), count: data.counts.outfits },
    ]
  }, [data, t])

  // 첫 진입 시 항목 있는 첫 탭으로
  useEffect(() => {
    if (data && tab === null) {
      const first = tabs.find((x) => x.count > 0)
      setTab(first ? first.key : 'voices')
    }
  }, [data, tabs, tab])

  const totalCount = data ? data.counts.voices + data.counts.images + data.counts.videos + data.counts.outfits : 0

  return (
    <div className="relative min-h-full bg-gray-950 text-gray-100 pb-12">
      <Helmet><title>{t('collection.title')}</title></Helmet>

      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <button
          onClick={() => navigate(-1)}
          className="-ml-2 p-2 text-gray-300"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <BackIcon />
        </button>
        {data?.character?.profileImage && (
          <img src={data.character.profileImage} alt="" className="w-7 h-7 rounded-full object-cover" />
        )}
        <h1 className="text-base font-bold truncate">{data?.character?.name || t('collection.title')}</h1>
      </div>

      {loading && <p className="text-center text-sm text-gray-500 py-16">{t('common.loading')}</p>}

      {!loading && data && totalCount === 0 && (
        <p className="text-center text-sm text-gray-500 py-16">{t('collection.empty')}</p>
      )}

      {!loading && data && totalCount > 0 && (
        <>
          {/* 종류 탭 */}
          <div className="sticky top-[49px] z-10 bg-gray-950/95 backdrop-blur px-3 py-2 border-b border-gray-800">
            <div className="grid grid-cols-4 gap-1">
              {tabs.map((tb) => (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                    tab === tb.key ? 'bg-white/10 text-white' : 'bg-gray-900 text-gray-500'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {tb.label}
                  {tb.count > 0 && <span className="ml-1 text-[10px] text-gray-400">{tb.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-4">
            {/* 보이스 — 특별 보이스 + 대화 생성 목소리 (별도 하위 그룹) */}
            {tab === 'voices' && (() => {
              const chat = data.chatVoices || { items: [], total: 0, truncated: false }
              if (data.voices.length === 0 && chat.items.length === 0) return <EmptyTab t={t} />
              return (
                <div className="space-y-6">
                  {data.voices.length > 0 && (
                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 mb-2">{t('collection.voicesCollected')}</h2>
                      <div className="space-y-3">
                        {data.voices.map((v) => <VoiceCard key={v.id} v={v} />)}
                      </div>
                    </div>
                  )}
                  {chat.items.length > 0 && (
                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 mb-2">{t('collection.voicesChat')}</h2>
                      <div className="space-y-3">
                        {chat.items.map((v) => <VoiceCard key={v.id} v={v} />)}
                      </div>
                      {chat.truncated && (
                        <p className="mt-3 text-center text-[11px] text-gray-600">
                          {t('collection.voicesChatMore', { count: chat.items.length })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 이미지 */}
            {tab === 'images' && (
              data.images.length === 0 && !(data.maskPassImages?.length) ? <EmptyTab t={t} /> : (
                <>
                  {/* 상단: 현재 프로필 이미지 — 탭하면 보유 이미지로 변경 */}
                  {data.character?.profileImage && (
                    <div className="flex flex-col items-center mb-5">
                      <button
                        onClick={() => setShowProfilePicker(true)}
                        className="relative"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <img
                          src={data.character.profileImage}
                          alt={data.character.name || ''}
                          className="w-28 h-28 rounded-2xl object-cover border border-gray-700"
                        />
                        {/* 편집 배지 */}
                        <span className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-indigo-600 border-2 border-gray-950 flex items-center justify-center text-white">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </span>
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {data.images.map((img, i) => (
                      <button
                        key={img.id}
                        onClick={() => setViewer({ images: data.images.map((m) => ({ filePath: m.imageUrl, type: 'IMAGE' })), index: i })}
                        className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                        style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <img src={img.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>

                  {/* 마스크 패스에서 얻은 이미지 — 별도 소제목 섹션 */}
                  {data.maskPassImages?.length > 0 && (
                    <div className="mt-6">
                      <h2 className="text-xs font-semibold text-gray-500 mb-2">{t('collection.imagesMaskPass')}</h2>
                      <div className="grid grid-cols-3 gap-2">
                        {data.maskPassImages.map((img, i) => (
                          <button
                            key={img.id}
                            onClick={() => setViewer({ images: data.maskPassImages.map((m) => ({ filePath: m.imageUrl, type: 'IMAGE' })), index: i })}
                            className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                            style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            <img src={img.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            )}

            {/* 영상 — 해금분(선명 재생) + 미해금분(블러 영상 + 해금하기) */}
            {tab === 'videos' && (
              data.videos.length === 0 ? <EmptyTab t={t} /> : (
                <div className="grid grid-cols-3 gap-2">
                  {data.videos.map((vid) => {
                    const locked = vid.videoUnlocked === false
                    const isUnlocking = unlockingImageId === vid.characterImageId
                    // 해금된 영상만 슬라이드 뷰어 대상 — 잠긴 영상은 재생 대신 해금 액션
                    const unlockedList = data.videos.filter((v) => v.videoUnlocked !== false)
                    return (
                      <button
                        key={vid.id}
                        onClick={() => {
                          if (locked) unlockVideo(vid)
                          else setViewer({ images: unlockedList.map((m) => ({ filePath: m.videoUrl, type: 'VIDEO' })), index: unlockedList.findIndex((m) => m.id === vid.id) })
                        }}
                        disabled={isUnlocking}
                        className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700 disabled:opacity-70"
                        style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {locked ? (
                          // 미해금 — 블러 영상 재생
                          <video src={vid.videoUrl} className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(14px)' }} autoPlay loop muted playsInline />
                        ) : vid.thumbnailUrl ? (
                          <img src={vid.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <video src={vid.videoUrl} className="absolute inset-0 w-full h-full object-cover" muted />
                        )}
                        {locked && <div className="absolute inset-0 bg-black/30" />}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                              {isUnlocking ? (
                                <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="42 100" strokeLinecap="round" /></svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                              )}
                            </div>
                            {locked && !isUnlocking && (
                              <div className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 flex items-center gap-1 text-[10px] text-white">
                                <MaskIcon />
                                <span>{EXPRESSION_VIDEO_COST}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            )}

            {/* 의상 */}
            {tab === 'outfits' && (
              data.outfits.length === 0 ? <EmptyTab t={t} /> : (
                <div className="grid grid-cols-3 gap-2">
                  {data.outfits.map((o) => (
                    <div
                      key={o.id}
                      onClick={o.owned ? undefined : () => setShowGachaHint(true)}
                      className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                      style={{ aspectRatio: '9 / 16', ...(o.owned ? {} : { cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }) }}
                    >
                      {o.thumbnailUrl && (
                        // 미보유 의상은 썸네일을 어둡게 처리
                        <img
                          src={o.thumbnailUrl}
                          alt={o.name || ''}
                          className={`absolute inset-0 w-full h-full object-cover ${o.owned ? '' : 'brightness-[0.35]'}`}
                          loading="lazy"
                        />
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                        <span className={`text-[11px] truncate block ${o.owned ? 'text-white' : 'text-gray-400'}`}>{o.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* 풀스크린 슬라이드 뷰어 — 스와이프로 이전/다음 이동. fixed 래퍼로 뷰포트에 고정(스크롤 무관). */}
      {viewer && (
        <div className="fixed inset-0 z-[70] max-w-[480px] mx-auto">
          <ImageSlideViewer
            images={viewer.images}
            initialIndex={viewer.index}
            onClose={() => setViewer(null)}
          />
        </div>
      )}

      {/* 미보유 의상 안내 — 선물 뽑기 유도 */}
      {showGachaHint && (
        <div
          className="fixed inset-0 z-[70] max-w-[480px] mx-auto bg-black/70 flex items-center justify-center px-8"
          onClick={() => setShowGachaHint(false)}
        >
          <div
            className="w-full rounded-2xl bg-gray-900 border border-gray-700 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-100 mb-5">{t('collection.outfitLockedGacha')}</p>
            <button
              onClick={() => navigate('/gacha')}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-500 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('collection.goToGacha')}
            </button>
          </div>
        </div>
      )}

      {/* 프로필 이미지 변경 — 보유 이미지 중 선택 (fixed 래퍼로 뷰포트 고정) */}
      {showProfilePicker && (
        <div className="fixed inset-0 z-[70] max-w-[480px] mx-auto">
          <ProfileVariantPicker
            open={showProfilePicker}
            characterId={Number(characterId)}
            onClose={() => setShowProfilePicker(false)}
            onApplied={refreshProfile}
          />
        </div>
      )}
    </div>
  )
}

// 캐릭터 텍스트를 대사와 속마음(《...》 지문)으로 분리. 채팅(parseMessageSegments)과 동일 컨벤션.
function parseVoiceSegments(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .split(/(《[^》\n]+》)/g)
    .map((p) => (p == null ? '' : p.trim()))
    .filter((p) => p !== '')
    .map((p) => (/^《.+》$/.test(p) ? { type: 'action', value: p.slice(1, -1) } : { type: 'text', value: p }))
}

function VoiceCard({ v }) {
  const audioRef = useRef(null)
  const idxRef = useRef(0)
  const [playing, setPlaying] = useState(false)

  // 대화 턴은 v.bubbles([{text, audioUrl}]), 수집 보이스는 단일(transcript/audioUrl) — 공통 shape로 정규화.
  const segments = v.bubbles?.length ? v.bubbles : [{ text: v.transcript, audioUrl: v.audioUrl }]
  const urls = segments.map((s) => s.audioUrl).filter(Boolean)

  const playFrom = (i) => {
    const el = audioRef.current
    if (!el || i >= urls.length) return
    idxRef.current = i
    el.src = urls[i]
    el.play().catch(() => {})
  }

  const toggle = () => {
    const el = audioRef.current
    if (!el || urls.length === 0) return
    if (playing) el.pause()
    else playFrom(idxRef.current >= urls.length ? 0 : idxRef.current)
  }

  // 한 버블이 끝나면 다음 버블로 순차 재생, 마지막이면 처음으로 리셋.
  const onEnded = () => {
    const next = idxRef.current + 1
    if (next < urls.length) playFrom(next)
    else { idxRef.current = 0; setPlaying(false) }
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
      <div className="shrink-0 flex flex-col items-center gap-1">
        <button
          onClick={toggle}
          className="w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center active:bg-white/20 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        {v.nsfw && (
          <span className="text-[9px] font-bold tracking-wide text-rose-400/90 whitespace-nowrap">safety off</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {v.title && <p className="text-sm text-gray-200 mb-1">{v.title}</p>}
        <div className="space-y-1.5">
          {segments.filter((s) => s.text).map((s, i) => (
            <div key={i} className="space-y-0.5">
              {parseVoiceSegments(s.text).map((seg, j) =>
                seg.type === 'action' ? (
                  // 속마음/지문: 이탤릭 + 흐린 색으로 대사와 구분 (폰트는 산세리프로 통일)
                  <p key={j} className="text-[11px] text-gray-500 italic whitespace-pre-line leading-relaxed">《{seg.value}》</p>
                ) : (
                  // 대사: 산세리프 + 밝은 색
                  <p key={j} className="text-xs text-gray-200 whitespace-pre-line leading-relaxed">{seg.value}</p>
                )
              )}
            </div>
          ))}
        </div>
      </div>
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        className="hidden"
      />
    </div>
  )
}

function EmptyTab({ t }) {
  return <p className="text-center text-sm text-gray-500 py-12">{t('collection.emptyTab')}</p>
}
