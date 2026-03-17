import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function renderContent(text) {
  // *텍스트* -> 이탤릭 (행동/상태 묘사)
  return text.split(/(\*[^*]+\*)/).map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="text-gray-400 not-italic text-xs block my-5">
          {part.slice(1, -1)}
        </em>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [suggestedReplies, setSuggestedReplies] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [streamingSegments, setStreamingSegments] = useState([])
  const streamingRef = useRef({ segments: [], currentType: null, currentContent: '' })
  const messagesEndRef = useRef(null)
  const token = useStore((s) => s.token)

  useEffect(() => {
    api.get(`/conversations/${id}/messages`).then(({ conversation: conv }) => {
      setConversation(conv)
      setMessages(conv.messages)
      // 마지막 캐릭터 메시지의 감정
      const lastCharMsg = [...conv.messages].reverse().find((m) => m.role === 'CHARACTER')
      if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
      if (lastCharMsg?.suggestedReplies?.length) setSuggestedReplies(lastCharMsg.suggestedReplies)
    })
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingSegments])

  const send = async () => {
    if (!input.trim() || sending) return
    if (!token) {
      setShowLoginModal(true)
      return
    }
    const text = input.trim()
    setInput('')
    setSending(true)
    setShowSuggestions(false)
    setSuggestedReplies([])

    // 낙관적 UI 업데이트 - 유저 메시지 추가
    const tempUserMsg = { id: Date.now(), role: 'USER', content: text }
    setMessages((prev) => [...prev, tempUserMsg])

    // 스트리밍 상태 초기화
    streamingRef.current = { segments: [], currentType: null, currentContent: '' }
    setStreamingSegments([])

    try {
      await api.stream(`/conversations/${id}/messages`, { content: text }, (event, data) => {
        const ref = streamingRef.current

        switch (event) {
          case 'segment_start':
            ref.currentType = data.segmentType
            ref.currentContent = ''
            break

          case 'content_delta':
            ref.currentContent += data.content
            // 현재까지의 segments + 진행 중인 segment를 합쳐서 렌더링
            setStreamingSegments([
              ...ref.segments,
              { type: ref.currentType, content: ref.currentContent },
            ])
            break

          case 'segment_end':
            ref.segments.push({ type: ref.currentType, content: ref.currentContent })
            ref.currentType = null
            ref.currentContent = ''
            break

          case 'done': {
            // 스트리밍 완료 - 최종 메시지로 교체
            const { responseMessages } = data
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== tempUserMsg.id),
              { role: 'USER', content: text, createdAt: new Date().toISOString() },
              ...responseMessages,
            ])
            setStreamingSegments([])
            streamingRef.current = { segments: [], currentType: null, currentContent: '' }

            const lastCharMsg = [...responseMessages].reverse().find((m) => m.role === 'CHARACTER')
            if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
            if (lastCharMsg?.suggestedReplies?.length) {
              setSuggestedReplies(lastCharMsg.suggestedReplies)
            }
            setSending(false)
            break
          }

          case 'error':
            console.error('Stream error:', data)
            setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
            setStreamingSegments([])
            setSending(false)
            break
        }
      })
    } catch (error) {
      console.error(error)
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
      setStreamingSegments([])
      setSending(false)
    }
  }

  if (!conversation) {
    return <div className="flex items-center justify-center h-screen text-gray-400">로딩 중...</div>
  }

  const { character } = conversation

  // 현재 감정에 맞는 스프라이트 이미지 찾기
  const currentStyle =
    character.styles.find((s) => s.id === conversation.currentStyleId) || character.styles[0]
  const spriteImage = currentStyle?.images?.find((i) => i.emotion === currentEmotion)
    || currentStyle?.images?.find((i) => i.emotion === 'NEUTRAL')
  const spriteUrl = getImageUrl(spriteImage?.filePath)

  // 프로필 이미지 (NEUTRAL)
  const profileImage = character.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
  const profileUrl = getImageUrl(profileImage?.filePath)

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* 헤더 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
          {profileUrl ? (
            <img src={profileUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
          )}
        </div>
        <span className="font-semibold text-sm text-white">{character.name}</span>
      </header>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.map((msg) => {
          // 나레이션 메시지
          if (msg.role === 'NARRATION') {
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <p className="text-gray-500 text-xs leading-relaxed pt-1">
                  {msg.content}
                </p>
              </div>
            )
          }

          // 첫 번째 CHARACTER 메시지에만 이미지 표시
          const isFirstCharMsg = msg.role === 'CHARACTER' && messages.findIndex((m) => m.role === 'CHARACTER') === messages.indexOf(msg)
          const msgEmotion = isFirstCharMsg ? (msg.emotion || 'NEUTRAL') : null
          const msgImage = msgEmotion
            ? currentStyle?.images?.find((i) => i.emotion === msgEmotion)
              || currentStyle?.images?.find((i) => i.emotion === 'NEUTRAL')
            : null
          const msgImageUrl = getImageUrl(msgImage?.filePath)

          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'CHARACTER' && (
                <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 mr-2 mt-1">
                  {profileUrl ? (
                    <img src={profileUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>
                  )}
                </div>
              )}
              <div className="max-w-[75%]">
                {msg.role === 'CHARACTER' && (
                  <p className="text-xs text-gray-400 mb-1 font-medium">{character.name}</p>
                )}
                {/* 첫 캐릭터 메시지에만 감정 이미지 표시 */}
                {isFirstCharMsg && msgImageUrl && (
                  <div
                    className="rounded-2xl overflow-hidden mb-1.5 cursor-pointer"
                    onClick={() => setLightboxUrl(msgImageUrl)}
                  >
                    <img src={msgImageUrl} alt={msgEmotion} className="w-full aspect-[9/16] object-cover" />
                  </div>
                )}
                <div
                  className={`text-sm leading-relaxed px-3.5 py-2.5 ${
                    msg.role === 'USER'
                      ? 'bg-indigo-600 text-white rounded-2xl rounded-br-none'
                      : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'
                  }`}
                >
                  {renderContent(msg.content)}
                </div>
              </div>
            </div>
          )
        })}
        {sending && streamingSegments.length > 0 && streamingSegments.map((seg, idx) => (
          seg.type === 'narration' ? (
            <div key={`stream-${idx}`} className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed pt-1">
                {seg.content}
              </p>
            </div>
          ) : (
            <div key={`stream-${idx}`} className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 mr-2 mt-1">
                {profileUrl ? (
                  <img src={profileUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>
                )}
              </div>
              <div className="max-w-[75%]">
                <p className="text-xs text-gray-400 mb-1 font-medium">{character.name}</p>
                <div className="text-sm leading-relaxed px-3.5 py-2.5 bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none">
                  {renderContent(seg.content)}
                </div>
              </div>
            </div>
          )
        ))}
        {sending && streamingSegments.length === 0 && (
          <div className="flex justify-start">
            <div className="w-7 h-7 mr-2" />
            <div className="bg-gray-800/80 rounded-2xl rounded-bl-md px-4 py-3">
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

      {/* 입력 영역 */}
      <div className="p-3 border-t border-gray-800 bg-gray-900/95">
        {/* 추천 답변 팝오버 */}
        {showSuggestions && suggestedReplies.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {suggestedReplies.map((reply, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(reply)
                  setShowSuggestions(false)
                }}
                className="text-left text-sm px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 hover:bg-gray-700 hover:border-indigo-500 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {reply}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
            placeholder="메시지를 입력하세요..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />
          {suggestedReplies.length > 0 && (
            <button
              onClick={() => setShowSuggestions((prev) => !prev)}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                showSuggestions
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="10" x2="15" y2="10" />
              </svg>
            </button>
          )}
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
