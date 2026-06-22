import { useNavigate } from 'react-router-dom'
import LazyVideo from './LazyVideo'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function isVideoUrl(url) {
  return !!url && /\.(mp4|webm)(\?|$)/i.test(url)
}

export default function CharacterCard({ character, reducedData }) {
  const navigate = useNavigate()
  const c = character

  const thumb = c.styles?.[0]?.images?.[0]
  // 2/3 그리드는 homeImage(영상 가능) 전용. homeImageSquare는 1:1 슬라이더 전용이라 여기선 안 씀.
  const homeMedia = reducedData ? null : c.homeImage
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
        {thumbUrl ? (
          isVideo ? (
            <LazyVideo
              src={thumbUrl}
              poster={posterUrl}
              className="w-full h-full"
            />
          ) : (
            <img src={thumbUrl} alt={c.name} className="w-full h-full object-cover" />
          )
        ) : (
          <span className="text-4xl text-gray-600">?</span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-14">
        <p className="font-semibold text-sm truncate text-white">{c.name}</p>
        {c.description && (
          <p className="mt-1 text-[11px] text-gray-300 leading-snug line-clamp-2">
            {c.description}
          </p>
        )}
      </div>
    </button>
  )
}
