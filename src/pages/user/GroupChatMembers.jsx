import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const MIN_MEMBERS = 2
const MAX_MEMBERS = 4

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function getNeutralImage(character) {
  const styles = character?.styles || []
  for (const s of styles) {
    const img = s.images?.find((i) => i.emotion === 'NEUTRAL')
    if (img) return getImageUrl(img.filePath)
  }
  return getImageUrl(character?.profileImage)
}

export default function GroupChatMembers() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()
  const { t } = useTranslation()

  const [groupChat, setGroupChat] = useState(null)
  const [allCharacters, setAllCharacters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    api.get(`/group-chats/${id}`)
      .then(({ groupChat }) => setGroupChat(groupChat))
      .catch((err) => {
        if (err.status === 404) navigate(`/group-chats/${id}`, { replace: true })
      })
      .finally(() => setLoading(false))
    api.get('/characters').then(({ characters }) => setAllCharacters(characters || [])).catch(() => {})
  }, [id, token, navigate])

  const memberById = useMemo(() => {
    const map = new Map()
    for (const m of groupChat?.members || []) map.set(m.characterId, m)
    return map
  }, [groupChat?.members])

  async function toggleMember(characterId, nextActive) {
    try {
      const { groupChat: updated } = await api.patch(`/group-chats/${id}/members/${characterId}`, { isActive: nextActive })
      setGroupChat(updated)
    } catch (err) {
      console.error(err)
    }
  }

  async function removeMember(characterId) {
    if (!groupChat || groupChat.members.length <= MIN_MEMBERS) return
    try {
      const { groupChat: updated } = await api.delete(`/group-chats/${id}/members/${characterId}`)
      setGroupChat(updated)
    } catch (err) {
      console.error(err)
    }
  }

  async function addMember(characterId) {
    try {
      const { groupChat: updated } = await api.post(`/group-chats/${id}/members`, { characterId })
      setGroupChat(updated)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading || !groupChat) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('common.loading')}</div>
  }

  const canAdd = groupChat.members.length < MAX_MEMBERS
  const canRemove = groupChat.members.length > MIN_MEMBERS
  const addable = allCharacters.filter((c) => !memberById.has(c.id))

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
      >
        <button
          onClick={() => {
            if (window.history.state?.idx > 0) navigate(-1)
            else navigate(`/group-chats/${id}`, { replace: true })
          }}
          className="text-gray-400 hover:text-white"
          style={NO_OUTLINE}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-semibold text-sm text-white">{t('groupChat.members')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {/* 현재 멤버 */}
        <section>
          <h2 className="text-sm font-semibold text-white mb-3">
            {t('groupChat.members')} <span className="text-gray-500 font-normal">{groupChat.members.length}/{MAX_MEMBERS}</span>
          </h2>
          <div className="space-y-2">
            {(groupChat.members || []).map((m) => {
              const avatar = getNeutralImage(m.character)
              return (
                <div key={m.characterId} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-900 border border-gray-800">
                  <div className="w-11 h-11 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                    {avatar && <img src={avatar} alt="" className={`w-full h-full object-cover ${m.isActive ? '' : 'grayscale opacity-50'}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{m.character?.name}</div>
                    <div className="text-xs text-gray-500">
                      {m.isActive ? t('groupChat.toggleActive') : t('groupChat.toggleInactive')} · ♥ {m.affinity}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMember(m.characterId, !m.isActive)}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${m.isActive ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    style={NO_OUTLINE}
                    aria-label={m.isActive ? t('groupChat.toggleActive') : t('groupChat.toggleInactive')}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${m.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  {canRemove && (
                    <button
                      onClick={() => removeMember(m.characterId)}
                      className="text-red-400 text-xs hover:text-red-300 px-2 py-1 flex-shrink-0"
                      style={NO_OUTLINE}
                    >
                      {t('groupChat.removeMember')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {!canRemove && (
            <p className="text-xs text-gray-500 mt-2">{t('groupChat.minMembersWarning')}</p>
          )}
        </section>

        {/* 추가 가능한 캐릭터 */}
        {canAdd && addable.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-white mb-3">{t('groupChat.addMember')}</h2>
            <div className="grid grid-cols-3 gap-2">
              {addable.map((c) => {
                const thumb = c.styles?.[0]?.images?.[0]
                const thumbUrl = getImageUrl(c.profileImage) || getImageUrl(thumb?.filePath)
                return (
                  <button
                    key={c.id}
                    onClick={() => addMember(c.id)}
                    className="rounded-xl overflow-hidden border border-gray-800 hover:border-indigo-500 transition-colors"
                    style={NO_OUTLINE}
                  >
                    <div className="aspect-square bg-gray-800">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">?</div>
                      )}
                    </div>
                    <div className="px-2 py-1 text-xs text-white truncate">{c.name}</div>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
