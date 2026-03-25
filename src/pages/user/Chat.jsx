import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import { getPushPermissionStatus, requestPushPermission } from '../../lib/push'
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
  const pushPromptShownRef = useRef(false)
  const messagesEndRef = useRef(null)
  const initialLoadRef = useRef(true)
  const token = useStore((s) => s.token)
  const [currentUser, setCurrentUser] = useState(null)

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

  // 모바일 키보드가 열릴 때 마지막 메시지가 보이도록 스크롤
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handleResize = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    vv.addEventListener('resize', handleResize)
    return () => vv.removeEventListener('resize', handleResize)
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

    try {
      await api.stream(`/conversations/${id}/messages`, { content: text }, (event, data) => {
        switch (event) {
          case 'done': {
            const { responseMessages } = data
            const charMsgs = responseMessages.filter((m) => m.role === 'CHARACTER')
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== tempUserMsg.id),
              { role: 'USER', content: text, createdAt: new Date().toISOString() },
            ])
            const initialDelay = data.delay || 0
            const TYPING_LEAD_TIME = 10000
            const showSequentially = async () => {
              if (initialDelay > TYPING_LEAD_TIME) {
                await new Promise((r) => setTimeout(r, initialDelay - TYPING_LEAD_TIME))
                setShowTyping(true)
                await new Promise((r) => setTimeout(r, TYPING_LEAD_TIME))
              } else {
                setShowTyping(true)
                if (initialDelay > 0) {
                  await new Promise((r) => setTimeout(r, initialDelay))
                }
              }
              const isFree = data.status === 'free'
              for (let i = 0; i < charMsgs.length; i++) {
                const typingDelay = isFree
                  ? 300 + Math.min(charMsgs[i].content.length * 20, 2000)
                  : 800 + Math.min(charMsgs[i].content.length * 60, 9200)
                await new Promise((r) => setTimeout(r, typingDelay))
                setMessages((prev) => [...prev, charMsgs[i]])
              }
              const lastCharMsg = charMsgs[charMsgs.length - 1]
              if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
              if (lastCharMsg?.suggestedReplies?.length) setSuggestedReplies(lastCharMsg.suggestedReplies)
              setShowTyping(false)
              setSending(false)
              // 첫 응답 후 알림 권한이 없으면 유도 프롬프트 표시
              if (!pushPromptShownRef.current && token && getPushPermissionStatus() === 'default') {
                pushPromptShownRef.current = true
                setShowPushPrompt(true)
              }
            }
            showSequentially()
            // 호감도 갱신
            if (data.affinity !== undefined) {
              setConversation((prev) => ({ ...prev, affinity: data.affinity }))
            }
            break
          }
          case 'error':
            console.error('Stream error:', data)
            setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
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
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0">
        <button onClick={() => navigate('/chats')} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
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
        {import.meta.env.DEV && (
          <span className="text-[11px] text-gray-500 font-mono">❤️ {conversation.affinity ?? 0}</span>
        )}
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

      <div className="p-3 border-t border-gray-800 bg-gray-900/95 flex-shrink-0">
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
      {lightboxUrl && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  )
}
