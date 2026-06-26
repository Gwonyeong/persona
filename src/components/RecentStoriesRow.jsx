import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

// Scenario.jsx의 썸네일 슬라이드 패턴을 그대로 사용
const THUMB_SLIDE_INTERVAL_MS = 2000
const LOCKED_MEDIA_STYLE = { filter: 'blur(3px)', transform: 'scale(1.06)' }

export default function RecentStoriesRow() {
  const { t } = useTranslation()
  const [stories, setStories] = useState(null)
  const [slideTick, setSlideTick] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get('/storylines/recent?limit=5')
      .then(({ storylines }) => setStories(storylines || []))
      .catch(() => setStories([]))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSlideTick((tick) => tick + 1), THUMB_SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // 로딩 중에는 깜빡임 방지 — 비어있는 게 확정된 후에만 빈 상태 메시지 표시
  if (stories === null) return null

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-gray-200">
            {t('home.recentStories')}
          </h2>
          <span
            className="px-1.5 py-[1px] bg-red-500 text-white text-[9px] font-bold rounded-md leading-none"
            style={{ letterSpacing: '0.03em' }}
          >
            NEW
          </span>
        </div>
      </div>

      {stories.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center">
          {t('home.noStories')}
        </p>
      ) : (
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {stories.map((s) => {
          const locked = !!s.locked
          const media = Array.isArray(s.premiumMedia) ? s.premiumMedia : []
          const isMulti = media.length > 1
          const activeIdx = isMulti ? slideTick % media.length : 0
          const fallbackThumb = s.thumbnailImage

          return (
            <button
              key={s.id}
              onClick={() =>
                navigate(s.scenarioId ? `/scenarios/${s.scenarioId}` : `/storylines/${s.id}`)
              }
              className="flex flex-col items-center gap-1.5 flex-shrink-0 w-20"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-800">
                    {media.length > 0 ? (
                      media.map((m, idx) => {
                        const isActive = idx === activeIdx
                        const blur = !m.unlocked
                        const baseCls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`
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
                    ) : fallbackThumb ? (
                      <img
                        src={fallbackThumb}
                        alt={s.title || ''}
                        draggable={false}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={locked ? LOCKED_MEDIA_STYLE : undefined}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-lg text-gray-500">
                        ?
                      </div>
                    )}

                    {locked && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-0.5 w-full px-0.5">
                {s.character && (
                  <div className="flex items-center gap-1 max-w-full">
                    {s.character.profileImage ? (
                      <img
                        src={s.character.profileImage}
                        alt=""
                        draggable={false}
                        className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-700"
                      />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-800 flex-shrink-0" />
                    )}
                    <span className="text-[11px] text-gray-200 truncate">
                      {s.character.name}
                    </span>
                  </div>
                )}
                <span className="text-[10px] text-gray-500 w-full text-center truncate leading-tight">
                  {s.title}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}
