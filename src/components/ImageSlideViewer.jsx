import { useState, useRef, useEffect, useLayoutEffect } from 'react'

/**
 * 슬라이드형 미디어 뷰어 (전체화면 오버레이)
 * - 이미지/비디오 혼합 지원 (item.type='VIDEO'면 video, 그 외 img)
 * - 비디오: muted + autoplay + loop + playsInline (현재 인덱스만 재생)
 * - 이미지 탭으로 컨트롤(헤더/푸터/액션 버튼) 표시·숨김 토글
 * @param {object} props
 * @param {Array<{filePath: string, type?: 'IMAGE'|'VIDEO'}>} props.images - 미디어 배열
 * @param {number} [props.initialIndex=0] - 시작 인덱스
 * @param {string} [props.title] - 콘텐츠 제목
 * @param {string} [props.description] - 콘텐츠 설명
 * @param {Array<{key: string, label: string, icon?: JSX.Element, onClick: (item, index) => void}>} [props.actions]
 *   - 컨트롤이 열렸을 때 푸터에 노출되는 액션 버튼. onClick은 현재 아이템/인덱스 받음.
 * @param {() => void} props.onClose
 */
export default function ImageSlideViewer({ images, initialIndex = 0, title, description, actions, onClose }) {
  const [current, setCurrent] = useState(initialIndex)
  const touchRef = useRef({ startX: 0, startY: 0, dx: 0 })
  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [fillMode, setFillMode] = useState(false) // false=contain(여백), true=cover(꽉 채움)
  const containerRef = useRef(null)
  const videoRefs = useRef({})
  // 컨테이너 너비를 첫 렌더부터 정확히 — #root max-width:480px에 맞춰 추정값으로 초기화.
  // 첫 paint부터 올바른 trackOffset이 적용돼 "1번 → 클릭한 번호"로 슬라이드 되던 문제 차단.
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window === 'undefined') return 480
    return Math.min(window.innerWidth, 480)
  })

  useLayoutEffect(() => {
    // 추정값이 정확하면 setState bail-out으로 재렌더 없음. 다르면 즉시 정정(paint 전 동기 처리).
    if (containerRef.current) {
      const actual = containerRef.current.offsetWidth
      if (actual && actual !== containerWidth) setContainerWidth(actual)
    }
    const handleResize = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setCurrent(initialIndex)
  }, [initialIndex])

  // 인접 이미지 프리로드 (현재 기준 앞뒤 2장, 비디오는 스킵)
  useEffect(() => {
    const preloadRange = 2
    for (let i = current - preloadRange; i <= current + preloadRange; i++) {
      if (i >= 0 && i < images.length && i !== current && images[i].type !== 'VIDEO') {
        const img = new Image()
        img.src = images[i].filePath
      }
    }
  }, [current, images])

  // 비디오 재생 제어: 현재 인덱스만 재생, 나머지는 일시정지하고 처음으로 되돌림
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([idx, v]) => {
      if (!v) return
      if (parseInt(idx) === current) {
        v.play().catch(() => {})
      } else {
        v.pause()
        try { v.currentTime = 0 } catch {}
      }
    })
  }, [current])

  const go = (dir) => {
    setCurrent((prev) => Math.max(0, Math.min(images.length - 1, prev + dir)))
  }

  const onTouchStart = (e) => {
    touchRef.current.startX = e.touches[0].clientX
    touchRef.current.startY = e.touches[0].clientY
    touchRef.current.dx = 0
    touchRef.current.locked = false
    setSwiping(true)
  }

  const onTouchMove = (e) => {
    if (!swiping) return
    const dx = e.touches[0].clientX - touchRef.current.startX
    const dy = e.touches[0].clientY - touchRef.current.startY
    // 첫 움직임에서 세로 스크롤이면 스와이프 무시
    if (!touchRef.current.locked) {
      if (Math.abs(dy) > Math.abs(dx)) {
        setSwiping(false)
        return
      }
      touchRef.current.locked = true
    }
    touchRef.current.dx = dx
    setOffsetX(dx)
  }

  const onTouchEnd = () => {
    setSwiping(false)
    const threshold = 60
    if (touchRef.current.dx < -threshold) go(1)
    else if (touchRef.current.dx > threshold) go(-1)
    setOffsetX(0)
    // 일정 이상 드래그하면 직후 click(토글) 이벤트는 무시
    touchRef.current.justDragged = Math.abs(touchRef.current.dx) > 5
  }

  const handleImageAreaClick = (e) => {
    e.stopPropagation()
    if (touchRef.current.justDragged) {
      touchRef.current.justDragged = false
      return
    }
    setControlsVisible((v) => !v)
  }

  const img = images[current]
  if (!img) return null

  // 컨테이너 너비 기반 슬라이드 오프셋 계산 (state 기반 — useLayoutEffect로 paint 전에 측정됨)
  const trackOffset = -current * containerWidth + offsetX

  return (
    <div
      className="absolute inset-0 z-[60] bg-black/95 flex flex-col"
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      {/* 헤더 — fill 모드에선 이미지 위로 띄움 */}
      <div
        className={`${fillMode ? 'absolute top-0 left-0 right-0 z-10' : 'flex-shrink-0'} flex items-center justify-between px-4 pt-3 pb-2 transition-opacity duration-200`}
        style={{
          paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          ...(fillMode && { background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }),
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
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
        {/* 이미지 fit 모드 토글 (off=가로 맞춤, on=꽉 채움) */}
        <button
          onClick={(e) => { e.stopPropagation(); setFillMode((v) => !v) }}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            fillMode ? 'bg-white text-black' : 'bg-white/15 text-white hover:bg-white/25'
          }`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label="이미지 비율 전환"
          aria-pressed={fillMode}
        >
          {fillMode ? (
            // ON 상태: 꽉 채움 — 안쪽으로 향하는 모서리 화살표
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            // OFF 상태: 가로 맞춤 — 바깥으로 향하는 모서리 화살표
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
      </div>

      {/* 이미지 영역 — 클릭 시 컨트롤 표시·숨김 토글 (스와이프와 구분)
          fill 모드에선 헤더/푸터까지 덮도록 absolute로 화면을 전부 채움 */}
      <div
        ref={containerRef}
        className={`${fillMode ? 'absolute inset-0' : 'flex-1'} overflow-hidden relative`}
        onClick={handleImageAreaClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 이미지 트랙: 모든 이미지를 가로로 배치, translateX로 슬라이드 */}
        <div
          className="flex h-full"
          style={{
            transform: `translateX(${trackOffset}px)`,
            transition: swiping ? 'none' : 'transform 0.25s ease-out',
          }}
        >
          {images.map((image, i) => {
            const isVideo = image.type === 'VIDEO'
            const mediaClassName = `select-none ${
              fillMode
                ? 'block w-full h-full object-cover'
                : 'max-w-full max-h-full object-contain rounded-lg'
            }`
            return (
              <div
                key={i}
                className={`flex-shrink-0 h-full ${fillMode ? '' : 'flex items-center justify-center'}`}
                style={{ width: containerWidth || '100%' }}
              >
                {isVideo ? (
                  <video
                    ref={(el) => { videoRefs.current[i] = el }}
                    src={image.filePath}
                    className={mediaClassName}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={image.filePath}
                    alt=""
                    className={mediaClassName}
                    draggable={false}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* 좌측 화살표 */}
        {images.length > 1 && current > 0 && controlsVisible && (
          <button
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* 우측 화살표 */}
        {images.length > 1 && current < images.length - 1 && controlsVisible && (
          <button
            onClick={(e) => { e.stopPropagation(); go(1) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* 인디케이터 + 제목/설명 + 액션 버튼 — fill 모드에선 이미지 위로 띄움 */}
      <div
        className={`${fillMode ? 'absolute bottom-0 left-0 right-0 z-10' : 'flex-shrink-0'} px-4 pb-4 transition-opacity duration-200`}
        style={{
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          ...(fillMode && { background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)', paddingTop: '2rem' }),
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
          <div className="text-center mb-3">
            {title && <p className="text-white font-semibold text-base">{title}</p>}
            {description && <p className="text-white/60 text-sm mt-1 leading-relaxed">{description}</p>}
          </div>
        )}

        {/* 액션 버튼 */}
        {actions && actions.length > 0 && (
          <div className="flex justify-center gap-2">
            {actions.map((a) => (
              <button
                key={a.key}
                onClick={(e) => { e.stopPropagation(); a.onClick(images[current], current) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
