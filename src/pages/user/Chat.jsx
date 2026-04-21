import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import GalleryBottomSheet from '../../components/GalleryBottomSheet'
import { getPushPermissionStatus, requestPushPermission } from '../../lib/push'
import useBackHandler from '../../hooks/useBackHandler'
import { formatChatTime } from '../../lib/timeFormat'
// import AdBanner from '../../components/AdBanner'

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
  const [attachedFeed, setAttachedFeed] = useState(null)
  const [backgroundImage, setBackgroundImage] = useState(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [showImageGenModal, setShowImageGenModal] = useState(false)
  const [errorToast, setErrorToast] = useState(null)
  const errorTimerRef = useRef(null)
  const pushPromptShownRef = useRef(false)
  const messagesEndRef = useRef(null)
  const initialLoadRef = useRef(true)
  const token = useStore((s) => s.token)
  const [currentUser, setCurrentUser] = useState(null)
  const { t } = useTranslation()

  // 모달/오버레이 뒤로가기 처리
  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(showLoginModal, () => setShowLoginModal(false))
  useBackHandler(showPushPrompt, () => setShowPushPrompt(false))
  useBackHandler(showGallery, () => setShowGallery(false))
  useBackHandler(showImageGenModal, () => setShowImageGenModal(false))

  const showError = (msg) => {
    setErrorToast(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setErrorToast(null), 3000)
  }

  useEffect(() => {
    initialLoadRef.current = true
    api.get(`/conversations/${id}/messages`).then(({ conversation: conv }) => {
      setConversation(conv)
      setBackgroundImage(conv.backgroundImage || null)
      setMessages(conv.messages.filter((m) => m.role === 'CHARACTER' || m.role === 'USER' || m.role === 'GENERATED_IMAGE'))
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
    const feedToSend = attachedFeed
    setInput('')
    setSending(true)
    setShowSuggestions(false)
    setSuggestedReplies([])
    setAttachedFeed(null)
    const feedImage = feedToSend?.images?.[0]?.filePath || null
    const tempUserMsg = { id: Date.now(), role: 'USER', content: text, feedImage }
    setMessages((prev) => [...prev, tempUserMsg])

    setShowTyping(true)
    const confirmedUserMsg = { role: 'USER', content: text, createdAt: new Date().toISOString(), feedImage }
    const body = { content: text }
    if (feedToSend) body.feedPostId = feedToSend.id
    try {
      await api.stream(`/conversations/${id}/messages`, body, (event, data) => {
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
            showError(data?.refunded ? t('chat.errorRefunded') : t('chat.errorSend'))
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
      } else {
        showError(t('chat.errorSend'))
      }
    }
  }

  const handleGenerateImage = async () => {
    if (generatingImage || !token) return
    setShowImageGenModal(false)
    setGeneratingImage(true)
    try {
      const { generatedImage } = await api.post(`/conversations/${id}/generate-image`)
      setMessages((prev) => [...prev, {
        role: 'GENERATED_IMAGE',
        content: generatedImage.filePath,
        createdAt: new Date().toISOString(),
        generatedImageId: generatedImage.id,
      }])
    } catch (error) {
      console.error('Image generation error:', error)
      if (error.message?.includes('Insufficient masks')) {
        navigate('/my')
      } else {
        showError(t('chat.errorImageGen'))
      }
    } finally {
      setGeneratingImage(false)
    }
  }

  if (!conversation) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('common.loading')}</div>
  }

  const { character } = conversation
  const currentStyle = character.styles.find((s) => s.id === conversation.currentStyleId) || character.styles[0]
  const profileImg = character.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
  const profileUrl = getImageUrl(character.profileImage) || getImageUrl(profileImg?.filePath)
  const onlineStatus = getCharacterOnlineStatus(character.activeHours)

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20" style={{ top: viewportStyle.top || '0px', height: viewportStyle.height || '100%' }}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0" style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}>
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
            {onlineStatus === 'free' && <p className="text-[10px] text-green-400">{t('chat.online')}</p>}
          </div>
        </button>
        <span className="text-[11px] text-gray-500 font-mono">❤️ {conversation.affinity ?? 0}</span>
      </header>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-2 relative" style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {/* <div className="py-1"><AdBanner slot="8921302150" /></div> */}
        {messages.map((msg, idx) => {
          if (msg.role === 'GENERATED_IMAGE') {
            return (
              <div key={msg.id || idx} className="flex justify-center mt-3">
                <div className="max-w-[75%] rounded-2xl overflow-hidden" onClick={() => setLightboxUrl(msg.content)}>
                  <img src={msg.content} alt="" className="w-full object-cover cursor-pointer" loading="lazy" />
                  <div className="bg-gray-800/80 px-3 py-1.5 flex items-center justify-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M8.757 15.243l-2.121 2.121m12.728 0l-2.121-2.121M8.757 8.757L6.636 6.636" />
                    </svg>
                    <span className="text-[11px] text-purple-400">{t('chat.aiGeneratedImage')}</span>
                  </div>
                </div>
              </div>
            )
          }
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
                {msg.feedImage && (
                  <div className="mb-1.5 rounded-2xl rounded-tr-none overflow-hidden">
                    <img
                      src={msg.feedImage}
                      alt=""
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className={`text-sm leading-relaxed px-3.5 py-2.5 ${msg.role === 'USER' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none' : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'}`}>
                  {msg.content}
                </div>
                {msg.createdAt && <p className={`text-[10px] text-gray-600 mt-1 px-1 ${msg.role === 'USER' ? 'text-right' : ''}`}>{formatChatTime(msg.createdAt)}</p>}
                {msg.affinityUp && <p className="text-[11px] text-pink-400 mt-1 px-1">{t('chat.affinityUp', { name: character.name })}</p>}
              </div>
            </div>
          )
        })}
        {generatingImage && (
          <div className="flex justify-center mt-3">
            <div className="bg-gray-800/80 rounded-2xl px-4 py-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              <span className="text-sm text-purple-400">{t('chat.generatingImage')}</span>
            </div>
          </div>
        )}
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

      <div className="relative flex-shrink-0">
        {/* 플로팅 버튼들 */}
        <div className="absolute z-10 flex gap-2" style={{ right: 16, bottom: '100%', marginBottom: 12 }}>
          <button
            onClick={() => setShowImageGenModal(true)}
            disabled={generatingImage || !token}
            className="w-11 h-11 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 flex items-center justify-center shadow-lg transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {generatingImage ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M8.757 15.243l-2.121 2.121m12.728 0l-2.121-2.121M8.757 8.757L6.636 6.636" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setShowGallery(true)}
            className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-lg transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
        </div>

      <div className="p-3 border-t border-gray-800 bg-gray-900/95" style={{ paddingBottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 8px)' }}>
        {attachedFeed && (
          <div className="mb-2 flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
            <img
              src={attachedFeed.images?.[0]?.filePath}
              alt=""
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-indigo-400 font-medium">{t('chat.feedAttached')}</p>
              <p className="text-xs text-gray-400 truncate">{attachedFeed.caption || t('chat.feedPost')}</p>
            </div>
            <button
              onClick={() => setAttachedFeed(null)}
              className="text-gray-500 hover:text-white flex-shrink-0"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
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
          <textarea value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} placeholder={t('chat.inputPlaceholder')} rows={1} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none" />
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
      </div>
      {showImageGenModal && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowImageGenModal(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M8.757 15.243l-2.121 2.121m12.728 0l-2.121-2.121M8.757 8.757L6.636 6.636" />
                </svg>
              </div>
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.imageGenTitle')}</p>
            <p className="text-gray-400 text-sm text-center mb-5">
              {t('chat.imageGenDesc', { name: character.name })}
              <br />
              <span className="text-purple-400 font-medium">{t('chat.imageGenCost', { count: 5 })}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImageGenModal(false)}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGenerateImage}
                className="flex-1 py-2.5 text-sm text-white bg-purple-600 rounded-xl font-semibold"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.generate')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showPushPrompt && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowPushPrompt(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.pushTitle', { name: character.name })}</p>
            <p className="text-gray-400 text-sm text-center mb-5">{t('chat.pushDesc')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPushPrompt(false)}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('chat.pushLater')}
              </button>
              <button
                onClick={async () => {
                  await requestPushPermission()
                  setShowPushPrompt(false)
                }}
                className="flex-1 py-2.5 text-sm text-white bg-indigo-600 rounded-xl font-semibold"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('chat.pushEnable')}
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
          conversationId={conversation.id}
          affinity={conversation.affinity ?? 0}
          onClose={() => setShowGallery(false)}
          onAttachFeed={(feed) => setAttachedFeed(feed)}
          onBackgroundChange={(url) => setBackgroundImage(url)}
        />
      )}
      {lightboxUrl && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
      {errorToast && (
        <div className="absolute top-16 left-4 right-4 z-50 flex justify-center" style={{ pointerEvents: 'none' }}>
          <div
            className="bg-red-600/90 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
            onClick={() => setErrorToast(null)}
          >
            {errorToast}
          </div>
        </div>
      )}
    </div>
  )
}
