import { useEffect, useState } from 'react'
import { api } from '../lib/api'

function getAffinityLabel(affinity) {
  if (affinity <= -50) return '당신을 극도로 경계하는 중'
  if (affinity <= -20) return '당신을 경계하는 중'
  if (affinity <= -5) return '약간 불편해하는 중'
  if (affinity <= 5) return '무관심'
  if (affinity <= 20) return '약간 관심을 보이는 중'
  if (affinity <= 50) return '당신에게 호감을 느끼는 중'
  if (affinity <= 80) return '당신과 매우 가까워진 사이'
  return '깊은 애정을 품고 있는 중'
}

export default function MissionPanel({ conversationId, onClose }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!conversationId) return
    api
      .get(`/missions/conversation/${conversationId}`)
      .then(setData)
      .catch(console.error)
  }, [conversationId])

  if (!data) return null

  const { missions, currentAct, affinity } = data

  // ACT별 그룹핑
  const acts = {}
  missions.forEach((m) => {
    if (!acts[m.act]) acts[m.act] = []
    acts[m.act].push(m)
  })

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-gray-900 border-t border-gray-700 rounded-t-2xl max-h-[70vh] overflow-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>

        <div className="px-5 pb-5">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">미션</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 호감도 상태 */}
          <div className="mb-5 flex items-center justify-between">
            <span className="text-xs text-gray-400">ACT {currentAct}</span>
            <span className="text-xs text-indigo-400">{getAffinityLabel(affinity)}</span>
          </div>

          {/* ACT별 미션 목록 */}
          {Object.entries(acts)
            .sort(([a], [b]) => a - b)
            .map(([act, actMissions]) => (
              <div key={act} className="mb-4">
                <p className={`text-xs font-semibold mb-2 ${
                  parseInt(act) === currentAct ? 'text-indigo-400' : 'text-gray-500'
                }`}>
                  ACT {act}
                </p>
                <div className="space-y-2">
                  {actMissions.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3.5 py-2.5 border ${
                        m.completed
                          ? 'bg-indigo-950/30 border-indigo-500/30'
                          : m.locked
                          ? 'bg-gray-800/30 border-gray-800 opacity-50'
                          : 'bg-gray-800/50 border-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          m.completed ? 'bg-indigo-600' : m.locked ? 'bg-gray-700' : 'bg-gray-700'
                        }`}>
                          {m.completed ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : m.locked ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-gray-500">
                              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-9H9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z" />
                            </svg>
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-gray-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${
                            m.completed ? 'text-indigo-300' : m.locked ? 'text-gray-500' : 'text-gray-400'
                          }`}>
                            {m.completed ? m.title : '???'}
                          </p>
                          {m.completed && m.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                          )}
                          {!m.locked && !m.completed && m.hint && (
                            <p className="text-xs text-yellow-500/70 mt-1">힌트: {m.hint}</p>
                          )}
                        </div>
                        {m.rewardMasks > 0 && !m.locked && m.completed && (
                          <span className="text-xs flex-shrink-0 text-pink-400">
                            +{m.rewardMasks}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {missions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">아직 미션이 없습니다.</p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
