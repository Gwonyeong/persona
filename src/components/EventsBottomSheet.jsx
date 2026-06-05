// V2 채팅 — 이벤트(에피소드) 리스트 바텀시트.
// 데이터: ChatV2가 episodes 배열을 prop으로 전달 (서버 buildEpisodesView 결과).
// 항목 status:
//   - 'active'     : 보더 초록 깜빡임 + title + 진행도 + 성공 조건(endsWhen) 노출
//   - 'completed'  : 회색, title + 체크
//   - 'pending'    : ??? (스포일러 방지 — title/내용 미노출)
import { useEffect, useState } from 'react'

export default function EventsBottomSheet({ open, episodes = [], onClose }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => {})
      return () => cancelAnimationFrame(id)
    }
    const t = setTimeout(() => setMounted(false), 200)
    return () => clearTimeout(t)
  }, [open])

  if (!open && !mounted) return null

  const sorted = [...episodes].sort((a, b) => {
    // 활성 → 미시작 → 완료 순
    const order = { active: 0, pending: 1, completed: 2 }
    return (order[a.status] ?? 99) - (order[b.status] ?? 99)
  })

  const activeCount = episodes.filter((e) => e.status === 'active').length
  const pendingCount = episodes.filter((e) => e.status === 'pending').length
  const completedCount = episodes.filter((e) => e.status === 'completed').length

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/50"
      onClick={onClose}
      style={{ opacity: open ? 1 : 0, transition: 'opacity 200ms ease-out' }}
    >
      <div
        className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl flex flex-col"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: '78vh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 200ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 핸들 + 헤더 */}
        <div className="flex flex-col items-center pt-2.5 pb-3 border-b border-gray-800">
          <div className="w-10 h-1 rounded-full bg-gray-700 mb-2" />
          <h3 className="text-white text-base font-semibold">이벤트</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            진행중 {activeCount} · 미진행 {pendingCount} · 완료 {completedCount}
          </p>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {sorted.length === 0 && (
            <p className="text-center text-xs text-gray-500 py-8">아직 등록된 이벤트가 없어요.</p>
          )}
          {sorted.map((ep) => {
            if (ep.status === 'active') return <ActiveCard key={ep.id} ep={ep} />
            if (ep.status === 'completed') return <CompletedCard key={ep.id} ep={ep} />
            return <PendingCard key={ep.id} ep={ep} />
          })}
        </div>
      </div>
    </div>
  )
}

function ActiveCard({ ep }) {
  const progress = ep.duration ? `${(ep.turnsElapsed ?? 0) + 1}/${ep.duration}턴` : null
  return (
    <div
      className="episode-active-border bg-emerald-500/10 border-2 rounded-2xl p-4"
      style={{ borderColor: 'rgba(74, 222, 128, 0.95)' }}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <span className="text-xl leading-none mt-0.5">🎬</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{ep.title}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-100 font-medium">
              진행중
            </span>
            {progress && (
              <span className="text-[10px] text-emerald-200/80">{progress}</span>
            )}
          </div>
        </div>
      </div>
      {ep.successCondition && (
        <div className="ml-7 mt-2 pl-3 border-l-2 border-emerald-400/40">
          <p className="text-[10px] text-emerald-300/70 mb-0.5 font-medium">성공 조건</p>
          <p className="text-xs text-gray-200 leading-relaxed">{ep.successCondition}</p>
        </div>
      )}
    </div>
  )
}

function CompletedCard({ ep }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 opacity-70">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none mt-0.5">✅</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-300 truncate line-through decoration-gray-500/60">
              {ep.title}
            </p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 font-medium">
              완료
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PendingCard({ ep }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none mt-0.5 grayscale">🔒</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-500 tracking-widest">???</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 font-medium">
              미진행
            </span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1">조건을 충족하면 시작됩니다.</p>
        </div>
      </div>
    </div>
  )
}
