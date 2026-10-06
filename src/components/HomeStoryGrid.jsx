import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { resizedImageUrl, IMG_W } from '../lib/imageUrl'

// 홈 — 최근 공개 스토리 썸네일 그리드 (한 줄 3개, 9:16 카드).
// 데이터는 /storylines/recent (완료한 스토리 제외, publishedAt 최신순). 썸네일은 서버가
// thumbnailImage → coverImage → 캐릭터 프로필 순으로 폴백해서 내려준다.
// 카드 디자인은 CharacterDetail 의 스토리 카드(9:16 + 하단 그라데이션 제목)를 3열 크기로 줄인 것.
const LIMIT = 6
const LOCKED_STYLE = { filter: 'blur(3px)', transform: 'scale(1.06)' }

export default function HomeStoryGrid() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [stories, setStories] = useState(null)

  // 스토리 번역 데이터가 채워지기 전까지는 한국어 UI 에서만 노출 (CharacterDetail 과 같은 게이트).
  // 어드민 번역 탭으로 공개 스토리 번역이 끝나면 이 조건을 제거한다.
  const isKoreanUi = (i18n.language || '').startsWith('ko')

  useEffect(() => {
    if (!isKoreanUi) return
    api
      .get(`/storylines/recent?limit=${LIMIT}`)
      .then(({ storylines }) => setStories(storylines || []))
      .catch(() => setStories([]))
  }, [isKoreanUi])

  if (!isKoreanUi || !stories || stories.length === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <h2 className="text-lg font-bold text-white">{t('home.recentStories')}</h2>
        <span
          className="px-1.5 py-[1px] bg-red-500 text-white text-[9px] font-bold rounded-md leading-none"
          style={{ letterSpacing: '0.03em' }}
        >
          NEW
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stories.map((s) => {
          const locked = !!s.locked
          return (
            <button
              key={s.id}
              onClick={() => navigate(s.scenarioId ? `/scenarios/${s.scenarioId}` : `/storylines/${s.id}`)}
              className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 border border-gray-800 active:border-indigo-500 transition-colors text-left"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label={s.title || ''}
            >
              {s.thumbnailImage ? (
                <img
                  src={resizedImageUrl(s.thumbnailImage, IMG_W.CARD)}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={locked ? LOCKED_STYLE : undefined}
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-purple-900/40" />
              )}

              {/* 잠금 (미로그인 / FREE 티어) */}
              {locked && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>
              )}

              {/* 하단 — 캐릭터 + 제목 */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2 pt-8 pb-2">
                {s.character && (
                  <div className="flex items-center gap-1 mb-0.5 min-w-0">
                    {s.character.profileImage ? (
                      <img
                        src={resizedImageUrl(s.character.profileImage, IMG_W.AVATAR_TINY)}
                        alt=""
                        draggable={false}
                        className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20"
                      />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-700 flex-shrink-0" />
                    )}
                    <span className="text-[10px] text-gray-300 truncate">{s.character.name}</span>
                  </div>
                )}
                <p className="text-[11px] font-semibold text-white leading-snug line-clamp-2">{s.title}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
