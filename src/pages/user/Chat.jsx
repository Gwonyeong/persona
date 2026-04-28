import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
import GalleryBottomSheet from '../../components/GalleryBottomSheet'
import ReportModal from '../../components/ReportModal'
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

function getDefaultStatus(activeHours) {
  const hour = new Date().getHours()
  if (!activeHours?.schedule) {
    return { emoji: '💬', mood: '-', location: '-', activity: '-' }
  }
  const slot = activeHours.schedule.find((s) => {
    if (s.start < s.end) return hour >= s.start && hour < s.end
    return hour >= s.start || hour < s.end
  })
  const status = slot?.status || 'free'
  const label = slot?.label || null
  if (status === 'sleep') return { emoji: '😴', mood: '수면 중', location: '-', activity: label || '잠자는 중' }
  if (status === 'busy') return { emoji: '🔒', mood: '바쁨', location: '-', activity: label || '바쁜 중' }
  return { emoji: '🟢', mood: '여유', location: '-', activity: label || '자유 시간' }
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
  const [showGalleryTooltip, setShowGalleryTooltip] = useState(false)
  const [galleryTooltipText, setGalleryTooltipText] = useState('')
  const [showGalleryBadge, setShowGalleryBadge] = useState(false)
  const affinityThresholdsRef = useRef([])
  const [showImageGenModal, setShowImageGenModal] = useState(false)
  const [showSelfieModal, setShowSelfieModal] = useState(false)
  const [previewFeedImages, setPreviewFeedImages] = useState([])
  const [characterStatus, setCharacterStatus] = useState(null)
  const [showStatusPanel, setShowStatusPanel] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [showVoicePremiumModal, setShowVoicePremiumModal] = useState(false)
  const [generatingTTS, setGeneratingTTS] = useState(false)
  const [playingAudioIdx, setPlayingAudioIdx] = useState(null)
  const audioRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingQueueRef = useRef(false)
  const playbackTimeoutRef = useRef(null)
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [errorToast, setErrorToast] = useState(null)
  const errorTimerRef = useRef(null)
  const pushPromptShownRef = useRef(false)
  const messagesEndRef = useRef(null)
  const initialLoadRef = useRef(true)
  const token = useStore((s) => s.token)
  const subscription = useStore((s) => s.subscription)
  const isFreeTier = (subscription?.tier || 'FREE') === 'FREE'
  const [currentUser, setCurrentUser] = useState(null)
  // 보이스 사용 자격: 유료 OR 무료 잔여(freeVoiceUses)
  const canUseVoice = !isFreeTier || (currentUser?.freeVoiceUses || 0) > 0
  const { t } = useTranslation()

  // 페이지 이탈 시 사운드 재생 정리
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current)
        playbackTimeoutRef.current = null
      }
      audioQueueRef.current = []
      isPlayingQueueRef.current = false
    }
  }, [])

  // 최근 응답의 마지막 CHARACTER 인덱스 + 해당 응답의 audioUrl 목록
  const { lastCharIdx, latestResponseAudios } = useMemo(() => {
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'USER') { lastUserIdx = i; break }
    }
    let lastChar = -1
    const audios = []
    for (let i = lastUserIdx + 1; i < messages.length; i++) {
      if (messages[i].role === 'CHARACTER') {
        lastChar = i
        if (messages[i].audioUrl) audios.push(messages[i].audioUrl)
      }
    }
    return { lastCharIdx: lastChar, latestResponseAudios: audios }
  }, [messages])

  // 모달/오버레이 뒤로가기 처리
  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(showLoginModal, () => setShowLoginModal(false))
  useBackHandler(showPushPrompt, () => setShowPushPrompt(false))
  useBackHandler(showGallery, () => setShowGallery(false))
  useBackHandler(showImageGenModal, () => setShowImageGenModal(false))
  useBackHandler(showSelfieModal, () => setShowSelfieModal(false))
  useBackHandler(showReport, () => setShowReport(false))
  useBackHandler(showVoicePremiumModal, () => setShowVoicePremiumModal(false))

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
      if (conv.characterStatus) setCharacterStatus(conv.characterStatus)
      setVoiceMode(!!conv.voiceMode)
      setMessages(conv.messages.filter((m) => m.role === 'CHARACTER' || m.role === 'USER' || m.role === 'GENERATED_IMAGE' || m.role === 'NARRATION'))
      const lastCharMsg = [...conv.messages].reverse().find((m) => m.role === 'CHARACTER')
      if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
      if (lastCharMsg?.suggestedReplies?.length) setSuggestedReplies(lastCharMsg.suggestedReplies)
      // 호감도 해금 임계치 로드
      api.get(`/characters/${conv.characterId}/gallery`).then(({ galleryContents }) => {
        affinityThresholdsRef.current = (galleryContents || [])
          .filter((c) => c.unlockType === 'AFFINITY')
          .map((c) => c.affinityThreshold)
      }).catch(() => {})
      // 초기 로드 시 즉시 맨 아래로
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
        initialLoadRef.current = false
      })
    })
    if (token) {
      api.get('/auth/me').then(({ user }) => setCurrentUser(user)).catch(() => {})
    }
  }, [id, token])

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

  const playFromQueue = () => {
    if (isPlayingQueueRef.current) return
    if (audioQueueRef.current.length === 0) {
      setIsPlayingAll(false)
      return
    }
    const url = audioQueueRef.current.shift()
    isPlayingQueueRef.current = true
    const audio = new Audio(url)
    audioRef.current = audio
    const onDone = () => {
      audioRef.current = null
      // 다음 버블 재생 전 1초 공백 — 타임아웃 ID 추적해 중지 시 취소 가능
      playbackTimeoutRef.current = setTimeout(() => {
        playbackTimeoutRef.current = null
        isPlayingQueueRef.current = false
        playFromQueue()
      }, 1000)
    }
    audio.onended = onDone
    audio.onerror = onDone
    audio.play().catch(onDone)
  }

  const stopAllPlayback = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playbackTimeoutRef.current) { clearTimeout(playbackTimeoutRef.current); playbackTimeoutRef.current = null }
    audioQueueRef.current = []
    isPlayingQueueRef.current = false
    setIsPlayingAll(false)
  }

  const playAllLatestAudios = (urls) => {
    stopAllPlayback()
    setPlayingAudioIdx(null)
    audioQueueRef.current = [...urls]
    setIsPlayingAll(true)
    playFromQueue()
  }

  const send = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    const feedToSend = attachedFeed
    setInput('')
    setSending(true)
    setShowSuggestions(false)
    setSuggestedReplies([])
    setAttachedFeed(null)
    setShowGalleryTooltip(false)
    const feedImage = feedToSend?.images?.[0]?.filePath || null
    const tempUserMsg = { id: Date.now(), role: 'USER', content: text, feedImage }
    setMessages((prev) => [...prev, tempUserMsg])

    setShowTyping(true)
    const confirmedUserMsg = { role: 'USER', content: text, createdAt: new Date().toISOString(), feedImage }
    const body = { content: text }
    if (feedToSend) body.feedPostId = feedToSend.id
    if (voiceMode && character?.voiceId && canUseVoice) body.voiceWithChat = true
    try {
      await api.stream(`/conversations/${id}/messages`, body, (event, data) => {
        switch (event) {
          case 'narration': {
            setMessages((prev) => {
              const withoutTemp = prev.some((m) => m.id === tempUserMsg.id)
                ? [...prev.filter((m) => m.id !== tempUserMsg.id), confirmedUserMsg]
                : prev
              return [...withoutTemp, { role: 'NARRATION', content: data.content, streaming: true }]
            })
            break
          }
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
          case 'audio': {
            // 서버에서 TTS 생성 완료 시 즉시 큐에 추가하여 순차 재생
            audioQueueRef.current.push(data.audioUrl)
            playFromQueue()
            break
          }
          case 'done': {
            const { responseMessages } = data
            const charMsgs = responseMessages.filter((m) => m.role === 'CHARACTER' || m.role === 'NARRATION')
            // 호감도가 오른 경우 마지막 캐릭터 메시지에 표시
            const lastChar = [...charMsgs].reverse().find((m) => m.role === 'CHARACTER')
            if (data.affinityChange > 0 && lastChar) {
              const lastIdx = charMsgs.lastIndexOf(lastChar)
              charMsgs[lastIdx] = { ...charMsgs[lastIdx], affinityUp: true }
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
            window.gtag?.('event', 'chat_message', { conversation_id: id })
            // 보이스 사용 시 무료 횟수 갱신
            if (voiceMode && character?.voiceId && canUseVoice) {
              api.get('/auth/me').then(({ user }) => setCurrentUser(user)).catch(() => {})
            }
            if (!pushPromptShownRef.current && token) {
              getPushPermissionStatus().then((status) => {
                if (status === 'default') {
                  pushPromptShownRef.current = true
                  setShowPushPrompt(true)
                }
              })
            }
            if (data.affinity !== undefined) {
              setConversation((prev) => {
                const oldAffinity = prev.affinity || 0
                const newAffinity = data.affinity
                const crossed = affinityThresholdsRef.current.some(
                  (th) => oldAffinity < th && newAffinity >= th
                )
                if (crossed) {
                  setGalleryTooltipText(t('chat.affinityUnlocked'))
                  setShowGalleryTooltip(true)
                  setShowGalleryBadge(true)
                }
                return { ...prev, affinity: newAffinity }
              })
            }
            if (data.characterStatus) {
              setCharacterStatus(data.characterStatus)
            }
            if (data.wantsPhoto) {
              setShowSelfieModal(true)
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
        window.gtag?.('event', 'mask_depleted', { conversation_id: id })
        navigate('/mask-shop')
      } else {
        showError(t('chat.errorSend'))
      }
    }
  }

  const handleGenerateImage = async ({ selfie } = {}) => {
    if (generatingImage || !token) return
    setShowImageGenModal(false)
    setGeneratingImage(true)
    try {
      const { generatedImage } = await api.post(`/conversations/${id}/generate-image`, { selfie: !!selfie })
      const imageId = generatedImage.id

      // PENDING 메시지를 먼저 표시
      setMessages((prev) => [...prev, {
        role: 'GENERATED_IMAGE',
        content: null,
        createdAt: new Date().toISOString(),
        generatedImageId: imageId,
        status: 'PENDING',
      }])

      // 폴링으로 완료 대기
      const poll = setInterval(async () => {
        try {
          const { generatedImage: img } = await api.get(`/conversations/${id}/generated-images/${imageId}/status`)
          if (img.status === 'COMPLETED') {
            clearInterval(poll)
            setMessages((prev) => prev.map((m) =>
              m.generatedImageId === imageId
                ? { ...m, content: img.filePath, status: 'COMPLETED' }
                : m
            ))
            setGeneratingImage(false)
            setGalleryTooltipText(t('chat.galleryTooltip'))
            setShowGalleryTooltip(true)
          } else if (img.status === 'RETRYING') {
            setMessages((prev) => prev.map((m) =>
              m.generatedImageId === imageId
                ? { ...m, status: 'RETRYING' }
                : m
            ))
          } else if (img.status === 'FAILED') {
            clearInterval(poll)
            setMessages((prev) => prev.filter((m) => m.generatedImageId !== imageId))
            showError(t('chat.errorImageGen'))
            setGeneratingImage(false)
          }
        } catch {
          // 폴링 실패는 무시하고 재시도
        }
      }, 3000)

      // 2분 타임아웃
      setTimeout(() => {
        clearInterval(poll)
        setGeneratingImage(false)
      }, 120000)
    } catch (error) {
      console.error('Image generation error:', error)
      if (error.message?.includes('Insufficient masks')) {
        navigate('/mask-shop')
      } else {
        showError(t('chat.errorImageGen'))
      }
      setGeneratingImage(false)
    }
  }

  const handleGenerateTTS = async () => {
    if (generatingTTS || !token || !character?.voiceId) return
    // 마지막 CHARACTER 메시지 찾기 (나레이션 제외)
    let targetIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'CHARACTER') {
        // 나레이션(애스터리스크만)이 아닌 실제 대사가 있는지 확인
        const dialogue = messages[i].content?.replace(/\*[^*]+\*/g, '').trim()
        if (dialogue) { targetIdx = i; break }
      }
    }
    if (targetIdx === -1) return

    // 이미 audioUrl이 있으면 바로 재생
    if (messages[targetIdx].audioUrl) {
      playAudio(messages[targetIdx].audioUrl, targetIdx)
      return
    }

    // 원본 messages 배열에서의 인덱스 계산 (필터링된 messages와 conversation.messages 매핑)
    // Chat.jsx에서 messages는 필터링된 배열이므로, conversation.messages에서 해당 메시지의 실제 인덱스를 찾아야 함
    setGeneratingTTS(true)
    try {
      const convMessages = (await api.get(`/conversations/${id}/messages`)).conversation.messages
      // 필터링된 targetIdx의 메시지와 매칭되는 원본 인덱스
      const targetMsg = messages[targetIdx]
      let realIdx = -1
      // createdAt + content로 매칭
      for (let i = convMessages.length - 1; i >= 0; i--) {
        if (convMessages[i].role === 'CHARACTER' && convMessages[i].content === targetMsg.content && convMessages[i].createdAt === targetMsg.createdAt) {
          realIdx = i
          break
        }
      }
      if (realIdx === -1) {
        showError(t('chat.errorTTS'))
        setGeneratingTTS(false)
        return
      }

      const { audioUrl } = await api.post(`/conversations/${id}/generate-tts`, { messageIndex: realIdx })
      setMessages((prev) => prev.map((m, i) => i === targetIdx ? { ...m, audioUrl } : m))
      playAudio(audioUrl, targetIdx)
    } catch (error) {
      console.error('TTS error:', error)
      if (error.message?.includes('Insufficient masks')) {
        navigate('/mask-shop')
      } else {
        showError(t('chat.errorTTS'))
      }
    } finally {
      setGeneratingTTS(false)
    }
  }

  const playAudio = (url, idx) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const audio = new Audio(url)
    audioRef.current = audio
    setPlayingAudioIdx(idx)
    audio.onended = () => { setPlayingAudioIdx(null); audioRef.current = null }
    audio.onerror = () => { setPlayingAudioIdx(null); audioRef.current = null }
    audio.play().catch(() => { setPlayingAudioIdx(null); audioRef.current = null })
  }

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingAudioIdx(null)
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
        <button
          onClick={() => setShowReport(true)}
          className="text-gray-500 hover:text-red-400 transition-colors ml-1"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          title={t('report.title')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        {/* 캐릭터 상태 버튼 */}
        <button
          onClick={() => setShowStatusPanel(true)}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 flex items-center justify-center shadow-lg hover:bg-gray-800/90 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>

        {/* 캐릭터 상태 시트 */}
        {showStatusPanel && (
          <div className="absolute top-0 left-0 right-0 z-20">
            <div className="bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 rounded-b-2xl px-4 pt-3 pb-4 shadow-xl animate-slide-down" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const status = characterStatus || getDefaultStatus(character.activeHours)
                return (
                  <div className="flex items-start gap-3">
                    <span className="text-3xl leading-none">{status.emoji}</span>
                    <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">{t('chat.statusMood')}</p>
                        <p className="text-xs text-gray-200 truncate">{status.mood}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">{t('chat.statusLocation')}</p>
                        <p className="text-xs text-gray-200 truncate">{status.location}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">{t('chat.statusActivity')}</p>
                        <p className="text-xs text-gray-200 truncate">{status.activity}</p>
                      </div>
                    </div>
                  </div>
                )
              })()}
              <div className="flex justify-center mt-2">
                <button onClick={() => setShowStatusPanel(false)} className="text-gray-600" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

      <div className="h-full overflow-auto px-4 py-3 space-y-2" style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {/* <div className="py-1"><AdBanner slot="8921302150" /></div> */}
        {profileUrl && (
          <div className="flex justify-start mt-3">
            <div className="w-7 flex-shrink-0 mr-2">
              <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden cursor-pointer" onClick={() => setLightboxUrl(profileUrl)}>
                <img src={profileUrl} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="max-w-[75%]">
              <p className="text-xs text-gray-400 mb-1 font-medium">{character.name}</p>
              <div
                className="rounded-2xl rounded-tl-none overflow-hidden bg-gray-800/80 cursor-pointer"
                onClick={() => setLightboxUrl(profileUrl)}
              >
                <img src={profileUrl} alt="" className="w-48 h-48 object-cover" />
              </div>
            </div>
          </div>
        )}
        {messages.map((msg, idx) => {
          if (msg.role === 'NARRATION') {
            return (
              <div key={msg.id || idx} className="flex justify-center my-4">
                <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-2 max-w-[85%]">
                  <p className="text-xs text-gray-400 text-center italic leading-relaxed">{msg.content}</p>
                </div>
              </div>
            )
          }
          if (msg.role === 'GENERATED_IMAGE') {
            if (msg.status === 'PENDING' || msg.status === 'RETRYING' || !msg.content) {
              return (
                <div key={msg.id || idx} className="flex justify-center mt-3">
                  <div className="max-w-[75%] rounded-2xl overflow-hidden bg-gray-800/60 flex flex-col items-center justify-center py-10 px-6">
                    <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mb-3" />
                    <span className="text-[13px] text-gray-400">{msg.status === 'RETRYING' ? t('chat.retryingImage') : t('chat.generatingImage')}</span>
                  </div>
                </div>
              )
            }
            return (
              <div key={msg.id || idx} className="flex justify-center mt-3">
                <div className="max-w-[75%] rounded-2xl overflow-hidden relative" onClick={() => setLightboxUrl(msg.content)}>
                  <img src={msg.content} alt="" className="w-full object-cover cursor-pointer" loading="lazy" />
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      api.put(`/conversations/${id}/background`, { backgroundImage: msg.content })
                        .then(() => setBackgroundImage(msg.content))
                        .catch(() => {})
                    }}
                    className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 text-white/80 hover:text-white text-[11px]"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    {t('gallery.changeBg')}
                  </button>
                </div>
              </div>
            )
          }
          const prevMsg = messages[idx - 1]
          const nextMsg = messages[idx + 1]
          const isConsecutive = prevMsg?.role === msg.role
          const showTime = msg.createdAt && (
            !nextMsg || nextMsg.role !== msg.role || nextMsg.role === 'NARRATION' || nextMsg.role === 'GENERATED_IMAGE' ||
            formatChatTime(msg.createdAt) !== formatChatTime(nextMsg.createdAt)
          )
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
                <div className="flex items-end gap-1.5">
                  <div className={`text-sm leading-relaxed px-3.5 py-2.5 ${msg.role === 'USER' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none' : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'}`}>
                    {msg.content}
                  </div>
                  {msg.role === 'CHARACTER' && msg.audioUrl && (
                    <button
                      onClick={() => playingAudioIdx === idx ? stopAudio() : playAudio(msg.audioUrl, idx)}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800/60 hover:bg-gray-700/60 transition-colors"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {playingAudioIdx === idx ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      )}
                    </button>
                  )}
                </div>
                {idx === lastCharIdx && latestResponseAudios.length >= 2 && (
                  <button
                    onClick={() => isPlayingAll ? stopAllPlayback() : playAllLatestAudios(latestResponseAudios)}
                    className={`mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${isPlayingAll ? 'bg-red-600/20 hover:bg-red-600/30 border-red-600/40' : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-600/40'}`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {isPlayingAll ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#f87171"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                    <span className={`text-[10px] font-medium ${isPlayingAll ? 'text-red-400' : 'text-emerald-400'}`}>{isPlayingAll ? t('chat.playAllStop', { defaultValue: '중지' }) : t('chat.playAll', { defaultValue: '전체 재생' })}</span>
                  </button>
                )}
                {showTime && <p className={`text-[10px] text-gray-600 mt-1 px-1 ${msg.role === 'USER' ? 'text-right' : ''}`}>{formatChatTime(msg.createdAt)}</p>}
                {msg.affinityUp && <p className="text-[11px] text-pink-400 mt-1 px-1">{t('chat.affinityUp', { name: character.name })}</p>}
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
      </div>

      <div className="relative flex-shrink-0">
        {/* 플로팅 버튼들 */}
        <div className="absolute z-10 flex gap-2" style={{ right: 16, bottom: '100%', marginBottom: 12 }}>
          {character.voiceId && (
            <button
              onClick={() => {
                if (!canUseVoice) { setShowVoicePremiumModal(true); return }
                setVoiceMode((v) => {
                  const next = !v
                  api.patch(`/conversations/${id}/voice-mode`, { enabled: next }).catch(() => {})
                  return next
                })
              }}
              disabled={!token}
              className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${!canUseVoice ? 'bg-gray-800 opacity-50' : voiceMode ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400' : 'bg-gray-700 hover:bg-gray-600'} disabled:opacity-40`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {voiceMode ? (
                  <>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </>
                ) : (
                  <>
                    <line x1="18" y1="9" x2="22" y2="13" />
                    <line x1="22" y1="9" x2="18" y2="13" />
                  </>
                )}
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              setShowImageGenModal(true)
              api.get(`/characters/${conversation.characterId}`).then(({ character: c }) => {
                const allImages = (c.feedPosts || []).flatMap((p) => (p.images || []).map((img) => img.filePath)).filter(Boolean)
                const shuffled = allImages.sort(() => Math.random() - 0.5)
                setPreviewFeedImages(shuffled.slice(0, 3))
              }).catch(() => {})
            }}
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
          <div className="relative">
            {showGalleryTooltip && (
              <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap pointer-events-none animate-fade-in">
                <div className="relative bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg">
                  {galleryTooltipText}
                  <div className="absolute top-full right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white" />
                </div>
              </div>
            )}
            <button
              onClick={() => { setShowGallery(true); setShowGalleryTooltip(false); setShowGalleryBadge(false) }}
              className="relative w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-lg transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {showGalleryBadge && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" />}
            </button>
          </div>
        </div>

      <div className="p-3 pt-5 border-t border-gray-800 bg-gray-900/95" style={{ paddingBottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 8px)' }}>
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
          <textarea value={input} maxLength={300} onChange={(e) => { setInput(e.target.value.slice(0, 300)); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} placeholder={t('chat.inputPlaceholder')} rows={1} className="flex-1 h-10 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none" />
          {suggestedReplies.length > 0 && (
            <button onClick={() => setShowSuggestions((prev) => !prev)} className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${showSuggestions ? 'bg-indigo-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><line x1="9" y1="10" x2="15" y2="10" /></svg>
            </button>
          )}
          <div className="relative flex-shrink-0">
            {voiceMode && canUseVoice && (
              (currentUser?.freeVoiceUses || 0) > 0
                ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-emerald-400">{t('chat.voiceFreeRemaining', { count: currentUser.freeVoiceUses, defaultValue: '무료 {{count}}회' })}</span>
                : <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-emerald-400">-5 🎭</span>
            )}
            <button onClick={send} disabled={!input.trim() || sending} className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      </div>
      </div>
      {showImageGenModal && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => { setShowImageGenModal(false); setPreviewFeedImages([]) }}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.imageGenTitle', { name: character.name })}</p>
            <p className="text-gray-400 text-sm text-center mb-4">
              {t('chat.imageGenDesc', { name: character.name })}
              <br />
              <span className="text-purple-400 font-medium">{t('chat.imageGenCost', { count: 5 })}</span>
            </p>
            {previewFeedImages.length > 0 && (
              <div className="flex gap-2 justify-center mb-5">
                {previewFeedImages.map((url, i) => (
                  <div key={i} className="w-20 h-28 rounded-xl overflow-hidden bg-gray-800">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowImageGenModal(false); setPreviewFeedImages([]) }}
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
                {t('chat.imageGenRequest')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSelfieModal && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowSelfieModal(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-pink-600/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.selfieTitle', { name: character.name })}</p>
            <p className="text-gray-400 text-sm text-center mb-5">
              {t('chat.selfieDesc')}
              <br />
              <span className="text-pink-400 font-medium">{t('chat.imageGenCost', { count: 5 })}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSelfieModal(false)}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => { setShowSelfieModal(false); handleGenerateImage({ selfie: true }) }}
                className="flex-1 py-2.5 text-sm text-white bg-pink-600 rounded-xl font-semibold"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('chat.imageGenRequest')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showPushPrompt && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowPushPrompt(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
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
      {showVoicePremiumModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowVoicePremiumModal(false)} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
            <p className="text-lg font-bold text-gray-100 mb-2">{t('chat.voicePremiumTitle')}</p>
            <p className="text-sm text-gray-400 mb-6">{t('chat.voicePremiumDesc')}</p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { setShowVoicePremiumModal(false); navigate('/subscription') }}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('chat.voicePremiumCta')}
              </button>
              <button
                onClick={() => setShowVoicePremiumModal(false)}
                className="px-6 py-2.5 bg-gray-800 text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showReport && (
        <ReportModal
          targetType="CONVERSATION"
          targetId={conversation.id}
          onClose={() => setShowReport(false)}
        />
      )}
      {showGallery && (
        <GalleryBottomSheet
          characterId={conversation.characterId}
          characterName={character.name}
          conversationId={conversation.id}
          affinity={conversation.affinity ?? 0}
          onClose={() => setShowGallery(false)}
          onAttachFeed={(feed) => setAttachedFeed(feed)}
          onBackgroundChange={(url) => setBackgroundImage(url)}
          affinityBadge={showGalleryBadge}
          onAffinityBadgeClear={() => setShowGalleryBadge(false)}
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
