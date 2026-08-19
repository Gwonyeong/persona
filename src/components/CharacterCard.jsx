import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import LazyVideo from './LazyVideo'
import { useTagCategories } from '../lib/useTagCategories'
import { resizedImageUrl, IMG_W } from '../lib/imageUrl'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function isVideoUrl(url) {
  return !!url && /\.(mp4|webm)(\?|$)/i.test(url)
}

// compact: 3열 축소 카드용 변형. 국기·보이스 아이콘 숨기고,
// 이름·이미지/영상 카운트를 오버레이가 아닌 카드 이미지 "아래(바깥)"에 배치.
export default function CharacterCard({ character, reducedData, safetyMode, compact = false }) {
  const navigate = useNavigate()
  const c = character

  // 태그 라벨(값→표시명) 조회. compact 카드에서 분위기·성격 칩 표시에 사용.
  const categories = useTagCategories()
  const labelMap = useMemo(() => {
    const m = new Map()
    for (const cat of categories) for (const o of cat.options) m.set(o.value, o.label)
    return m
  }, [categories])
  // 분위기·성격 태그 각 1개 랜덤 선택 (여러 개면). c.tags 갱신 시(=매 로드) 재추첨.
  const picked = useMemo(() => {
    const pick = (prefix) => {
      const opts = (c.tags || []).filter((t) => t.startsWith(prefix))
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null
    }
    return { mood: pick('mood:'), personality: pick('personality:') }
  }, [c.tags])

  const thumb = c.styles?.[0]?.images?.[0]
  // homeImage(영상 가능)는 SFW/NSFW 구분이 없어 safetyMode일 때 노출하지 않는다.
  // safetyMode(비로그인·미인증 포함)에서는 서버가 SFW로 보장한 homeImageSquare를 홈 미디어로 사용하고,
  // 그마저 없으면 profileImage로 폴백한다. safetyMode OFF(성인인증)에서는 기존대로 homeImage 사용.
  const homeMedia = reducedData
    ? null
    : safetyMode
      ? c.homeImageSquare
      : c.homeImage
  const thumbUrl =
    getImageUrl(homeMedia) ||
    getImageUrl(c.profileImage) ||
    getImageUrl(thumb?.filePath)
  const isVideo = isVideoUrl(thumbUrl)
  const posterUrl = isVideo
    ? getImageUrl(c.profileImage) || getImageUrl(thumb?.filePath)
    : null

  const flagTag = c.tags?.find((t) => t.startsWith('nationality:'))
  const flagCode = flagTag?.split(':')[1]

  // 이미지/영상 언락 카운트. compact 는 카드 아래, 기본은 하단 오버레이 안 이름 옆.
  const counts = (
    <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-[10px] font-semibold leading-tight tabular-nums">
      <span className="flex items-center gap-0.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span style={{ display: 'inline-block', width: '2ch', textAlign: 'right' }}>{c.imageUnlocked ?? 0}</span>
        <span>/</span>
        <span style={{ display: 'inline-block', width: '2ch', textAlign: 'right' }}>{c.imageTotal ?? 0}</span>
      </span>
      <span className="flex items-center gap-0.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
        </svg>
        <span style={{ display: 'inline-block', width: '2ch', textAlign: 'right' }}>{c.videoUnlocked ?? 0}</span>
        <span>/</span>
        <span style={{ display: 'inline-block', width: '2ch', textAlign: 'right' }}>{c.videoTotal ?? 0}</span>
      </span>
    </div>
  )

  // 카드 실폭은 2열 ≈225px / 3열 ≈150px. 레티나 감안해 약 2배 폭으로 변환해 받는다.
  // 영상 URL은 헬퍼가 그대로 통과시키므로 LazyVideo src는 원본 그대로다.
  const cardWidth = compact ? IMG_W.CARD_COMPACT : IMG_W.CARD

  const media = thumbUrl ? (
    isVideo ? (
      <LazyVideo src={thumbUrl} poster={resizedImageUrl(posterUrl, cardWidth)} className="w-full h-full" />
    ) : (
      <img src={resizedImageUrl(thumbUrl, cardWidth)} alt={c.name} className="w-full h-full object-cover" />
    )
  ) : (
    <span className="text-4xl text-gray-600">?</span>
  )

  // compact: 이미지 카드 + 아래 캡션(이름 + 카운트). 국기·보이스 없음.
  if (compact) {
    return (
      <button
        onClick={() => navigate(`/characters/${c.id}`)}
        className="block text-left w-full group"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center group-hover:ring-1 group-hover:ring-gray-700 transition-all">
          {media}
          {(c.description || labelMap.get(picked.mood) || labelMap.get(picked.personality)) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2 pt-8 pointer-events-none">
              {/* 카드 캡션은 concept(첫 대사 한 줄)이 아니라 description(한 줄 관계 요약)을 쓴다.
                  대사보다 "유저와 어떤 관계인지"가 먼저 읽혀야 해서 태그보다 위에 둔다. */}
              {c.description && (
                <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2 drop-shadow mb-1.5 break-keep break-words">
                  {c.description}
                </p>
              )}
              {(labelMap.get(picked.mood) || labelMap.get(picked.personality)) && (
                <div className="flex flex-wrap gap-1">
                  {[picked.mood, picked.personality].map(
                    (tg) =>
                      labelMap.get(tg) && (
                        <span
                          key={tg}
                          className="text-[9px] leading-none px-1.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm"
                        >
                          {labelMap.get(tg)}
                        </span>
                      ),
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex items-start gap-1.5 text-white">
          <p className="font-semibold text-xs truncate flex-1 min-w-0 leading-tight text-gray-300">{c.name}</p>
          {counts}
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={() => navigate(`/characters/${c.id}`)}
      className="relative rounded-xl overflow-hidden text-left hover:ring-1 hover:ring-gray-700 transition-all w-full"
      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
    >
      {flagCode && (
        <div className="absolute top-2 right-2 z-[1] w-6 h-6 rounded-full overflow-hidden shadow-lg ring-1 ring-black/20">
          <img
            src={`https://flagcdn.com/w80/${flagCode}.png`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {c.voiceId && (
        <div
          className="absolute top-2 left-2 z-[1] w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-emerald-400/60"
          style={{ boxShadow: '0 0 8px 2px rgba(16, 185, 129, 0.7), 0 0 16px 4px rgba(16, 185, 129, 0.35)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300" style={{ filter: 'drop-shadow(0 0 2px rgba(16, 185, 129, 0.9))' }}>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </div>
      )}
      <div className="aspect-[2/3] bg-gray-800 flex items-center justify-center">
        {media}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-14 text-white">
        <div className="flex items-start gap-2">
          <p className="font-semibold text-sm truncate flex-1 min-w-0">{c.name}</p>
          {counts}
        </div>
        {c.description && (
          <p className="mt-1 text-[11px] text-gray-300 leading-snug line-clamp-2">
            {c.description}
          </p>
        )}
      </div>
    </button>
  )
}
