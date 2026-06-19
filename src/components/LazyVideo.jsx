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
export default function LazyVideo({
  src,
  poster,
  className = '',
  objectPosition = 'center',
  active,
  rootMargin = '200px',
}) {
  const wrapperRef = useRef(null)
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
  const objectCls = objectPosition === 'top' ? 'object-cover object-top' : 'object-cover'

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden ${className}`}>
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden
          draggable={false}
          className={`absolute inset-0 w-full h-full pointer-events-none ${objectCls}`}
        />
      )}
      {shouldPlay && src && (
        <video
          src={src}
          poster={poster || undefined}
          autoPlay
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
