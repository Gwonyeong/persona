import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'
import { timeAgo } from '../../lib/timeFormat'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

// 캐릭터/멤버에서 대표 썸네일 추출 (프로필 우선 → 첫 스타일의 NEUTRAL 이미지)
function charThumb(character) {
  if (!character) return null
  const thumb = character.styles?.[0]?.images?.[0]
  return getImageUrl(character.profileImage) || getImageUrl(thumb?.filePath)
}

export default function GroupChatList() {
  const { t } = useTranslation()
  const { token } = useStore()
  const navigate = useNavigate()
  const [groupChats, setGroupChats] = useState([])
  const [concepts, setConcepts] = useState([])
  const [search, setSearch] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    if (!token) return
    api.get('/group-chats').then(({ groupChats }) => setGroupChats(groupChats)).catch(() => {})
    api.get('/group-concepts').then(({ concepts }) => setConcepts(concepts || [])).catch(() => {})
  }

  useEffect(() => { load() }, [token])

  // 폴링 이벤트로 자동 갱신 (ChatList와 동일 채널 공유)
  useEffect(() => {
    const handler = () => {
      if (!token) return
      api.get('/group-chats').then(({ groupChats }) => setGroupChats(groupChats)).catch(() => {})
    }
    window.addEventListener('conversations-updated', handler)
    return () => window.removeEventListener('conversations-updated', handler)
  }, [token])

  const filteredRooms = useMemo(() => {
    const sorted = [...groupChats].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter((gc) => {
      const title = (gc.title || '').toLowerCase()
      const memberNames = (gc.members || []).map((m) => (m.character?.name || '').toLowerCase()).join(' ')
      return title.includes(q) || memberNames.includes(q)
    })
  }, [groupChats, search])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/group-chats/${deleteTarget.id}`)
      setGroupChats((prev) => prev.filter((g) => g.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="pt-2 pb-2">
      <Helmet>
        <title>{t('groupChatList.title')}</title>
        <meta name="description" content={t('groupChatList.metaDescription')} />
      </Helmet>

      {/* 헤더 */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('groupChatList.heading')}</h1>
        <div className="flex items-center gap-1">
          {token && (
            <button
              onClick={() => navigate('/group-chats/new')}
              className="relative w-9 h-9 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              title={t('groupChatList.createRoom')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          {token && groupChats.length > 0 && (
            <button
              onClick={() => setEditMode((prev) => !prev)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${editMode ? 'text-indigo-400 bg-indigo-400/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {editMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {!token ? (
        <div className="text-center py-20 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p className="text-gray-300 font-semibold mb-1">{t('groupChatList.heading')}</p>
          <p className="text-sm text-gray-500 mb-5">{t('groupChatList.loginPrompt')}</p>
          <button
            onClick={() => goToLogin(navigate)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.login')}
          </button>
        </div>
      ) : (
        <>
          {/* 검색바 */}
          <div className="px-4 mb-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('groupChatList.searchPlaceholder')}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
          </div>

          {/* 내 단톡방 목록 */}
          {filteredRooms.length > 0 ? (
            <div>
              {filteredRooms.map((gc) => {
                const isUnread = gc.updatedAt && (!gc.lastReadAt || new Date(gc.updatedAt) > new Date(gc.lastReadAt))
                const memberNames = (gc.members || []).map((m) => m.character?.name).filter(Boolean).join(', ')
                const displayTitle = gc.title || memberNames || '...'
                const previewText = gc.preview?.content || t('chatList.startChat')
                return (
                  <div key={gc.id} className="flex items-center">
                    <button
                      onClick={() => navigate(`/group-chats/${gc.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-gray-900/60 transition-colors text-left"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {/* 멤버 콜라주 — 2x2 그리드 */}
                      <div className="relative flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gray-800 grid grid-cols-2 grid-rows-2 gap-px">
                        {(gc.members || []).slice(0, 4).map((m, i) => {
                          const url = charThumb(m.character)
                          return (
                            <div key={i} className="bg-gray-700 overflow-hidden">
                              {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : null}
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 flex-shrink-0">
                            {gc.members?.length || 0}
                          </span>
                          <p className={`font-semibold text-sm truncate ${isUnread ? 'text-white' : 'text-gray-300'}`}>{displayTitle}</p>
                          <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(gc.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-sm truncate flex-1 ${isUnread ? 'text-gray-300' : 'text-gray-500'}`}>
                            {previewText}
                          </p>
                          {isUnread && (
                            <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </button>
                    {editMode && (
                      <button
                        onClick={() => setDeleteTarget({ id: gc.id, name: displayTitle })}
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-full mr-2 transition-colors"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-10 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">
                {search ? t('groupChatList.noSearchResults') : t('groupChatList.empty')}
              </p>
              {!search && (
                <p className="text-gray-500 text-xs mt-1">{t('groupChatList.emptyHint')}</p>
              )}
            </div>
          )}

          {/* 상황극 컨셉 — 카드 선택 → 캐스팅 화면 (1:1 상황극 카드 UI 스타일) */}
          {!search && concepts.length > 0 && (
            <div className="mt-5">
              <div className="px-4 mb-1">
                <h2 className="text-sm font-bold text-gray-200">{t('groupChatList.concepts')}</h2>
              </div>
              <p className="px-4 text-xs text-gray-500 mb-3">{t('groupChatList.conceptsHint')}</p>
              <div className="flex flex-col gap-3 px-4">
                {concepts.map((concept) => (
                  <button
                    key={concept.id}
                    onClick={() => navigate(`/group-chats/cast/${concept.id}`)}
                    className="relative w-full flex items-center gap-3 text-left p-4 rounded-2xl border bg-gray-900 border-gray-800 hover:border-indigo-500/60 transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {concept.emoji && <span className="text-lg">{concept.emoji}</span>}
                        <span className="text-white font-medium text-sm">{concept.title}</span>
                        {concept.safety === 'NSFW' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">19</span>
                        )}
                      </div>
                      {concept.summary && <p className="text-gray-400 text-[12px] mt-1.5 leading-relaxed">{concept.summary}</p>}
                      {/* 배역 미리보기 */}
                      {Array.isArray(concept.roles) && concept.roles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {concept.roles.map((r) => (
                            <span key={r.key} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                              {r.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 flex-shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                ))}

                {/* 자유 조합 진입 */}
                <button
                  onClick={() => navigate('/group-chats/new')}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('groupChatList.freeCombo')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">{t('groupChat.deleteTitle')}</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">{t('groupChat.deleteDescription')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-medium disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {deleting ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
