import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

// 그룹 톡방 장기 기억 페이지 — 캐릭터(배역)별 기억 + 슬롯 사용량 표시. 경로: /group-chats/:id/memory
export default function GroupChatMemory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token } = useStore()

  const [members, setMembers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) { navigate('/login'); return }
    api.get(`/group-chats/${id}/memory`)
      .then((res) => setMembers(Array.isArray(res.members) ? res.members : []))
      .catch((err) => {
        if (err.status === 404) navigate(`/group-chats/${id}`, { replace: true })
        else setError(t('groupChatCast.loadFailed', { defaultValue: '불러오지 못했어요' }))
      })
      .finally(() => setLoading(false))
  }, [id, token, navigate, t])

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(`/group-chats/${id}`, { replace: true })
  }

  const allEmpty = (members || []).every((m) => (m.facts || []).length === 0)

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <Helmet>
        <title>{t('groupChat.memoryTitle', { defaultValue: '이 톡방이 기억하는 내용' })}</title>
      </Helmet>

      {/* 헤더 */}
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
      >
        <button onClick={goBack} className="text-gray-400 hover:text-white" style={NO_OUTLINE} aria-label={t('common.back', { defaultValue: '뒤로' })}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <h1 className="text-white font-semibold text-base truncate">{t('groupChat.memoryTitle', { defaultValue: '이 톡방이 기억하는 내용' })}</h1>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 16px)' }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-center text-gray-500 text-sm mt-16">{error}</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">{t('groupChat.memoryHint', { defaultValue: '대화가 쌓이면 유저·관계에 대한 정보를 자동으로 기억해요' })}</p>

            {allEmpty && (
              <div className="text-center py-10">
                <p className="text-gray-400 text-sm">{t('groupChat.memoryEmpty', { defaultValue: '아직 톡방이 기억하는 내용이 없어요' })}</p>
              </div>
            )}

            <div className="space-y-5">
              {(members || []).map((m) => {
                const thumb = getImageUrl(m.profileImage)
                const facts = m.facts || []
                const total = m.memorySlots || 10
                const used = facts.length
                const pct = Math.min(100, Math.round((used / total) * 100))
                const isFull = used >= total
                return (
                  <div key={m.characterId} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                    {/* 캐릭터 헤더 — 아바타 + 이름(배역) + 슬롯 사용량 */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-white truncate">{m.name}</span>
                          {m.roleName && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 flex-shrink-0">{m.roleName}</span>}
                        </div>
                        {/* 슬롯 게이지 */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isFull ? 'bg-amber-400' : 'bg-indigo-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-medium flex-shrink-0 ${isFull ? 'text-amber-300' : 'text-gray-400'}`}>
                            {used}/{total}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 기억 목록 */}
                    {facts.length === 0 ? (
                      <p className="text-xs text-gray-600">{t('groupChat.memoryNoneForChar', { defaultValue: '아직 기억하는 게 없어요' })}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {facts.map((fact, i) => (
                          <li key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl bg-gray-800/70 border border-gray-700/50">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                            <span className="text-sm text-gray-200 leading-relaxed">{fact}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
