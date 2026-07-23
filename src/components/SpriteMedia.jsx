import { useEffect, useState, useRef } from 'react'

// sprite URL이 비디오인지 판별. Supabase 업로드 시 원본 확장자가 보존됨 (sprites/.../EMOTION_uid.mp4).
export function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const clean = url.split('?')[0].toLowerCase()
  return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v')
}

// 비디오면 <video>, 이미지면 <img>. sprite는 음소거 자동재생/루프.
// 비율 무관하게 하단 정렬 (object-bottom) — 1:1 이미지 등도 9:16 프레임 하단에 붙어 출력됨.
export function SpriteMedia({ src, className = '' }) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return <img src={src} alt="" className={className} loading="lazy" />
}

// CallSheet 패턴 — 두 슬롯(A, B)에 이전/현재 URL을 번갈아 두고 opacity 토글로 크로스페이드.
// `src` 변경 시 inactive 슬롯에 새 URL을 넣고 active 토글 → 옛 슬롯은 1→0, 새 슬롯은 0→1.
// variant: 'img' (정적 img) | 'sprite' (video URL 처리 포함)
export function CrossfadeMedia({ src, className = '', style, fadeMs = 500, variant = 'img' }) {
  const [layers, setLayers] = useState({ A: null, B: null })
  const [activeSlot, setActiveSlot] = useState('A')
  const lastSrcRef = useRef(null)

  useEffect(() => {
    if (!src) return
    if (lastSrcRef.current === src) return
    lastSrcRef.current = src
    setActiveSlot((prev) => {
      const next = prev === 'A' ? 'B' : 'A'
      setLayers((prevLayers) => ({ ...prevLayers, [next]: src }))
      return next
    })
  }, [src])

  const renderSlot = (slot) => {
    const url = layers[slot]
    const slotStyle = {
      ...style,
      opacity: url && activeSlot === slot ? 1 : 0,
      transition: `opacity ${fadeMs}ms ease-in-out`,
      visibility: url ? 'visible' : 'hidden',
    }
    if (!url) {
      return <div key={slot} className={className} style={slotStyle} aria-hidden="true" />
    }
    if (variant === 'sprite' && isVideoUrl(url)) {
      return (
        <video
          key={slot}
          src={url}
          className={className}
          style={slotStyle}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )
    }
    return (
      <img
        key={slot}
        src={url}
        alt=""
        className={className}
        style={slotStyle}
        loading="lazy"
        draggable={false}
        aria-hidden="true"
      />
    )
  }

  return (
    <>
      {renderSlot('A')}
      {renderSlot('B')}
    </>
  )
}
