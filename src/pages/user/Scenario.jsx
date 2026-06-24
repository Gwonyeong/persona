import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'

// 파트 썸네일 슬라이드 — 결과 페이지의 premiumMedia를 그대로 사용 (잠긴 항목은 약한 블러)
const THUMB_SLIDE_INTERVAL_MS = 2000
const LOCKED_MEDIA_STYLE = { filter: 'blur(3px)', transform: 'scale(1.03)' }

export default function Scenario() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()

  const [scenario, setScenario] = useState(null)
  const [parts, setParts] = useState([])
  const [error, setError] = useState(null)
  const [slideTick, setSlideTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSlideTick((t) => t + 1), THUMB_SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    api.get(`/scenarios/${id}`)
      .then(({ scenario, parts }) => {
        setScenario(scenario)
        setParts(parts || [])
      })
      .catch((e) => setError(e?.message || 'Failed to load'))
  }, [id])

  const handlePartClick = (s) => {
    if (!token) {
      goToLogin(navigate)
      return
    }
    navigate(`/storylines/${s.id}`)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-black text-gray-400 gap-3">
        <p>{t('scenario.loadFailed')}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-indigo-400" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>{t('scenario.goBack')}</button>
      </div>
    )
  }
  if (!scenario) {
    return <div className="flex items-center justify-center h-dvh bg-black text-gray-400">{t('scenario.loading')}</div>
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
            aria-label={t('scenario.back')}
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
            <h3 className="text-sm font-bold text-gray-200">{t('scenario.partsLabel')}</h3>
            <span className="text-[11px] text-gray-500">{t('scenario.partsCount', { count: parts.length })}</span>
          </div>
          {parts.length === 0 ? (
            <p className="text-xs text-gray-500 mt-3">{t('scenario.noParts')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {parts.map((s) => {
                const media = Array.isArray(s.premiumMedia) ? s.premiumMedia : []
                const isMulti = media.length > 1
                const activeIdx = isMulti ? slideTick % media.length : 0
                return (
                  <button
                    key={s.id}
                    onClick={() => handlePartClick(s)}
                    className="aspect-[9/16] rounded-xl overflow-hidden relative bg-gray-900 border border-gray-800 hover:border-indigo-500 transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {media.length > 0 ? (
                      media.map((m, idx) => {
                        const isActive = idx === activeIdx
                        const blur = !m.unlocked
                        const baseCls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`
                        // 비디오라도 포스터 이미지가 있으면 <img>로 렌더 — 영상 다운로드 회피.
                        // 포스터 없는 레거시 비디오만 <video preload="metadata"> fallback.
                        if (m.type === 'video' && !m.posterUrl) {
                          return (
                            <video
                              key={idx}
                              src={m.url}
                              className={baseCls}
                              style={blur ? LOCKED_MEDIA_STYLE : undefined}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          )
                        }
                        return (
                          <img
                            key={idx}
                            src={m.type === 'video' ? m.posterUrl : m.url}
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

                    {s.progress?.status === 'COMPLETED' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600/90 text-white text-[10px] rounded-full font-semibold">{t('scenario.completed')}</div>
                    )}
                    {s.progress?.status === 'IN_PROGRESS' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-indigo-600/90 text-white text-[10px] rounded-full font-semibold">{t('scenario.inProgress')}</div>
                    )}
                    {s.status === 'TEST' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-600/90 text-white text-[10px] rounded-full font-semibold">TEST</div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pt-10 pb-3 text-left">
                      <p className="font-semibold text-sm text-white line-clamp-1">{s.title}</p>
                      {s.description && (
                        <p className="text-[11px] text-gray-300 line-clamp-2 mt-1 leading-relaxed">{s.description}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
