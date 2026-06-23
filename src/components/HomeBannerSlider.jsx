import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const AUTO_INTERVAL_MS = 4000
const SWIPE_THRESHOLD_PX = 40

export default function HomeBannerSlider() {
  const [banners, setBanners] = useState([])
  const [index, setIndex] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef(null)
  const startXRef = useRef(0)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/banners').then(({ banners }) => setBanners(banners || [])).catch(() => {})
  }, [])

  // 자동 슬라이드 — 2장 이상일 때만, 드래그 중에는 일시정지
  useEffect(() => {
    if (banners.length < 2 || isDragging) return
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % banners.length)
    }, AUTO_INTERVAL_MS)
    return () => clearInterval(t)
  }, [banners.length, isDragging])

  if (banners.length === 0) return null

  const handleClick = (banner) => {
    if (!banner.linkUrl) return
    // 드래그 직후 클릭 무시
    if (Math.abs(dragOffset) > 5) return
    if (banner.linkUrl.startsWith('/')) {
      navigate(banner.linkUrl)
    } else {
      window.open(banner.linkUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const onPointerDown = (e) => {
    if (banners.length < 2) return
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
      setIndex((i) => (i - 1 + banners.length) % banners.length)
    } else if (offset < -SWIPE_THRESHOLD_PX) {
      setIndex((i) => (i + 1) % banners.length)
    }
  }

  const trackWidth = trackRef.current?.clientWidth || 0
  const translatePx = -index * trackWidth + dragOffset

  return (
    <div className="mb-3">
      <div
        ref={trackRef}
        className="relative w-full overflow-hidden rounded-xl bg-gray-900 select-none"
        style={{ aspectRatio: '16 / 9', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flex h-full"
          style={{
            width: `${banners.length * 100}%`,
            transform: `translateX(${translatePx}px)`,
            transition: isDragging ? 'none' : 'transform 300ms ease',
          }}
        >
          {banners.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => handleClick(b)}
              className="relative block flex-shrink-0 h-full"
              style={{
                width: `${100 / banners.length}%`,
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                cursor: b.linkUrl ? 'pointer' : 'default',
                background: 'transparent',
                border: 'none',
                padding: 0,
              }}
              aria-label={b.title || 'Banner'}
            >
              <img
                src={b.imageUrl}
                alt={b.title || ''}
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
              />
            </button>
          ))}
        </div>

        {banners.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-[1]">
            {banners.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
