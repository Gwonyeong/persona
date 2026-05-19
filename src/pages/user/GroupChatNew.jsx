import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const MIN_MEMBERS = 2
const MAX_MEMBERS = 4

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function GroupChatNew() {
  const { t } = useTranslation()
  const { token, user } = useStore()
  const navigate = useNavigate()
  const [characters, setCharacters] = useState([])
  const [followedIds, setFollowedIds] = useState(new Set())
  const [selectedIds, setSelectedIds] = useState([])
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) return
    Promise.all([
      api.get('/characters'),
      api.get('/follows').catch(() => ({ characterIds: [] })),
    ]).then(([charsRes, followsRes]) => {
      setCharacters(charsRes.characters || [])
      setFollowedIds(new Set(followsRes.characterIds || []))
    }).catch((err) => {
      console.error(err)
      setError(t('common.error', { defaultValue: 'Error' }))
    })
  }, [token])

  // 팔로우한 캐릭터 먼저 노출 → 그 외 일반 캐릭터
  const orderedCharacters = useMemo(() => {
    const followed = []
    const others = []
    for (const c of characters) {
      if (followedIds.has(c.id)) followed.push(c)
      else others.push(c)
    }
    return [...followed, ...others]
  }, [characters, followedIds])

  function toggleSelect(characterId) {
    setSelectedIds((prev) => {
      if (prev.includes(characterId)) return prev.filter((id) => id !== characterId)
      if (prev.length >= MAX_MEMBERS) return prev
      return [...prev, characterId]
    })
  }

  async function handleCreate() {
    if (selectedIds.length < MIN_MEMBERS) {
      setError(t('groupChat.minMembersRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { groupChat } = await api.post('/group-chats', {
        characterIds: selectedIds,
        title: title.trim() || null,
      })
      navigate(`/group-chats/${groupChat.id}`, { replace: true })
    } catch (err) {
      console.error(err)
      if (err.data?.error === 'GROUP_CHAT_LIMIT_REACHED') {
        setError(t('groupChat.limitReached', { limit: err.data.limit }))
      } else {
        setError(err.message || 'Failed to create')
      }
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="pt-4 px-4 text-center text-gray-400">
        {t('chatList.loginPrompt')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Helmet>
        <title>{t('groupChat.newTitle')}</title>
        <meta name="description" content={t('groupChat.metaDescription')} />
      </Helmet>

      {/* 상단 고정 영역: 헤더 + 폼 */}
      <div className="flex-shrink-0">
        <div className="px-4 pt-2 pb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-800"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white">{t('groupChat.newTitle')}</h1>
        </div>

        <p className="px-4 text-sm text-gray-400 mb-4">{t('groupChat.newDescription')}</p>

        <div className="px-4 mb-4">
          <label className="block text-xs text-gray-400 mb-1">{t('groupChat.titleLabel')}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('groupChat.titlePlaceholder')}
            maxLength={60}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
          />
        </div>

        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">
            {t('groupChat.selectMembers', { count: selectedIds.length, max: MAX_MEMBERS })}
          </span>
        </div>
      </div>

      {/* 스크롤 가능한 캐릭터 그리드 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {orderedCharacters.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-sm text-gray-500">
              {t('groupChat.noBookmarks')}
            </div>
          ) : (
            orderedCharacters.map((c) => {
              const thumb = c.styles?.[0]?.images?.[0]
              const thumbUrl = getImageUrl(c.profileImage) || getImageUrl(thumb?.filePath)
              const selected = selectedIds.includes(c.id)
              const disabled = !selected && selectedIds.length >= MAX_MEMBERS
              return (
                <button
                  key={c.id}
                  onClick={() => !disabled && toggleSelect(c.id)}
                  className={`relative rounded-xl overflow-hidden border transition-all ${
                    selected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                      : disabled
                        ? 'border-gray-800 opacity-40'
                        : 'border-gray-800 hover:border-gray-600'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="aspect-square bg-gray-800">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">?</div>
                    )}
                  </div>
                  <div className="absolute top-1 right-1">
                    {selected ? (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                        {selectedIds.indexOf(c.id) + 1}
                      </div>
                    ) : !disabled ? (
                      <div className="w-6 h-6 rounded-full bg-black/60 border border-white/30" />
                    ) : null}
                  </div>
                  <div className="px-2 py-1.5 bg-gray-900 text-xs text-white truncate">{c.name}</div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* 하단 고정 버튼 영역 */}
      <div
        className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {error && (
          <p className="text-xs text-red-400 mb-2">{error}</p>
        )}
        <button
          onClick={handleCreate}
          disabled={submitting || selectedIds.length < MIN_MEMBERS}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {submitting ? t('groupChat.creating') : t('groupChat.create')}
        </button>
      </div>
    </div>
  )
}
