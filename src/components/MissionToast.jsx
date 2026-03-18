import { useEffect, useState } from 'react'

export default function MissionToast({ missions, onDone }) {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!missions?.length) return
    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        if (current + 1 < missions.length) {
          setCurrent((c) => c + 1)
          setVisible(true)
        } else {
          onDone?.()
        }
      }, 300)
    }, 3000)
    return () => clearTimeout(timer)
  }, [current, missions])

  if (!missions?.length) return null

  const mission = missions[current]

  return (
    <div
      className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <div className="bg-gray-900 border border-indigo-500/50 rounded-xl px-5 py-3 shadow-lg shadow-indigo-500/10 flex items-center gap-3 min-w-[260px]">
        <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-indigo-400 font-medium">미션 달성!</p>
          <p className="text-sm text-white truncate">{mission.title}</p>
        </div>
        {mission.rewardAffinity > 0 && (
          <div className="flex items-center gap-1 ml-auto pl-3 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-pink-400">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-sm font-bold text-pink-400">+{mission.rewardAffinity}</span>
          </div>
        )}
      </div>
    </div>
  )
}
