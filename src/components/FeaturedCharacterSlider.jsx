import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const AUTO_INTERVAL_MS = 5000
const SWIPE_THRESHOLD_PX = 40

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function isVideoUrl(url) {
  return !!url && /\.(mp4|webm)(\?|$)/i.test(url)
}

// characters는 호출부에서 이미 선정·정렬된 리스트.
export default function FeaturedCharacterSlider({ characters, reducedData }) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef(null)
  const startXRef = useRef(0)

  const featured = characters || []

  useEffect(() => {
    if (featured.length < 2 || isDragging) return
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % featured.length)
    }, AUTO_INTERVAL_MS)
    return () => clearInterval(t)
  }, [featured.length, isDragging])

  useEffect(() => {
    if (index >= featured.length) setIndex(0)
  }, [featured.length, index])

  if (featured.length === 0) return null

  const onPointerDown = (e) => {
    if (featured.length < 2) return
    setIsDragging(true)
    startXRef.current = e.clientX
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!isDragging) return
    setDragOffset(e.clientX - startXRef.current)
  }

  const onPointerUp = () => {
    if (!isDragging) return
    const offset = dragOffset
    setIsDragging(false)
    setDragOffset(0)
    if (offset > SWIPE_THRESHOLD_PX) {
      setIndex((i) => (i - 1 + featured.length) % featured.length)
    } else if (offset < -SWIPE_THRESHOLD_PX) {
      setIndex((i) => (i + 1) % featured.length)
    }
  }

  const handleClick = (c) => {
    if (Math.abs(dragOffset) > 5) return
    navigate(`/characters/${c.id}`)
  }

  const trackWidth = trackRef.current?.clientWidth || 0
  const translatePx = -index * trackWidth + dragOffset

  return (
    <div className="mb-4">
      <div
        ref={trackRef}
        className="relative w-full overflow-hidden rounded-2xl bg-gray-900 select-none"
        style={{ aspectRatio: '1 / 1', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flex h-full"
          style={{
            width: `${featured.length * 100}%`,
            transform: `translateX(${translatePx}px)`,
            transition: isDragging ? 'none' : 'transform 300ms ease',
          }}
        >
          {featured.map((c) => {
            const thumb = c.styles?.[0]?.images?.[0]
            // 1:1 슬라이더는 homeImageSquare(정사각형 전용) 우선,
            // 미설정 시 homeImage(기존 2/3) → profileImage → 첫 스프라이트로 폴백.
            // NSFW 게이팅은 서버에서 처리됨 — 이 URL은 이미 효과적인(SFW/NSFW) 이미지.
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
                type="button"
                onClick={() => handleClick(c)}
                className="relative block flex-shrink-0 h-full text-left"
                style={{
                  width: `${100 / featured.length}%`,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                }}
                aria-label={c.name}
              >
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
                      className="w-full h-full object-cover object-top pointer-events-none"
                    />
                  ) : (
                    <img
                      src={thumbUrl}
                      alt={c.name}
                      draggable={false}
                      className="w-full h-full object-cover object-top pointer-events-none"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl text-gray-600">
                    ?
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 pt-28 pointer-events-none">
                  <p className="text-lg font-bold text-white drop-shadow">{c.name}</p>
                  {c.concept && (
                    <p className="mt-1 text-xs text-gray-400 leading-snug line-clamp-2 drop-shadow">
                      {c.concept}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {featured.length > 1 && (
          <div className="absolute bottom-3 right-3 z-[1] px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-[11px] font-medium text-white/90 tabular-nums">
            {index + 1} / {featured.length}
          </div>
        )}
      </div>
    </div>
  )
}
