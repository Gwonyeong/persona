import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import GalleryBottomSheet from '../../components/GalleryBottomSheet'
import { getPushPermissionStatus, requestPushPermission } from '../../lib/push'
import useBackHandler from '../../hooks/useBackHandler'
// import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const period = h < 12 ? '오전' : '오후'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${period} ${hour12}:${m}`
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

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showTyping, setShowTyping] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [suggestedReplies, setSuggestedReplies] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const pushPromptShownRef = useRef(false)
  const messagesEndRef = useRef(null)
  const initialLoadRef = useRef(true)
  const token = useStore((s) => s.token)
  const [currentUser, setCurrentUser] = useState(null)

  // 모달/오버레이 뒤로가기 처리
  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(showLoginModal, () => setShowLoginModal(false))
  useBackHandler(showPushPrompt, () => setShowPushPrompt(false))
  useBackHandler(showGallery, () => setShowGallery(false))

  useEffect(() => {
    initialLoadRef.current = true
    api.get(`/conversations/${id}/messages`).then(({ conversation: conv }) => {
      setConversation(conv)
      setMessages(conv.messages.filter((m) => m.role === 'CHARACTER' || m.role === 'USER'))
      const lastCharMsg = [...conv.messages].reverse().find((m) => m.role === 'CHARACTER')
      if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
      if (lastCharMsg?.suggestedReplies?.length) setSuggestedReplies(lastCharMsg.suggestedReplies)
      // 초기 로드 시 즉시 맨 아래로
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
        initialLoadRef.current = false
      })
    })
    if (token) {
      api.get('/auth/me').then(({ user }) => setCurrentUser(user)).catch(() => {})
    }
  }, [id])

  // 채팅 페이지에 있는 동안 주기적으로 읽음 처리 (heartbeat)
  useEffect(() => {
    // 진입 시 즉시 읽음 처리
    api.post(`/conversations/${id}/read`).catch(() => {})

    const interval = setInterval(() => {
      api.post(`/conversations/${id}/read`).catch(() => {})
    }, 5000) // 5초마다

    return () => {
      clearInterval(interval)
      // 퇴장 시 keepalive fetch로 확실하게 읽음 처리 (탭 종료에도 전송 보장)
      api.post(`/conversations/${id}/read`, {}, { keepalive: true }).catch(() => {})
      window.dispatchEvent(new CustomEvent('chat-exited', { detail: { conversationId: parseInt(id), at: Date.now() } }))
    }
  }, [id])

  useEffect(() => {
    if (!initialLoadRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, showTyping])

  // 모바일 키보드가 열릴 때 컨테이너를 visualViewport에 맞춤 (헤더/버블이 화면 밖으로 벗어나지 않도록)
  const [viewportStyle, setViewportStyle] = useState({})
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handleResize = () => {
      setViewportStyle({
        height: `${vv.height}px`,
        top: `${vv.offsetTop}px`,
      })
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)
    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
    }
  }, [])

  const FREE_CHAT_LIMIT = 3

  const send = async () => {
    if (!input.trim() || sending) return
    if (!token) {
      const userMsgCount = messages.filter((m) => m.role === 'USER').length
      if (userMsgCount >= FREE_CHAT_LIMIT) { setShowLoginModal(true); return }
    }
    const text = input.trim()
    setInput('')
    setSending(true)
    setShowSuggestions(false)
    setSuggestedReplies([])
    const tempUserMsg = { id: Date.now(), role: 'USER', content: text }
    setMessages((prev) => [...prev, tempUserMsg])

    setShowTyping(true)
    const confirmedUserMsg = { role: 'USER', content: text, createdAt: new Date().toISOString() }
    try {
      await api.stream(`/conversations/${id}/messages`, { content: text }, (event, data) => {
        switch (event) {
          case 'message': {
            setShowTyping(false)
            setMessages((prev) => {
              const withoutTemp = prev.some((m) => m.id === tempUserMsg.id)
                ? [...prev.filter((m) => m.id !== tempUserMsg.id), confirmedUserMsg]
                : prev
              return [...withoutTemp, { role: 'CHARACTER', content: data.content, streaming: true }]
            })
            // 다음 메시지를 위해 다시 typing 표시
            setTimeout(() => setShowTyping(true), 0)
            break
          }
          case 'done': {
            const { responseMessages } = data
            const charMsgs = responseMessages.filter((m) => m.role === 'CHARACTER')
            // 호감도가 오른 경우 마지막 캐릭터 메시지에 표시
            if (data.affinityChange > 0 && charMsgs.length > 0) {
              charMsgs[charMsgs.length - 1] = { ...charMsgs[charMsgs.length - 1], affinityUp: true }
            }
            setMessages((prev) => {
              // streaming 버블과 tempUserMsg 제거, confirmedUserMsg는 유지
              const cleaned = prev.filter((m) => !m.streaming && m.id !== tempUserMsg.id)
              // confirmedUserMsg가 아직 없으면 추가
              const hasUser = cleaned.some((m) => m === confirmedUserMsg || (m.role === 'USER' && m.content === text && m.createdAt === confirmedUserMsg.createdAt))
              return [
                ...cleaned,
                ...(!hasUser ? [confirmedUserMsg] : []),
                ...charMsgs,
              ]
            })
            const lastCharMsg = charMsgs[charMsgs.length - 1]
            if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
            if (lastCharMsg?.suggestedReplies?.length) setSuggestedReplies(lastCharMsg.suggestedReplies)
            setShowTyping(false)
            setSending(false)
            if (!pushPromptShownRef.current && token) {
              getPushPermissionStatus().then((status) => {
                if (status === 'default') {
                  pushPromptShownRef.current = true
                  setShowPushPrompt(true)
                }
              })
            }
            if (data.affinity !== undefined) {
              setConversation((prev) => ({ ...prev, affinity: data.affinity }))
            }
            break
          }
          case 'error':
            console.error('Stream error:', data)
            setMessages((prev) => prev.filter((m) => !m.streaming && m.id !== tempUserMsg.id))
            setShowTyping(false)
            setSending(false)
            break
        }
      })
    } catch (error) {
      console.error(error)
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
      setShowTyping(false)
      setSending(false)
      if (error.message?.includes('Insufficient masks')) {
        navigate('/my')
      }
    }
  }

  if (!conversation) {
    return <div className="flex items-center justify-center h-screen text-gray-400">로딩 중...</div>
  }

  const { character } = conversation
  const currentStyle = character.styles.find((s) => s.id === conversation.currentStyleId) || character.styles[0]
  const profileImage = character.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
  const profileUrl = getImageUrl(profileImage?.filePath)
  const onlineStatus = getCharacterOnlineStatus(character.activeHours)

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20" style={{ top: viewportStyle.top || '0px', height: viewportStyle.height || '100%' }}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button
          onClick={() => navigate(`/characters/${conversation.characterId}`)}
          className="flex items-center gap-3 flex-1 min-w-0"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
              {profileUrl ? <img src={profileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>}
            </div>
            {onlineStatus === 'free' && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />}
          </div>
          <div>
            <span className="font-semibold text-sm text-white block">{character.name}</span>
            {onlineStatus === 'free' && <p className="text-[10px] text-green-400">활동 중</p>}
          </div>
        </button>
        <span className="text-[11px] text-gray-500 font-mono">❤️ {conversation.affinity ?? 0}</span>
      </header>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
        {/* <div className="py-1"><AdBanner slot="8921302150" /></div> */}
        {messages.map((msg, idx) => {
          const prevMsg = messages[idx - 1]
          const isConsecutive = prevMsg?.role === msg.role
          return (
            <div key={msg.id || idx} className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'} ${isConsecutive ? '' : 'mt-3'}`}>
              {msg.role === 'CHARACTER' && (
                <div className="w-7 flex-shrink-0 mr-2">
                  {!isConsecutive ? (
                    <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden cursor-pointer" onClick={() => profileUrl && setLightboxUrl(profileUrl)}>
                      {profileUrl ? <img src={profileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>}
                    </div>
                  ) : null}
                </div>
              )}
              <div className="max-w-[75%]">
                {msg.role === 'CHARACTER' && !isConsecutive && <p className="text-xs text-gray-400 mb-1 font-medium">{character.name}</p>}
                <div className={`text-sm leading-relaxed px-3.5 py-2.5 ${msg.role === 'USER' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none' : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'}`}>
                  {msg.content}
                </div>
                {msg.createdAt && <p className={`text-[10px] text-gray-600 mt-1 px-1 ${msg.role === 'USER' ? 'text-right' : ''}`}>{formatTime(msg.createdAt)}</p>}
                {msg.affinityUp && <p className="text-[11px] text-pink-400 mt-1 px-1">{character.name}의 호감도가 올랐어요!</p>}
              </div>
            </div>
          )
        })}
        {showTyping && (
          <div className="flex justify-start mt-3">
            <div className="w-7 flex-shrink-0 mr-2">
              <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden">
                {profileUrl ? <img src={profileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>}
              </div>
            </div>
            <div className="bg-gray-800/80 rounded-2xl rounded-tl-none px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 갤러리 플로팅 버튼 */}
      <button
        onClick={() => setShowGallery(true)}
        className="absolute z-10 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-lg transition-colors"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', right: 16, bottom: 80 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>

      <div className="p-3 border-t border-gray-800 bg-gray-900/95 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {showSuggestions && suggestedReplies.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {suggestedReplies.map((reply, i) => (
              <button key={i} onClick={() => { setInput(reply); setShowSuggestions(false) }} className="text-left text-sm px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 hover:bg-gray-700 hover:border-indigo-500 transition-colors" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                {reply}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} placeholder="메시지를 입력하세요..." rows={1} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none" />
          {suggestedReplies.length > 0 && (
            <button onClick={() => setShowSuggestions((prev) => !prev)} className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${showSuggestions ? 'bg-indigo-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><line x1="9" y1="10" x2="15" y2="10" /></svg>
            </button>
          )}
          <button onClick={send} disabled={!input.trim() || sending} className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>
      </div>
      {showPushPrompt && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowPushPrompt(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <p className="text-white font-semibold text-center mb-1">{character.name}의 답장을 놓치지 마세요</p>
            <p className="text-gray-400 text-sm text-center mb-5">알림을 켜면 새 메시지를 바로 확인할 수 있어요</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPushPrompt(false)}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                다음에
              </button>
              <button
                onClick={async () => {
                  await requestPushPermission()
                  setShowPushPrompt(false)
                }}
                className="flex-1 py-2.5 text-sm text-white bg-indigo-600 rounded-xl font-semibold"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                알림 켜기
              </button>
            </div>
          </div>
        </div>
      )}
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      {showGallery && (
        <GalleryBottomSheet
          characterId={conversation.characterId}
          characterName={character.name}
          affinity={conversation.affinity ?? 0}
          onClose={() => setShowGallery(false)}
        />
      )}
      {lightboxUrl && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  )
}
