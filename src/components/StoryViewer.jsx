import { useState, useEffect, useRef, useCallback } from 'react'

export default function StoryViewer({ stories, character, profileUrl, currentIndex, onIndexChange, onClose }) {
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const STORY_DURATION = 5000

  const startTimer = useCallback(() => {
    const startTime = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(elapsed / STORY_DURATION, 1)
      setProgress(pct)
      if (pct < 1) {
        timerRef.current = requestAnimationFrame(tick)
      } else {
        if (currentIndex < stories.length - 1) {
          onIndexChange(currentIndex + 1)
        } else {
          onClose()
        }
      }
    }
    timerRef.current = requestAnimationFrame(tick)
  }, [currentIndex, stories.length, onIndexChange, onClose])

  useEffect(() => {
    setProgress(0)
    startTimer()
    return () => { if (timerRef.current) cancelAnimationFrame(timerRef.current) }
  }, [currentIndex, startTimer])

  const handleTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 3) {
      if (currentIndex > 0) onIndexChange(currentIndex - 1)
    } else {
      if (currentIndex < stories.length - 1) {
        onIndexChange(currentIndex + 1)
      } else {
        onClose()
      }
    }
  }

  const story = stories[currentIndex]
  const imageUrl = story?.filePath?.startsWith('http') ? story.filePath : null

  return (
    <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-black z-[60] flex flex-col">
      {/* 프로그레스 바 */}
      <div className="flex gap-1 px-2 pt-2 pb-1">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[2px] bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width: i < currentIndex ? '100%' : i === currentIndex ? `${progress * 100}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* 헤더 */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
          {profileUrl ? (
            <img src={profileUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">?</div>
          )}
        </div>
        <span className="text-white text-sm font-semibold flex-1">{character.name}</span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 이미지 */}
      <div className="flex-1 relative" onClick={handleTap}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">이미지 없음</div>
        )}

        {story?.caption && (
          <div className="absolute bottom-6 left-0 right-0 text-center px-6">
            <p className="text-white text-sm bg-black/40 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
              {story.caption}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
