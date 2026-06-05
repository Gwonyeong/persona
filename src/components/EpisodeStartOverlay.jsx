// V2 채팅 — 에피소드 시작 시 풀화면 딤드 오버레이.
// 사용자가 "진행하기" 버튼을 1초간 hold하면 사라진다 (단순 클릭으로는 안 닫힘).
// hold 진행도는 버튼 원형 진행바로 시각화.
//
// 부모 컨테이너(#root max-width 480px)에 absolute로 배치 — viewport 전체를 차지하지 않음.
import { useEffect, useRef, useState } from 'react'

const HOLD_MS = 1000

export default function EpisodeStartOverlay({ episode, onDismiss }) {
  const [progress, setProgress] = useState(0)
  const [mounted, setMounted] = useState(false)
  const startTimeRef = useRef(null)
  const rafRef = useRef(null)
  const dismissedRef = useRef(false)

  // 새 에피소드 들어올 때 진행도 리셋 + 등장 애니메이션 트리거
  useEffect(() => {
    if (!episode) return
    dismissedRef.current = false
    setProgress(0)
    // 다음 프레임에 mounted=true → 페이드/스케일 트리거
    const id = requestAnimationFrame(() => setMounted(true))
    return () => {
      cancelAnimationFrame(id)
      setMounted(false)
    }
  }, [episode?.id])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  function startHold(e) {
    e.preventDefault()
    if (dismissedRef.current) return
    startTimeRef.current = performance.now()
    const tick = (now) => {
      const elapsed = now - (startTimeRef.current || now)
      const p = Math.min(1, elapsed / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        dismissedRef.current = true
        cancelHold()
        onDismiss?.()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    startTimeRef.current = null
  }

  function endHold() {
    cancelHold()
    if (!dismissedRef.current) setProgress(0)
  }

  if (!episode) return null

  const snap = episode.snapshot || {}
  const title = snap.title || '에피소드 시작'
  const successCondition = snap.endsWhen || ''

  // 원형 진행바 (SVG)
  const R = 26
  const C = 2 * Math.PI * R

  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-6 select-none"
      style={{
        background: `rgba(0, 0, 0, ${0.78 * (mounted ? 1 : 0)})`,
        backdropFilter: mounted ? 'blur(6px)' : 'blur(0px)',
        WebkitBackdropFilter: mounted ? 'blur(6px)' : 'blur(0px)',
        transition: 'background 320ms ease-out, backdrop-filter 320ms ease-out',
      }}
    >
      <div
        className="flex flex-col items-center text-center max-w-sm"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.94)',
          transition: 'opacity 420ms ease-out, transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="text-5xl mb-4 leading-none">🎬</div>
        <p className="text-[11px] tracking-[0.3em] text-emerald-300/80 font-semibold mb-2">
          EPISODE START
        </p>
        <h2 className="text-xl font-bold text-white mb-5 leading-snug">
          {title}
        </h2>
        {successCondition && (
          <div className="w-full bg-emerald-500/8 border border-emerald-400/30 rounded-2xl px-4 py-3 mb-8">
            <p className="text-[10px] tracking-widest text-emerald-300/80 mb-1.5 font-medium">
              완료 조건
            </p>
            <p className="text-xs text-gray-100 leading-relaxed">
              {successCondition}
            </p>
          </div>
        )}

        {/* hold-to-dismiss 버튼 — 1초 누르고 있어야 사라짐 */}
        <button
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onContextMenu={(e) => e.preventDefault()}
          className="relative w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400/40 flex items-center justify-center shadow-lg hover:bg-emerald-500/25 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          {/* 진행바 — 원형 stroke offset */}
          <svg
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
            viewBox="0 0 60 60"
          >
            <circle
              cx="30"
              cy="30"
              r={R}
              fill="none"
              stroke="rgba(74, 222, 128, 0.95)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: progress > 0 ? 'none' : 'stroke-dashoffset 200ms ease-out' }}
            />
          </svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <p className="text-[11px] text-gray-400 mt-3">
          1초간 길게 눌러 진행하기
        </p>
      </div>
    </div>
  )
}
