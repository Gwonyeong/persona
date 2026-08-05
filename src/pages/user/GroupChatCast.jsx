import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import MaskIcon from '../../components/MaskIcon'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
// 상황극 방 제작 비용 — 서버 routes/groupChats.js의 GROUP_CREATE_COST와 동기
const GROUP_CREATE_COST = 1

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function charThumb(character) {
  if (!character) return null
  const thumb = character.styles?.[0]?.images?.[0]
  return getImageUrl(character.profileImage) || getImageUrl(thumb?.filePath)
}

// 상황극 컨셉의 배역에 캐릭터를 캐스팅하는 화면. 경로: /group-chats/cast/:conceptId
export default function GroupChatCast() {
  const { conceptId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, setMasks } = useStore()

  const [concept, setConcept] = useState(null)
  const [characters, setCharacters] = useState([])
  const [followedIds, setFollowedIds] = useState(new Set())
  const [assignments, setAssignments] = useState([]) // 배역 슬롯별 characterId | null
  const [activeSlot, setActiveSlot] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([
      api.get('/group-concepts'),
      api.get('/characters'),
      api.get('/follows').catch(() => ({ characterIds: [] })),
    ])
      .then(([conceptsRes, charsRes, followsRes]) => {
        if (cancelled) return
        const found = (conceptsRes.concepts || []).find((c) => String(c.id) === String(conceptId))
        if (!found) {
          setError(t('groupChatCast.loadFailed'))
          return
        }
        setConcept(found)
        setAssignments(new Array(found.roles.length).fill(null))
        setCharacters(charsRes.characters || [])
        setFollowedIds(new Set(followsRes.characterIds || []))
      })
      .catch(() => !cancelled && setError(t('groupChatCast.loadFailed')))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [conceptId, token, t])

  // 팔로우한 캐릭터 먼저 노출
  const orderedCharacters = useMemo(() => {
    const followed = []
    const others = []
    for (const c of characters) {
      if (followedIds.has(c.id)) followed.push(c)
      else others.push(c)
    }
    return [...followed, ...others]
  }, [characters, followedIds])

  const assignedCount = assignments.filter(Boolean).length
  const minRoles = concept?.minRoles || 2

  const nextEmptySlot = (arr, from) => {
    for (let i = 0; i < arr.length; i++) {
      const idx = (from + i) % arr.length
      if (!arr[idx]) return idx
    }
    return from
  }

  // 캐릭터 탭 — 이미 배정돼 있으면 해제(토글), 아니면 활성 슬롯에 배정하고 다음 빈 슬롯으로 이동.
  const toggleCharacter = (characterId) => {
    setAssignments((prev) => {
      const existingSlot = prev.indexOf(characterId)
      if (existingSlot !== -1) {
        const next = [...prev]
        next[existingSlot] = null
        setActiveSlot(existingSlot)
        return next
      }
      const next = [...prev]
      next[activeSlot] = characterId
      setActiveSlot(nextEmptySlot(next, activeSlot + 1))
      return next
    })
  }

  const clearSlot = (slotIdx) => {
    setAssignments((prev) => {
      const next = [...prev]
      next[slotIdx] = null
      return next
    })
    setActiveSlot(slotIdx)
  }

  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])

  const handleStart = async () => {
    if (submitting || !concept) return
    if (assignedCount < minRoles) {
      setError(t('groupChatCast.needMore', { count: minRoles }))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const roleAssignments = assignments
        .map((cid, i) => (cid ? { characterId: cid, roleKey: concept.roles[i].key } : null))
        .filter(Boolean)
      const { groupChat } = await api.post('/group-chats', {
        conceptId: concept.id,
        roleAssignments,
      })
      // 방 제작으로 마스크 1개 소모됨 → 잔액 갱신 (best-effort)
      try {
        const me = await api.get('/auth/me')
        if (typeof me.masks === 'number') setMasks(me.masks)
      } catch {}
      navigate(`/group-chats/${groupChat.id}`, { replace: true, state: { justCreated: true } })
    } catch (err) {
      console.error(err)
      if (err.data?.error === 'ADULT_VERIFICATION_REQUIRED') {
        navigate('/adult-verify')
        return
      }
      // 마스크 부족 → 상점으로
      if (err.status === 402 || err.message?.includes('Insufficient masks')) {
        navigate('/mask-shop')
        return
      }
      if (err.data?.error === 'GROUP_CHAT_LIMIT_REACHED') {
        setError(t('groupChat.limitReached', { limit: err.data.limit }))
      } else {
        setError(err.message || t('groupChatCast.loadFailed'))
      }
      setSubmitting(false)
    }
  }

  if (!token) {
    return <div className="pt-4 px-4 text-center text-gray-400">{t('chatList.loginPrompt')}</div>
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <Helmet>
        <title>{concept?.title || t('groupChatCast.title')}</title>
        <meta name="description" content={t('groupChatCast.metaDescription')} />
      </Helmet>

      {/* 헤더 */}
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
      >
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white" style={NO_OUTLINE} aria-label={t('common.back', { defaultValue: '뒤로' })}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex items-center gap-2">
          {concept?.emoji && <span className="text-lg">{concept.emoji}</span>}
          <h1 className="text-white font-semibold text-base truncate">{concept?.title || t('groupChatCast.title')}</h1>
          {concept?.safety === 'NSFW' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 flex-shrink-0">19</span>
          )}
        </div>
      </header>

      {loading ? (
        <p className="text-gray-500 text-sm text-center mt-10">{t('common.loading', { defaultValue: '불러오는 중...' })}</p>
      ) : !concept ? (
        <p className="text-gray-500 text-sm text-center mt-10">{error || t('groupChatCast.loadFailed')}</p>
      ) : (
        <>
          {/* 배역 슬롯 (고정) */}
          <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-gray-800/60">
            {concept.summary && <p className="text-gray-400 text-[12px] mb-3 leading-relaxed">{concept.summary}</p>}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-300">{t('groupChatCast.roles')}</span>
              <span className="text-[11px] text-gray-500">{assignedCount}/{concept.roles.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pt-2 pb-1">
              {concept.roles.map((role, i) => {
                const cid = assignments[i]
                const c = cid ? charById.get(cid) : null
                const isActive = i === activeSlot
                return (
                  <button
                    key={role.key}
                    onClick={() => setActiveSlot(i)}
                    className={`relative flex-shrink-0 w-24 rounded-xl border p-2 text-center transition-colors ${
                      isActive ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-800 bg-gray-900'
                    }`}
                    style={NO_OUTLINE}
                  >
                    <div className="w-14 h-14 mx-auto rounded-full bg-gray-800 overflow-hidden mb-1 flex items-center justify-center">
                      {c ? (
                        <img src={charThumb(c)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-gray-200 truncate">{role.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{c ? c.name : t('groupChatCast.empty')}</p>
                    {c && (
                      <span
                        onClick={(e) => { e.stopPropagation(); clearSlot(i) }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-gray-200"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* 활성 배역 설명 */}
            {concept.roles[activeSlot]?.description && (
              <p className="text-[11px] text-indigo-300/90 mt-2 leading-relaxed">
                <span className="font-semibold">{concept.roles[activeSlot].name}</span> · {concept.roles[activeSlot].description}
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">{t('groupChatCast.pickForRole')}</p>
          </div>

          {/* 캐릭터 그리드 */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              {orderedCharacters.map((c) => {
                const assignedSlot = assignments.indexOf(c.id)
                const selected = assignedSlot !== -1
                const thumbUrl = charThumb(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCharacter(c.id)}
                    className={`relative rounded-xl overflow-hidden border transition-all ${
                      selected ? 'border-indigo-500 ring-2 ring-indigo-500/40' : 'border-gray-800 hover:border-gray-600'
                    }`}
                    style={NO_OUTLINE}
                  >
                    <div className="aspect-square bg-gray-800">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">?</div>
                      )}
                    </div>
                    {selected && (
                      <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold px-1 truncate max-w-[80%]">
                        {concept.roles[assignedSlot]?.name?.slice(0, 3) || assignedSlot + 1}
                      </div>
                    )}
                    <div className="px-2 py-1.5 bg-gray-900 text-xs text-white truncate">{c.name}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 하단 시작 버튼 */}
          <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <button
              onClick={handleStart}
              disabled={submitting || assignedCount < minRoles}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={NO_OUTLINE}
            >
              {submitting ? (
                t('groupChatCast.starting')
              ) : (
                <>
                  {t('groupChatCast.start')}
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-bold bg-black/25 px-1.5 py-0.5 rounded">
                    -{GROUP_CREATE_COST}<MaskIcon className="text-[12px]" />
                  </span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
