import { useEffect, useState } from 'react'
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

function getCharacterOnlineStatus(activeHours) {
  if (!activeHours?.schedule) return 'free'
  const hour = new Date().getHours()
  const slot = activeHours.schedule.find((s) => {
    if (s.start < s.end) return hour >= s.start && hour < s.end
    return hour >= s.start || hour < s.end
  })
  return slot?.status || 'free'
}

export default function ChatList() {
  const { t } = useTranslation()
  const { token } = useStore()
  const [conversations, setConversations] = useState([])
  const [groupChats, setGroupChats] = useState([])
  const [search, setSearch] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    if (!token) return
    api.get('/conversations').then(({ conversations }) => setConversations(conversations))
    api.get('/group-chats').then(({ groupChats }) => setGroupChats(groupChats)).catch(() => {})
  }

  useEffect(() => { load() }, [token])

  // 폴링 이벤트로 자동 갱신
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('conversations-updated', handler)
    return () => window.removeEventListener('conversations-updated', handler)
  }, [token])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === 'group') {
        await api.delete(`/group-chats/${deleteTarget.id}`)
        setGroupChats((prev) => prev.filter((g) => g.id !== deleteTarget.id))
      } else {
        await api.delete(`/conversations/${deleteTarget.id}`)
        setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      }
      setDeleteTarget(null)
    } catch (error) {
      console.error(error)
    } finally {
      setDeleting(false)
    }
  }

  // 1:1 + 단체 톡방을 하나의 리스트로 합쳐서 updatedAt 내림차순 정렬
  const merged = [
    ...conversations.map((c) => ({ kind: 'one', item: c })),
    ...groupChats.map((g) => ({ kind: 'group', item: g })),
  ].sort((a, b) => new Date(b.item.updatedAt) - new Date(a.item.updatedAt))

  const filteredEntries = search.trim()
    ? merged.filter((entry) => {
        const q = search.toLowerCase()
        if (entry.kind === 'one') return entry.item.character.name.toLowerCase().includes(q)
        const title = (entry.item.title || '').toLowerCase()
        const memberNames = (entry.item.members || []).map((m) => (m.character?.name || '').toLowerCase()).join(' ')
        return title.includes(q) || memberNames.includes(q)
      })
    : merged

  return (
    <div className="pt-2 pb-2">
      <Helmet>
        <title>{t('chatList.title')}</title>
        <meta name="description" content={t('chatList.metaDescription')} />
      </Helmet>

      {/* 헤더 */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('chatList.heading')}</h1>
        <div className="flex items-center gap-1">
          {token && (
            <button
              onClick={() => navigate('/group-chats/new')}
              className="relative w-9 h-9 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              title={t('groupChat.newGroupButton')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="absolute -top-0.5 -right-1 px-1 py-px text-[8px] font-bold leading-none rounded-sm bg-indigo-600 text-white tracking-tight">
                Beta
              </span>
            </button>
          )}
          {token && (conversations.length > 0 || groupChats.length > 0) && (
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-gray-300 font-semibold mb-1">{t('chatList.myMessages')}</p>
          <p className="text-sm text-gray-500 mb-5">{t('chatList.loginPrompt')}</p>
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
          <div className="px-4 mb-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('chatList.searchPlaceholder')}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">
                {search ? t('chatList.noSearchResults') : t('chatList.noChats')}
              </p>
              {!search && (
                <p className="text-gray-500 text-xs mt-1">{t('chatList.noChatsHint')}</p>
              )}
            </div>
          ) : (
            <div>
              {filteredEntries.map((entry) => {
                if (entry.kind === 'group') {
                  const gc = entry.item
                  const isUnread = gc.updatedAt && (!gc.lastReadAt || new Date(gc.updatedAt) > new Date(gc.lastReadAt))
                  const memberNames = (gc.members || []).map((m) => m.character?.name).filter(Boolean).join(', ')
                  const displayTitle = gc.title || memberNames || '...'
                  const previewText = gc.preview?.content || t('chatList.startChat')
                  return (
                    <div key={`g-${gc.id}`} className="flex items-center">
                      <button
                        onClick={() => navigate(`/group-chats/${gc.id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-gray-900/60 transition-colors text-left"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {/* 멤버 콜라주 — 2x2 그리드 */}
                        <div className="relative flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gray-800 grid grid-cols-2 grid-rows-2 gap-px">
                          {(gc.members || []).slice(0, 4).map((m, i) => {
                            const thumb = m.character?.styles?.[0]?.images?.[0]
                            const url = getImageUrl(m.character?.profileImage) || getImageUrl(thumb?.filePath)
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
                          onClick={() => setDeleteTarget({ kind: 'group', id: gc.id, name: displayTitle })}
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
                }

                const conv = entry.item
                const thumb = conv.character.styles?.[0]?.images?.[0]
                const thumbUrl = getImageUrl(conv.character.profileImage) || getImageUrl(thumb?.filePath)
                const previewMsg = conv.lastCharMessage || conv.messages?.[0]
                const isUnread = conv.updatedAt && (!conv.lastReadAt || new Date(conv.updatedAt) > new Date(conv.lastReadAt))
                const onlineStatus = getCharacterOnlineStatus(conv.character.activeHours)

                return (
                  <div key={`c-${conv.id}`} className="flex items-center">
                    <button
                      onClick={() => navigate(`/chats/${conv.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-gray-900/60 transition-colors text-left group"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {/* 프로필 이미지 */}
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full bg-gray-800 overflow-hidden">
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">?</div>
                          )}
                        </div>
                        {onlineStatus === 'free' && (
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-950" />
                        )}
                      </div>

                      {/* 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm truncate ${isUnread ? 'text-white' : 'text-gray-300'}`}>{conv.character.name}</p>
                          <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(conv.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-sm truncate flex-1 ${isUnread ? 'text-gray-300' : 'text-gray-500'}`}>
                            {previewMsg?.content || t('chatList.startChat')}
                          </p>
                          {isUnread && (
                            <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </button>
                    {editMode && (
                      <button
                        onClick={() => setDeleteTarget({ kind: 'one', id: conv.id, name: conv.character.name })}
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
          )}
        </>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">
              {deleteTarget.kind === 'group' ? t('groupChat.deleteTitle') : t('chatList.deleteTitle')}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              {deleteTarget.kind === 'group'
                ? t('groupChat.deleteDescription')
                : t('chatList.deleteDescription', { name: deleteTarget.name })}
            </p>
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
