import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import { isAdMobAvailable, initAdMob, showRewardedAd } from '../../lib/admob'

// 파트 썸네일 슬라이드 — 결과 페이지의 premiumMedia를 그대로 사용 (잠긴 항목은 약한 블러)
const THUMB_SLIDE_INTERVAL_MS = 2000
const LOCKED_MEDIA_STYLE = { filter: 'blur(3px)', transform: 'scale(1.03)' }

export default function Scenario() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()

  const [scenario, setScenario] = useState(null)
  const [parts, setParts] = useState([])
  const [error, setError] = useState(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [pendingPartId, setPendingPartId] = useState(null)
  const [unlockingId, setUnlockingId] = useState(null)
  const [adUnsupportedModal, setAdUnsupportedModal] = useState(false)
  const [adFailedToast, setAdFailedToast] = useState(false)
  const [slideTick, setSlideTick] = useState(0)

  useEffect(() => {
    if (isAdMobAvailable()) initAdMob().catch(() => {})
  }, [])
  useEffect(() => {
    const id = setInterval(() => setSlideTick((t) => t + 1), THUMB_SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (!adFailedToast) return
    const t = setTimeout(() => setAdFailedToast(false), 4000)
    return () => clearTimeout(t)
  }, [adFailedToast])

  useEffect(() => {
    api.get(`/scenarios/${id}`)
      .then(({ scenario, parts }) => {
        setScenario(scenario)
        setParts(parts || [])
      })
      .catch((e) => setError(e?.message || 'Failed to load'))
  }, [id])

  const handlePartClick = async (s) => {
    if (!token) {
      setPendingPartId(s.id)
      setShowLoginModal(true)
      return
    }
    if (!s.locked) {
      navigate(`/storylines/${s.id}`)
      return
    }
    if (!isAdMobAvailable()) {
      setAdUnsupportedModal(true)
      return
    }
    if (unlockingId) return
    setUnlockingId(s.id)
    try {
      await showRewardedAd()
      await api.post(`/storylines/${s.id}/unlock-ad`)
      setParts((prev) => prev.map((x) => (x.id === s.id ? { ...x, locked: false } : x)))
      setUnlockingId(null)
      navigate(`/storylines/${s.id}`)
    } catch (e) {
      setUnlockingId(null)
      if (e?.message === 'AD_DISMISSED') return
      setAdFailedToast(true)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-black text-gray-400 gap-3">
        <p>시나리오를 불러오지 못했습니다.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-indigo-400" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>돌아가기</button>
      </div>
    )
  }
  if (!scenario) {
    return <div className="flex items-center justify-center h-dvh bg-black text-gray-400">로딩 중...</div>
  }

  return (
    <>
      <Helmet>
        <title>{scenario.title} · Pesona</title>
      </Helmet>
      <div className="min-h-dvh bg-black text-white relative">
        {/* 헤더 */}
        <div
          className="sticky top-0 z-30 flex items-center gap-2 px-3 bg-black/80 backdrop-blur-sm border-b border-gray-800"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="뒤로"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-sm font-bold flex-1 truncate">{scenario.title}</h1>
          {scenario.status === 'TEST' && (
            <span className="px-2 py-0.5 bg-amber-600/90 text-white text-[10px] rounded-full font-semibold">TEST</span>
          )}
        </div>

        {/* 시나리오 메타 */}
        <div className="px-4 pt-4 pb-2">
          {scenario.thumbnailImage && (
            <div className="aspect-[16/9] rounded-2xl overflow-hidden mb-4 bg-gray-900 border border-gray-800">
              <img src={scenario.thumbnailImage} alt={scenario.title} className="w-full h-full object-cover" />
            </div>
          )}
          <h2 className="text-xl font-bold mb-1.5">{scenario.title}</h2>
          {scenario.character?.name && (
            <p className="text-xs text-indigo-300 font-medium mb-2">{scenario.character.name}</p>
          )}
          {scenario.description && (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{scenario.description}</p>
          )}
        </div>

        {/* 파트 리스트 */}
        <div className="px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-200">파트</h3>
            <span className="text-[11px] text-gray-500">{parts.length}개</span>
          </div>
          {parts.length === 0 ? (
            <p className="text-xs text-gray-500 mt-3">아직 공개된 파트가 없어요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {parts.map((s) => {
                const isUnlocking = unlockingId === s.id
                const locked = !!s.locked
                const media = Array.isArray(s.premiumMedia) ? s.premiumMedia : []
                const isMulti = media.length > 1
                const activeIdx = isMulti ? slideTick % media.length : 0
                return (
                  <button
                    key={s.id}
                    onClick={() => handlePartClick(s)}
                    disabled={isUnlocking}
                    className="aspect-[9/16] rounded-xl overflow-hidden relative bg-gray-900 border border-gray-800 hover:border-indigo-500 transition-colors disabled:opacity-80"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {media.length > 0 ? (
                      media.map((m, idx) => {
                        const isActive = idx === activeIdx
                        const blur = !m.unlocked
                        const baseCls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`
                        return m.type === 'video' ? (
                          <video
                            key={idx}
                            src={m.url}
                            className={baseCls}
                            style={blur ? LOCKED_MEDIA_STYLE : undefined}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            key={idx}
                            src={m.url}
                            alt=""
                            className={baseCls}
                            style={blur ? LOCKED_MEDIA_STYLE : undefined}
                            draggable={false}
                          />
                        )
                      })
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-purple-900/30" />
                    )}

                    {/* 파트 순번 뱃지 */}
                    {s.partOrder != null && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-full font-semibold">
                        {s.partOrder}
                      </div>
                    )}

                    {!locked && s.progress?.status === 'COMPLETED' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600/90 text-white text-[10px] rounded-full font-semibold">완료</div>
                    )}
                    {!locked && s.progress?.status === 'IN_PROGRESS' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-indigo-600/90 text-white text-[10px] rounded-full font-semibold">진행 중</div>
                    )}
                    {s.status === 'TEST' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-600/90 text-white text-[10px] rounded-full font-semibold">TEST</div>
                    )}

                    {/* 잠금 오버레이 */}
                    {locked && (
                      <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center px-3 text-center pointer-events-none">
                        {isUnlocking ? (
                          <>
                            <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin mb-2" />
                            <p className="text-white text-xs font-semibold">광고 준비 중...</p>
                          </>
                        ) : (
                          <>
                            <div className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center mb-2 ring-1 ring-white/20">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </div>
                            <p className="text-white text-[12px] font-bold leading-tight">광고보고<br/>진행하기</p>
                          </>
                        )}
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pt-10 pb-3 text-left">
                      <p className="font-semibold text-sm text-white line-clamp-1">{s.title}</p>
                      {s.description && !locked && (
                        <p className="text-[11px] text-gray-300 line-clamp-2 mt-1 leading-relaxed">{s.description}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 광고 실패 토스트 */}
        {adFailedToast && (
          <div
            className="absolute left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
            style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}
          >
            <div className="bg-gray-900/95 text-white text-sm px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm border border-gray-700 max-w-xs">
              <p className="leading-snug">광고를 불러오지 못했어요.<br/>잠시 후 다시 시도해주세요.</p>
            </div>
          </div>
        )}

        {/* 광고 사용 불가 환경 안내 */}
        {adUnsupportedModal && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-xs w-full text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-indigo-600/20 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-white text-sm font-bold mb-1">앱에서 해금할 수 있어요</p>
              <p className="text-gray-400 text-xs leading-relaxed mb-4">
                스토리는 모바일 앱에서 광고 시청 후 진행할 수 있어요.
              </p>
              <button
                onClick={() => setAdUnsupportedModal(false)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                확인
              </button>
            </div>
          </div>
        )}

        {showLoginModal && (
          <LoginModal
            onClose={() => { setShowLoginModal(false); setPendingPartId(null) }}
            onLoginSuccess={() => {
              setShowLoginModal(false)
              const target = pendingPartId
              setPendingPartId(null)
              if (target) navigate(`/storylines/${target}`)
            }}
          />
        )}
      </div>
    </>
  )
}
