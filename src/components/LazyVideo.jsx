import { useEffect, useRef, useState } from 'react'

// 뷰포트에 (근접하게) 들어왔을 때만 <video>를 마운트하여 자동 재생한다.
// 화면 밖으로 나가면 <video>를 언마운트하여 모바일의 하드웨어 디코더 슬롯을 해방한다.
// 포스터 <img>는 항상 깔아두기 때문에 swap 시 깜빡임이 없다.
//
// Props:
//  - src, poster: 영상/포스터 URL
//  - className: 사이즈를 정하는 wrapper className (예: "w-full h-full")
//  - objectPosition: "center" | "top" (기본 "center") — img/video object-position
//  - active: 명시적 제어. undefined면 IntersectionObserver, true/false면 그 값을 그대로 사용
//            (예: 슬라이더에서 현재 인덱스 슬라이드만 재생시키고 싶을 때)
//  - rootMargin: IntersectionObserver rootMargin (기본 "200px" — 스크롤 직전 미리 마운트)
//
// controlled(active 명시) 모드에선 비활성 슬라이드도 <video>를 항상 마운트해
// 첫 프레임을 그대로 보여준다 (#t=0.001 미디어 프래그먼트로 강제 디코드).
// 슬라이더처럼 항목 수가 적은 곳에서만 사용하기를 권장.
export default function LazyVideo({
  src,
  poster,
  className = '',
  objectPosition = 'center',
  active,
  rootMargin = '200px',
}) {
  const wrapperRef = useRef(null)
  const videoRef = useRef(null)
  const [inView, setInView] = useState(false)
  const controlled = active !== undefined

  useEffect(() => {
    if (controlled) return
    const el = wrapperRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [controlled, rootMargin])

  const shouldPlay = controlled ? active : inView
  // controlled: 모든 슬라이드의 <video>를 항상 마운트(첫 프레임 노출용).
  // uncontrolled: 화면에 들어왔을 때만 마운트(디코더 슬롯 절약).
  const mountVideo = !!src && (controlled || inView)
  const objectCls = objectPosition === 'top' ? 'object-cover object-top' : 'object-cover'

  // 메타데이터만 로드해도 #t=0.001 프래그먼트가 첫 프레임을 강제 디코드/표시한다.
  const videoSrc = src ? (src.includes('#') ? src : `${src}#t=0.001`) : null

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (shouldPlay) {
      try { v.currentTime = 0 } catch {}
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [shouldPlay, videoSrc])

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden ${className}`}>
      {/* controlled 모드에선 프로필 이미지 폴백을 깔지 않는다 — 첫 프레임만 보이게 하기 위함. */}
      {poster && !controlled && (
        <img
          src={poster}
          alt=""
          aria-hidden
          draggable={false}
          className={`absolute inset-0 w-full h-full pointer-events-none ${objectCls}`}
        />
      )}
      {mountVideo && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          preload="auto"
          className={`absolute inset-0 w-full h-full pointer-events-none ${objectCls}`}
        />
      )}
    </div>
  )
}
