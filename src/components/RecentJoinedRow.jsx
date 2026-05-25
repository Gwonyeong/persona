import { useNavigate } from 'react-router-dom'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function isVideoUrl(url) {
  return !!url && /\.(mp4|webm)(\?|$)/i.test(url)
}

// characters는 호출부에서 이미 정렬·슬라이스된 리스트 (Home이 책임짐).
export default function RecentJoinedRow({ characters, reducedData }) {
  const navigate = useNavigate()

  if (!characters?.length) return null

  return (
    <div className="mb-4">
      <h2 className="text-sm font-medium text-gray-400 mb-2">
        최근에 합류한 페소나들
      </h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {characters.map((c) => {
          const thumb = c.styles?.[0]?.images?.[0]
          const homeSquare = reducedData ? null : c.homeImageSquare
          const homeMedia = reducedData ? null : c.homeImage
          const thumbUrl =
            getImageUrl(homeSquare) ||
            getImageUrl(homeMedia) ||
            getImageUrl(c.profileImage) ||
            getImageUrl(thumb?.filePath)
          const isVideo = isVideoUrl(thumbUrl)
          const posterUrl = isVideo
            ? getImageUrl(c.profileImage) || getImageUrl(thumb?.filePath)
            : null

          return (
            <button
              key={c.id}
              onClick={() => navigate(`/characters/${c.id}`)}
              className="flex flex-col items-stretch flex-shrink-0 w-28 text-left"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-gray-800">
                {thumbUrl ? (
                  isVideo ? (
                    <video
                      src={thumbUrl}
                      poster={posterUrl || undefined}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <img
                      src={thumbUrl}
                      alt={c.name}
                      draggable={false}
                      className="w-full h-full object-cover object-top"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-gray-600">
                    ?
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-200 truncate">{c.name}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
