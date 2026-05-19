import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { formatChatTime } from '../../lib/timeFormat'
import MaskIcon from '../../components/MaskIcon'

// 단톡방 메시지당 마스크 비용 — 서버 routes/groupChats.js의 GROUP_CHAT_*_COST와 동기
const GROUP_MESSAGE_MASK_COST = 5

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

function parseMessageSegments(content, role) {
  if (!content || typeof content !== 'string') return [{ type: 'text', value: content || '' }]
  const pattern = role === 'USER' ? /(\([^()\n]+\))/g : /(《[^》\n]+》)/g
  const parts = content.split(pattern).filter((p) => p !== '' && p != null)
  return parts.map((p) => {
    if (role === 'USER' && /^\(.+\)$/.test(p)) return { type: 'action', value: p.slice(1, -1) }
    if (role !== 'USER' && /^《.+》$/.test(p)) return { type: 'action', value: p.slice(1, -1) }
    return { type: 'text', value: p }
  })
}

export default function GroupChat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user, setMasks } = useStore()
  const [groupChat, setGroupChat] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [allCharacters, setAllCharacters] = useState([])
  // 스트리밍 중인 버블들 — 응답이 done되면 비워짐
  // 키: `${turnIdx}_${bubbleIdx}` → { turnIdx, characterId, bubbleIdx, role, content, complete }
  const [streamingBubbles, setStreamingBubbles] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // 입력창에 (행동) 형식의 괄호를 삽입. 선택된 텍스트가 있으면 감싸고, 없으면 빈 ()를 넣고 가운데로 포커스.
  function insertActionParens() {
    const ta = inputRef.current
    if (!ta) return
    const start = ta.selectionStart ?? input.length
    const end = ta.selectionEnd ?? input.length
    const before = input.slice(0, start)
    const selected = input.slice(start, end)
    const after = input.slice(end)
    const inserted = selected ? `(${selected})` : '()'
    const next = before + inserted + after
    setInput(next)
    // 다음 tick에 selection 복원 — selected가 있으면 끝, 없으면 ( 다음 위치
    requestAnimationFrame(() => {
      const ta2 = inputRef.current
      if (!ta2) return
      const caret = selected ? before.length + inserted.length : before.length + 1
      ta2.focus()
      ta2.setSelectionRange(caret, caret)
    })
  }

  useEffect(() => {
    if (!token) return
    api.get(`/group-chats/${id}`).then(({ groupChat }) => {
      setGroupChat(groupChat)
      setVoiceMode(!!groupChat.voiceMode)
    }).catch((err) => {
      console.error(err)
      if (err.status === 404) navigate('/chats', { replace: true })
    })
  }, [id, token])

  // 스크롤은 항상 즉시 바닥으로 — 페이지 진입·새 메시지·스트리밍 delta 모두 동일.
  // 'smooth' 애니메이션을 쓰면 진입 시 상→하 스크롤이 보이고 스트리밍 중 따라가지 못함.
  // streamingBubbles 전체 ref 변화를 dep에 포함해 delta마다 즉시 재스크롤.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [groupChat?.messages?.length, streamingBubbles])

  // 멤버 추가 모달 진입 시 캐릭터 목록 로드
  useEffect(() => {
    if (!addingMember || allCharacters.length > 0) return
    api.get('/characters').then(({ characters }) => setAllCharacters(characters || []))
  }, [addingMember])

  const memberById = useMemo(() => {
    const map = new Map()
    if (groupChat?.members) {
      for (const m of groupChat.members) map.set(m.characterId, m)
    }
    return map
  }, [groupChat?.members])

  const activeCount = useMemo(() => {
    return (groupChat?.members || []).filter((m) => m.isActive).length
  }, [groupChat?.members])

  const headerTitle = useMemo(() => {
    if (!groupChat) return ''
    if (groupChat.title) return groupChat.title
    return (groupChat.members || []).map((m) => m.character?.name).filter(Boolean).join(', ')
  }, [groupChat])

  async function handleSend() {
    if (!input.trim() || sending || !groupChat) return
    if (activeCount === 0) return

    const userMsg = {
      role: 'USER',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    }

    // 낙관적 업데이트
    setGroupChat((prev) => prev ? ({
      ...prev,
      messages: [...(prev.messages || []), userMsg],
    }) : prev)
    setInput('')
    setSending(true)

    try {
      let receivedMessages = null
      let memberUpdates = null
      let receivedUserLocation = null

      // 스트리밍 버블 누적 — Map 형태로 turn/bubble 인덱스별 최신 상태 유지
      const bubbleMap = new Map() // key=`${turnIdx}_${bubbleIdx}` → bubble obj

      await api.stream(`/group-chats/${id}/messages`, {
        content: userMsg.content,
        voiceWithChat: voiceMode,
      }, (eventType, data) => {
        if (eventType === 'delta') {
          // delta: { turnIdx, characterId, bubbleIdx, role, content, complete }
          const key = `${data.turnIdx}_${data.bubbleIdx}`
          bubbleMap.set(key, data)
          // 정렬된 배열로 변환 (turnIdx → bubbleIdx 순)
          const sorted = Array.from(bubbleMap.values()).sort((a, b) => {
            if (a.turnIdx !== b.turnIdx) return a.turnIdx - b.turnIdx
            return a.bubbleIdx - b.bubbleIdx
          })
          setStreamingBubbles(sorted)
        } else if (eventType === 'done') {
          receivedMessages = data.responseMessages
          memberUpdates = data.memberUpdates
          receivedUserLocation = data.userLocation || null
        } else if (eventType === 'error') {
          throw new Error(data.error || 'Stream error')
        }
      })

      // SSE done 이후 일괄 반영 — 스트리밍 버블 비우고 실제 메시지 추가
      if (receivedMessages) {
        setGroupChat((prev) => {
          if (!prev) return prev
          const updatedMembers = (prev.members || []).map((m) => {
            const upd = memberUpdates?.find((u) => u.characterId === m.characterId)
            if (!upd) return m
            return {
              ...m,
              affinity: upd.affinity,
              currentStyleId: upd.currentStyleId,
              characterStatus: upd.characterStatus,
              isWithUser: typeof upd.isWithUser === 'boolean' ? upd.isWithUser : m.isWithUser,
            }
          })
          return {
            ...prev,
            messages: [...(prev.messages || []), ...receivedMessages],
            members: updatedMembers,
            ...(receivedUserLocation ? { userLocation: receivedUserLocation } : {}),
          }
        })
        setStreamingBubbles([])
      }

      // 마스크 잔액 새로고침
      try {
        const me = await api.get('/auth/me')
        if (typeof me.masks === 'number') setMasks(me.masks)
      } catch {}
    } catch (err) {
      console.error(err)
      // 유저 메시지를 롤백 + 부분 스트리밍 버블 제거
      setGroupChat((prev) => prev ? ({
        ...prev,
        messages: (prev.messages || []).filter((m) => m !== userMsg),
      }) : prev)
      setStreamingBubbles([])
    } finally {
      setSending(false)
    }
  }

  async function toggleMember(characterId, nextActive) {
    if (!groupChat) return
    try {
      const { groupChat: updated } = await api.patch(`/group-chats/${id}/members/${characterId}`, {
        isActive: nextActive,
      })
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
      setAddingMember(false)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/group-chats/${id}`)
      navigate('/chats', { replace: true })
    } catch (err) {
      console.error(err)
    }
  }

  if (!groupChat) {
    return (
      <div className="pt-10 text-center text-gray-500 text-sm">{t('common.loading', { defaultValue: '...' })}</div>
    )
  }

  const renderableMessages = (groupChat.messages || []).filter((m) => m.content || m.role === 'GENERATED_IMAGE')

  return (
    <div className="flex flex-col h-full relative">
      <Helmet>
        <title>{headerTitle || t('groupChat.title')}</title>
      </Helmet>

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-950">
        <button
          onClick={() => navigate('/chats')}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-800"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 멤버 아바타 콜라주 */}
        <button
          onClick={() => setShowMembers(true)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="flex -space-x-2">
            {(groupChat.members || []).slice(0, 4).map((m) => {
              const src = getNeutralImage(m.character)
              return (
                <div key={m.characterId} className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-950 overflow-hidden">
                  {src && <img src={src} alt="" className={`w-full h-full object-cover ${m.isActive ? '' : 'grayscale opacity-40'}`} />}
                </div>
              )
            })}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{headerTitle}</div>
            <div className="text-xs text-gray-500">{t('groupChat.members')}: {activeCount}/{(groupChat.members || []).length}</div>
          </div>
        </button>

        <button
          onClick={() => setShowDelete(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-800"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      {/* 유저 장소 + 동행/원격 그룹 (캐릭터 카드에 감정 포함) */}
      <div className="px-3 py-2 border-b border-gray-800 bg-gray-950/80 flex-shrink-0 space-y-2">
        <div className="text-[11px] text-gray-400">
          {t('groupChat.yourLocation')}: <span className="text-gray-100 font-medium">{groupChat.userLocation || '집'}</span>
        </div>

        {/* 함께 있음 */}
        <div>
          <div className="text-[10px] text-emerald-400 mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {t('groupChat.withYou')}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(groupChat.members || []).filter((m) => m.isWithUser).length === 0 ? (
              <span className="text-[10px] text-gray-600">-</span>
            ) : (
              (groupChat.members || []).filter((m) => m.isWithUser).map((m) => {
                const avatar = getNeutralImage(m.character)
                const mood = m.characterStatus?.mood
                const emoji = m.characterStatus?.emoji
                const excited = !!m.characterStatus?.isExcited
                return (
                  <div
                    key={m.characterId}
                    className={`relative flex-shrink-0 flex items-center gap-2 px-2 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 ${m.isActive ? '' : 'opacity-40'} ${excited ? 'ring-2 ring-pink-500/70 animate-pulse' : ''}`}
                    title={excited ? t('groupChat.excitedHint', { defaultValue: '흥분 상태' }) : ''}
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                      {avatar && <img src={avatar} alt="" className={`w-full h-full object-cover ${m.isActive ? '' : 'grayscale'}`} />}
                    </div>
                    <div className="min-w-0 max-w-[110px]">
                      <div className="text-[11px] text-emerald-100 leading-tight truncate flex items-center gap-0.5">
                        {m.character?.name}
                        {excited && <span className="text-pink-400">♥</span>}
                      </div>
                      <div className="text-[10px] text-emerald-200/70 leading-tight truncate">
                        {emoji ? <span className="mr-0.5">{emoji}</span> : null}
                        {mood || '-'}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 다른 장소 */}
        <div>
          <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            {t('groupChat.elsewhere')}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(groupChat.members || []).filter((m) => !m.isWithUser).length === 0 ? (
              <span className="text-[10px] text-gray-600">-</span>
            ) : (
              (groupChat.members || []).filter((m) => !m.isWithUser).map((m) => {
                const avatar = getNeutralImage(m.character)
                const mood = m.characterStatus?.mood
                const emoji = m.characterStatus?.emoji
                const excited = !!m.characterStatus?.isExcited
                return (
                  <div
                    key={m.characterId}
                    className={`relative flex-shrink-0 flex items-center gap-2 px-2 py-1.5 rounded-full bg-gray-900/70 border border-gray-800 ${m.isActive ? '' : 'opacity-40'} ${excited ? 'ring-2 ring-pink-500/70 animate-pulse' : ''}`}
                    title={excited ? t('groupChat.excitedHint', { defaultValue: '흥분 상태' }) : ''}
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                      {avatar && <img src={avatar} alt="" className={`w-full h-full object-cover ${m.isActive ? '' : 'grayscale'}`} />}
                    </div>
                    <div className="min-w-0 max-w-[110px]">
                      <div className="text-[11px] text-gray-300 leading-tight truncate flex items-center gap-0.5">
                        {m.character?.name}
                        {excited && <span className="text-pink-400">♥</span>}
                      </div>
                      <div className="text-[10px] text-gray-400 leading-tight truncate">
                        {emoji ? <span className="mr-0.5">{emoji}</span> : null}
                        {mood || '-'}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {renderableMessages.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-10">{t('groupChat.emptyMessages')}</div>
        )}
        {renderableMessages.map((msg, idx) => {
          if (msg.role === 'NARRATION') {
            return (
              <div key={idx} className="my-3 mx-4 px-3 py-2 bg-gray-900/70 rounded-lg text-center text-xs text-gray-300 italic leading-relaxed">
                {msg.content}
              </div>
            )
          }
          if (msg.role === 'USER') {
            const segs = parseMessageSegments(msg.content, 'USER')
            return (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[75%] px-3 py-2 rounded-2xl rounded-tr-md bg-indigo-600 text-white text-sm leading-relaxed whitespace-pre-wrap">
                  {segs.map((s, i) => (
                    <span key={i}>
                      {i > 0 && '\n\n'}
                      {s.type === 'action'
                        ? <span className="italic text-indigo-200/70">{s.value}</span>
                        : s.value}
                    </span>
                  ))}
                  <div className="text-[10px] text-indigo-200/70 mt-0.5 text-right">{formatChatTime(msg.createdAt)}</div>
                </div>
              </div>
            )
          }
          if (msg.role === 'CHARACTER') {
            const member = memberById.get(msg.characterId)
            const character = member?.character
            const avatar = getNeutralImage(character)
            const segs = parseMessageSegments(msg.content, 'CHARACTER')
            return (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                  {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="max-w-[75%]">
                  <div className="text-xs text-gray-400 mb-0.5">{character?.name || '...'}</div>
                  <div className="px-3 py-2 rounded-2xl rounded-tl-md bg-gray-800 text-white text-sm leading-relaxed whitespace-pre-wrap">
                    {segs.map((s, i) => (
                      <span key={i}>
                        {i > 0 && '\n\n'}
                        {s.type === 'action'
                          ? <span className="italic text-gray-400/80">{s.value}</span>
                          : s.value}
                      </span>
                    ))}
                    {msg.audioUrl && (
                      <audio controls src={msg.audioUrl} className="block mt-1 w-full h-8" />
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{formatChatTime(msg.createdAt)}</div>
                </div>
              </div>
            )
          }
          return null
        })}

        {/* 대기 버블 — 메시지 전송 직후 첫 delta가 오기 전까지의 빈 구간 */}
        {sending && streamingBubbles.length === 0 && (
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex-shrink-0" />
            <div className="px-3 py-2.5 rounded-2xl rounded-tl-md bg-gray-800 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* 스트리밍 중인 버블 — done 이벤트로 실제 메시지에 머지될 때까지 렌더 */}
        {streamingBubbles.map((b, idx) => {
          if (b.role === 'NARRATION') {
            return (
              <div key={`s-${b.turnIdx}-${b.bubbleIdx}`} className="my-3 mx-4 px-3 py-2 bg-gray-900/70 rounded-lg text-center text-xs text-gray-300 italic leading-relaxed">
                {b.content}
                {!b.complete && <span className="ml-1 animate-pulse text-gray-500">▍</span>}
              </div>
            )
          }
          const member = memberById.get(b.characterId)
          const character = member?.character
          const avatar = getNeutralImage(character)
          const segs = parseMessageSegments(b.content, 'CHARACTER')
          return (
            <div key={`s-${b.turnIdx}-${b.bubbleIdx}`} className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="max-w-[75%]">
                <div className="text-xs text-gray-400 mb-0.5">{character?.name || '...'}</div>
                <div className="px-3 py-2 rounded-2xl rounded-tl-md bg-gray-800 text-white text-sm leading-relaxed whitespace-pre-wrap">
                  {segs.map((s, i) => (
                    <span key={i}>
                      {i > 0 && '\n\n'}
                      {s.type === 'action'
                        ? <span className="italic text-gray-400/80">{s.value}</span>
                        : s.value}
                    </span>
                  ))}
                  {!b.complete && <span className="ml-0.5 animate-pulse text-gray-400">▍</span>}
                </div>
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 바 */}
      <div
        className="border-t border-gray-800 bg-gray-950 p-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {activeCount === 0 && (
          <div className="mb-2 text-xs text-amber-400">{t('groupChat.noActiveMembers')}</div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder=""
            rows={1}
            className="flex-1 h-10 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
          />
          <button
            onClick={insertActionParens}
            type="button"
            title={t('groupChat.actionButton', { defaultValue: '행동 묘사 ( ) 추가' })}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-[15px] font-mono leading-none">( )</span>
          </button>
          <div className="relative flex-shrink-0">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-amber-400 flex items-center gap-0.5">
              -{GROUP_MESSAGE_MASK_COST} <MaskIcon className="text-base" />
            </span>
            <button
              onClick={handleSend}
              disabled={sending || !input.trim() || activeCount === 0}
              className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* 멤버 관리 패널 — 컨테이너 안 absolute */}
      {showMembers && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end" onClick={() => setShowMembers(false)}>
          <div
            className="w-full max-w-[480px] mx-auto bg-gray-900 rounded-t-2xl border-t border-gray-800 p-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">{t('groupChat.members')}</h3>
              <button
                onClick={() => setShowMembers(false)}
                className="text-gray-400 hover:text-white text-sm"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {(groupChat.members || []).map((m) => {
                const avatar = getNeutralImage(m.character)
                return (
                  <div key={m.characterId} className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/40">
                    <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
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
                      className={`relative w-10 h-6 rounded-full transition-colors ${m.isActive ? 'bg-indigo-600' : 'bg-gray-700'}`}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${m.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    {groupChat.members.length > MIN_MEMBERS && (
                      <button
                        onClick={() => removeMember(m.characterId)}
                        className="text-red-400 text-xs hover:text-red-300 px-2 py-1"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {t('groupChat.removeMember')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {groupChat.members.length < MAX_MEMBERS && (
              <button
                onClick={() => setAddingMember(true)}
                className="w-full py-2.5 rounded-xl bg-gray-800 text-white text-sm hover:bg-gray-700"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                + {t('groupChat.addMember')}
              </button>
            )}
            {groupChat.members.length <= MIN_MEMBERS && (
              <p className="text-xs text-gray-500 mt-2 text-center">{t('groupChat.minMembersWarning')}</p>
            )}
          </div>
        </div>
      )}

      {/* 멤버 추가 모달 */}
      {addingMember && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-center justify-center px-4" onClick={() => setAddingMember(false)}>
          <div
            className="w-full max-w-[420px] bg-gray-900 rounded-2xl border border-gray-800 p-4 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">{t('groupChat.addMember')}</h3>
              <button
                onClick={() => setAddingMember(false)}
                className="text-gray-400 hover:text-white text-sm"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {allCharacters
                .filter((c) => !memberById.has(c.id))
                .map((c) => {
                  const thumb = c.styles?.[0]?.images?.[0]
                  const thumbUrl = getImageUrl(c.profileImage) || getImageUrl(thumb?.filePath)
                  return (
                    <button
                      key={c.id}
                      onClick={() => addMember(c.id)}
                      className="rounded-xl overflow-hidden border border-gray-800 hover:border-indigo-500"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
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
          </div>
        </div>
      )}

      {/* 삭제 모달 */}
      {showDelete && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={() => setShowDelete(false)}>
          <div
            className="w-full max-w-[420px] bg-gray-900 rounded-2xl border border-gray-700 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">{t('groupChat.deleteTitle')}</h3>
            <p className="text-sm text-gray-400 mb-5">{t('groupChat.deleteDescription')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
