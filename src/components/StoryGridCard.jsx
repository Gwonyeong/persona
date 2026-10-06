import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resizedImageUrl, IMG_W } from '../lib/imageUrl'

// 스토리 썸네일 카드 (9:16) — 홈 그리드와 전체보기 페이지가 공유.
// 데이터는 /storylines (목록) 또는 /storylines/recent 응답 아이템.
const LOCKED_STYLE = { filter: 'blur(3px)', transform: 'scale(1.06)' }

// 어드민이 아직 교체하지 않은 자리표시자('PLACEHOLDER:...')는 URL 이 아니다 — 서버도 거르지만 한 번 더
export function usableUrl(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null
}

export default function StoryGridCard({ story: s }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const locked = !!s.locked
  const thumb = usableUrl(s.thumbnailImage) || usableUrl(s.character?.profileImage)
  const progress = s.progress // 'COMPLETED' | 'IN_PROGRESS' | null | undefined
  const target = s.scenarioId ? `/scenarios/${s.scenarioId}` : `/storylines/${s.id}`

  // 잠금(=비로그인)이면 플레이어의 403 왕복 없이 바로 로그인으로. 로그인 후 원래 목적지로 복귀.
  const handleClick = () => {
    if (locked) navigate(`/login?returnTo=${encodeURIComponent(target)}`)
    else navigate(target)
  }

  return (
    <button
      onClick={handleClick}
      className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 border border-gray-800 active:border-indigo-500 transition-colors text-left"
      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      aria-label={s.title || ''}
    >
      {thumb ? (
        <img
          src={resizedImageUrl(thumb, IMG_W.CARD)}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={locked ? LOCKED_STYLE : undefined}
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-purple-900/40" />
      )}

      {/* 상단 뱃지 — 진행 상태 / TEST */}
      {(progress || s.status === 'TEST') && (
        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center gap-1">
          {progress === 'COMPLETED' && (
            <span className="px-1.5 py-0.5 bg-emerald-600/90 text-white text-[9px] rounded-full font-semibold">{t('scenario.completed')}</span>
          )}
          {progress === 'IN_PROGRESS' && (
            <span className="px-1.5 py-0.5 bg-indigo-600/90 text-white text-[9px] rounded-full font-semibold">{t('scenario.inProgress')}</span>
          )}
          {s.status === 'TEST' && (
            <span className="ml-auto px-1.5 py-0.5 bg-amber-600/90 text-white text-[9px] rounded-full font-semibold">TEST</span>
          )}
        </div>
      )}

      {/* 잠금 (미로그인) */}
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
            {usableUrl(s.character.profileImage) ? (
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
}
