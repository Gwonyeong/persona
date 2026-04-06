import { useState, useRef, useEffect } from 'react'

/**
 * 슬라이드형 이미지 뷰어 (전체화면 오버레이)
 * @param {object} props
 * @param {Array<{filePath: string}>} props.images - 이미지 배열
 * @param {number} [props.initialIndex=0] - 시작 인덱스
 * @param {string} [props.title] - 콘텐츠 제목
 * @param {string} [props.description] - 콘텐츠 설명
 * @param {() => void} props.onClose
 */
export default function ImageSlideViewer({ images, initialIndex = 0, title, description, onClose }) {
  const [current, setCurrent] = useState(initialIndex)
  const touchRef = useRef({ startX: 0, startY: 0, dx: 0 })
  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)

  useEffect(() => {
    setCurrent(initialIndex)
  }, [initialIndex])

  const go = (dir) => {
    setCurrent((prev) => Math.max(0, Math.min(images.length - 1, prev + dir)))
  }

  const onTouchStart = (e) => {
    touchRef.current.startX = e.touches[0].clientX
    touchRef.current.startY = e.touches[0].clientY
    touchRef.current.dx = 0
    setSwiping(true)
  }

  const onTouchMove = (e) => {
    if (!swiping) return
    const dx = e.touches[0].clientX - touchRef.current.startX
    const dy = e.touches[0].clientY - touchRef.current.startY
    if (Math.abs(dy) > Math.abs(dx)) return
    touchRef.current.dx = dx
    setOffsetX(dx)
  }

  const onTouchEnd = () => {
    setSwiping(false)
    const threshold = 60
    if (touchRef.current.dx < -threshold) go(1)
    else if (touchRef.current.dx > threshold) go(-1)
    setOffsetX(0)
  }

  const img = images[current]
  if (!img) return null

  return (
    <div
      className="absolute inset-0 z-[60] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-2" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white p-1"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {images.length > 1 && (
          <span className="text-sm text-white/60">{current + 1} / {images.length}</span>
        )}
        <div className="w-8" />
      </div>

      {/* 이미지 영역 */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 좌측 화살표 */}
        {images.length > 1 && current > 0 && (
          <button
            onClick={() => go(-1)}
            className="absolute left-2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        <img
          src={img.filePath}
          alt=""
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          style={{
            transform: `translateX(${offsetX}px)`,
            transition: swiping ? 'none' : 'transform 0.25s ease-out',
          }}
          draggable={false}
        />

        {/* 우측 화살표 */}
        {images.length > 1 && current < images.length - 1 && (
          <button
            onClick={() => go(1)}
            className="absolute right-2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* 인디케이터 + 제목/설명 */}
      <div className="flex-shrink-0 px-4 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
        {/* 도트 인디케이터 */}
        {images.length > 1 && (
          <div className="flex justify-center gap-1.5 mb-3">
            {images.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/30'}`}
              />
            ))}
          </div>
        )}

        {/* 제목/설명 */}
        {(title || description) && (
          <div className="text-center">
            {title && <p className="text-white font-semibold text-base">{title}</p>}
            {description && <p className="text-white/60 text-sm mt-1 leading-relaxed">{description}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
