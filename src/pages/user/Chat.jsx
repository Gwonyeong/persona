import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { ensureMicPermission } from '../../lib/microphone'
import useStore from '../../store/useStore'
import GalleryBottomSheet from '../../components/GalleryBottomSheet'
import GiftBottomSheet from '../../components/GiftBottomSheet'
import ReportModal from '../../components/ReportModal'
import OnboardingSpotlight from '../../components/OnboardingSpotlight'
import MaskIcon from '../../components/MaskIcon'
import CallSheet from '../../components/CallSheet'
import { getPushPermissionStatus, requestPushPermission } from '../../lib/push'
import useBackHandler from '../../hooks/useBackHandler'
import { formatChatTime } from '../../lib/timeFormat'
// import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

// 한글 음절(가-힣)을 자모 단계로 분해. 예: '상' → ['ㅅ', '사', '상'], '가' → ['ㄱ', '가'] (받침 없음)
const HANGUL_INITIALS = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const HANGUL_SYL_BASE = 0xAC00
const HANGUL_SYL_END = 0xD7A3
function decomposeJamoStages(ch) {
  const code = ch.charCodeAt(0)
  if (code < HANGUL_SYL_BASE || code > HANGUL_SYL_END) return [ch]
  const offset = code - HANGUL_SYL_BASE
  const initial = Math.floor(offset / (21 * 28))
  const vowel = Math.floor((offset % (21 * 28)) / 28)
  const finalConsonant = offset % 28
  const stages = [HANGUL_INITIALS[initial]]
  // 초성 + 중성 (받침 없는 음절)
  stages.push(String.fromCharCode(HANGUL_SYL_BASE + initial * 21 * 28 + vowel * 28))
  // 받침까지 (있을 때만 한 단계 더)
  if (finalConsonant > 0) stages.push(ch)
  return stages
}
function getTypingStateAt(text, step) {
  let count = 0
  let prefix = ''
  for (const ch of text) {
    const stages = decomposeJamoStages(ch)
    for (const stage of stages) {
      if (count === step) return prefix + stage
      count++
    }
    prefix += ch
  }
  return text
}
function getTotalTypingSteps(text) {
  let total = 0
  for (const ch of text) total += decomposeJamoStages(ch).length
  return total
}

// 캐릭터: 《...》 = 행동 묘사. 유저: (...) = 행동 묘사. 같은 버블 안에서 흐릿한 색으로 표시.
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
    return { emoji: '💬', mood: '-', location: '-', activity: '-', outfit: '-' }
  }
  const slot = activeHours.schedule.find((s) => {
    if (s.start < s.end) return hour >= s.start && hour < s.end
    return hour >= s.start || hour < s.end
  })
  const status = slot?.status || 'free'
  const label = slot?.label || null
  if (status === 'sleep') return { emoji: '😴', mood: '수면 중', location: '-', activity: label || '잠자는 중', outfit: '잠옷' }
  if (status === 'busy') return { emoji: '🔒', mood: '바쁨', location: '-', activity: label || '바쁜 중', outfit: '-' }
  return { emoji: '🟢', mood: '여유', location: '-', activity: label || '자유 시간', outfit: '-' }
}

// 호감도 → 라벨 변환 (서버 getAffinityLabel과 일치)
function getAffinityLabelKey(affinity) {
  if (affinity <= -50) return 'affinityVeryHostile'
  if (affinity <= -20) return 'affinityHostile'
  if (affinity <= -5) return 'affinityUncomfortable'
  if (affinity <= 5) return 'affinityNeutral'
  if (affinity <= 20) return 'affinitySlightLike'
  if (affinity <= 50) return 'affinityLike'
  if (affinity <= 80) return 'affinityIntimate'
  return 'affinityDeep'
}

// 자모 단위 타이프라이터 애니메이션 훅. shouldAnimate가 true로 전환된 시점에 활성화 → 끝까지 재생.
// shouldAnimate가 처음에 false였다가 나중에 true가 되어도 정상 발동 (딜레이 큐 시나리오 지원).
const TYPING_SPEED_MS = 18
function useJamoTypewriter(fullText, shouldAnimate) {
  const [active, setActive] = useState(shouldAnimate === true)
  const [step, setStep] = useState(0)

  // shouldAnimate가 true가 되는 순간 활성화 (한 번만, one-way)
  useEffect(() => {
    if (shouldAnimate && !active) {
      setActive(true)
      setStep(0)
    }
  }, [shouldAnimate, active])

  const totalSteps = useMemo(
    () => (active ? getTotalTypingSteps(fullText || '') : 0),
    [fullText, active],
  )

  useEffect(() => {
    if (!active) return
    if (step >= totalSteps) return
    const t = setTimeout(() => setStep((s) => s + 1), TYPING_SPEED_MS)
    return () => clearTimeout(t)
  }, [active, step, totalSteps])

  // shouldAnimate=true이지만 아직 active 전환 전 (한 프레임) → 빈 문자열로 깜빡임 방지
  if (shouldAnimate && !active) return ''
  if (active && step < totalSteps) return getTypingStateAt(fullText || '', step)
  return fullText || ''
}

// 메시지 한 개를 렌더링하는 메모이즈된 컴포넌트.
// 부모(Chat) 리렌더에 의한 입력 lag를 차단하기 위해 React.memo로 감싸 불필요한 재렌더를 막는다.
const MessageBubble = memo(function MessageBubble({
  msg,
  msgIdx,
  isConsecutive,
  showTime,
  profileUrl,
  characterName,
  isLastChar,
  latestResponseAudios,
  isPlayingAll,
  isThisPlayingAudio,
  onLightbox,
  onPlayAudio,
  onStopAudio,
  onSetBackground,
  onPlayAll,
  onStopAll,
  onAppear,
  t,
}) {
  // 라이브 스트리밍: 서버가 delta 이벤트로 content를 점진적으로 갱신하므로 별도 자모 애니메이션 불필요.
  // 새 버블이 등장할 때 부모에게 알려 스크롤 따라가기.
  const isStreamingBubble = msg._streaming === true
  useEffect(() => {
    if (isStreamingBubble && onAppear) onAppear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreamingBubble])

  const segments = useMemo(() => {
    if (msg.role !== 'CHARACTER' && msg.role !== 'USER') return null
    return parseMessageSegments(msg.content || '', msg.role)
  }, [msg.content, msg.role])

  if (msg.role === 'NARRATION') {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-2 max-w-[85%]">
          <p className="text-xs text-gray-400 text-center italic leading-relaxed">{msg.content || ''}</p>
        </div>
      </div>
    )
  }

  if (msg.role === 'GIFT') {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-pink-900/30 backdrop-blur-sm border border-pink-700/40 rounded-xl px-4 py-3 max-w-[85%] flex items-center gap-3">
          {msg.giftImageUrl && (
            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
              <img src={msg.giftImageUrl} alt={msg.giftName || ''} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="text-xs text-pink-200 leading-relaxed">
            <span className="text-pink-300">🎁 </span>
            <span className="text-pink-100 font-medium">{msg.giftName || ''}</span>
            <span className="text-pink-300/80">을(를) 선물했습니다</span>
          </div>
        </div>
      </div>
    )
  }

  if (msg.role === 'GENERATED_IMAGE') {
    if (msg.status === 'PENDING' || msg.status === 'RETRYING' || !msg.content) {
      return (
        <div className="flex justify-center mt-3">
          <div className="max-w-[75%] rounded-2xl overflow-hidden bg-gray-800/60 flex flex-col items-center justify-center py-10 px-6">
            <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mb-3" />
            <span className="text-[13px] text-gray-400">{msg.status === 'RETRYING' ? t('chat.retryingImage') : t('chat.generatingImage')}</span>
          </div>
        </div>
      )
    }
    return (
      <div className="flex justify-center mt-3">
        <div className="max-w-[75%] rounded-2xl overflow-hidden relative" onClick={() => onLightbox(msg.content)}>
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
            onClick={(e) => { e.stopPropagation(); onSetBackground(msg.content) }}
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

  return (
    <div className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'} ${isConsecutive ? '' : 'mt-3'}`}>
      {msg.role === 'CHARACTER' && (
        <div className="w-7 flex-shrink-0 mr-2">
          {!isConsecutive ? (
            <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden cursor-pointer" onClick={() => profileUrl && onLightbox(profileUrl)}>
              {profileUrl ? <img src={profileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>}
            </div>
          ) : null}
        </div>
      )}
      <div className="max-w-[75%]">
        {msg.role === 'CHARACTER' && !isConsecutive && <p className="text-xs text-gray-400 mb-1 font-medium">{characterName}</p>}
        {msg.feedImage && (
          <div className="mb-1.5 rounded-2xl rounded-tr-none overflow-hidden">
            <img src={msg.feedImage} alt="" className="w-full aspect-square object-cover" loading="lazy" />
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <div className={`text-sm leading-relaxed px-3.5 py-2.5 whitespace-pre-wrap ${msg.role === 'USER' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none' : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'}`}>
            {segments && segments.map((seg, i) => (
              <span key={i}>
                {i > 0 && '\n\n'}
                {seg.type === 'action' ? (
                  <span className={`italic ${msg.role === 'USER' ? 'text-indigo-200/70' : 'text-gray-400/80'}`}>
                    {seg.value}
                  </span>
                ) : (
                  seg.value
                )}
              </span>
            ))}
          </div>
          {msg.role === 'CHARACTER' && msg.audioUrl && (
            <button
              onClick={() => isThisPlayingAudio ? onStopAudio() : onPlayAudio(msg.audioUrl, msgIdx)}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800/60 hover:bg-gray-700/60 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {isThisPlayingAudio ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
            </button>
          )}
        </div>
        {isLastChar && latestResponseAudios.length >= 2 && (
          <button
            onClick={() => isPlayingAll ? onStopAll() : onPlayAll(latestResponseAudios)}
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
        {msg.affinityUp && <p className="text-[11px] text-pink-400 mt-1 px-1">{t('chat.affinityUp', { name: characterName })}</p>}
      </div>
    </div>
  )
})

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  // 렌더 페이지네이션 — 처음엔 최근 PAGE_SIZE개만 DOM에 그려서 입력 lag 차단
  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const scrollContainerRef = useRef(null)
  const topSentinelRef = useRef(null)
  const [input, setInput] = useState('')
  const textareaRef = useRef(null)
  const [sending, setSending] = useState(false)
  const [showTyping, setShowTyping] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL')
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showGiftSheet, setShowGiftSheet] = useState(false)
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
  const [showCallChooser, setShowCallChooser] = useState(false)
  // null 이면 통화 닫힘, 'simple'|'continue' 이면 CallSheet 오픈.
  const [activeCallMode, setActiveCallMode] = useState(null)
  const [showLightOnlyModal, setShowLightOnlyModal] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [chatModel, setChatModel] = useState('BASIC') // 'BASIC' (Mistral) | 'ADVANCED' (Grok 4.3)
  const [showModelSheet, setShowModelSheet] = useState(false)
  const [excitedTooltipVisible, setExcitedTooltipVisible] = useState(false)
  const prevExcitedRef = useRef(false)
  const voiceButtonRef = useRef(null)
  const excitedTooltipRef = useRef(null)
  const [generatingTTS, setGeneratingTTS] = useState(false)
  const [playingAudioIdx, setPlayingAudioIdx] = useState(null)
  const audioRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingQueueRef = useRef(false)
  const playbackTimeoutRef = useRef(null)
  // 라이브 큐: 다음 애니메이션이 시작될 시각(ms 타임스탬프). 새 버블은 이 시각까지 대기.
  const nextAnimStartRef = useRef(0)
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [errorToast, setErrorToast] = useState(null)
  const errorTimerRef = useRef(null)
  const pushPromptShownRef = useRef(false)
  const messagesEndRef = useRef(null)
  const initialLoadRef = useRef(true)
  const token = useStore((s) => s.token)
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const subscriptionTier = useStore((s) => s.subscription?.tier) || 'FREE'

  const canCallUnlimited = subscriptionTier === 'LIGHT' || user?.role === 'ADMIN'
  const remainingFreeCalls = user?.freeCallUses ?? 0
  // FREE 티어 한정 — 무료 횟수가 남아있을 때만 강조 (LIGHT/ADMIN은 의미 없음)
  const showFreeCallBadge = !canCallUnlimited && remainingFreeCalls > 0
  const handleCallClick = async () => {
    if (!canCallUnlimited && remainingFreeCalls <= 0) {
      setShowLightOnlyModal(true)
      return
    }
    // 통화 시트 열기 전에 마이크 권한 확보 — user activation이 살아있는 탭 핸들러 안에서 요청해야
    // Android WebView가 시스템 다이얼로그를 안정적으로 띄운다.
    try {
      await ensureMicPermission()
    } catch (err) {
      if (err.code === 'PERMISSION_DENIED') {
        setErrorToast(t('chat.call.permissionHint'))
      } else if (err.code === 'UNSUPPORTED') {
        setErrorToast(t('chat.call.errorSend'))
      } else {
        setErrorToast(t('chat.call.permissionDenied'))
      }
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => setErrorToast(null), 4000)
      return
    }
    setShowCallChooser(true)
  }
  const { t } = useTranslation()

  // 캐릭터가 흥분 상태로 진입할 때 사운드 버튼 위에 툴팁 표시. 빠져나오면 자동 닫힘.
  useEffect(() => {
    const isExcited = !!characterStatus?.isExcited
    if (!prevExcitedRef.current && isExcited) {
      setExcitedTooltipVisible(true)
    } else if (prevExcitedRef.current && !isExcited) {
      setExcitedTooltipVisible(false)
    }
    prevExcitedRef.current = isExcited
  }, [characterStatus?.isExcited])

  // 툴팁이 떠 있는 동안 화면의 다른 부분을 터치하면 닫힘 (버튼·툴팁 자체 터치는 유지)
  useEffect(() => {
    if (!excitedTooltipVisible) return
    const handleOutside = (e) => {
      if (voiceButtonRef.current?.contains(e.target)) return
      if (excitedTooltipRef.current?.contains(e.target)) return
      setExcitedTooltipVisible(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [excitedTooltipVisible])

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

  // 렌더 페이지네이션 — 최근 visibleCount개만 DOM에 그림
  const visibleStart = Math.max(0, messages.length - visibleCount)
  const visibleMessages = useMemo(() => messages.slice(visibleStart), [messages, visibleStart])

  // 위로 스크롤 시 더 로드 (스크롤 위치 보존)
  const loadMore = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const prevHeight = container.scrollHeight
    const prevTop = container.scrollTop
    setVisibleCount((c) => Math.min(messages.length, c + PAGE_SIZE))
    requestAnimationFrame(() => {
      const newHeight = container.scrollHeight
      container.scrollTop = newHeight - prevHeight + prevTop
    })
  }, [messages.length])

  useEffect(() => {
    if (visibleStart === 0) return
    const sentinel = topSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore()
    }, { threshold: 0, root: scrollContainerRef.current, rootMargin: '200px 0px 0px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleStart, loadMore])

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
  useBackHandler(showPushPrompt, () => setShowPushPrompt(false))
  useBackHandler(showGallery, () => setShowGallery(false))
  useBackHandler(showImageGenModal, () => setShowImageGenModal(false))
  useBackHandler(showSelfieModal, () => setShowSelfieModal(false))
  useBackHandler(showReport, () => setShowReport(false))
  useBackHandler(showModelSheet, () => setShowModelSheet(false))

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
      setChatModel(conv.chatModel === 'ADVANCED' ? 'ADVANCED' : 'BASIC')
      setMessages(conv.messages.filter((m) => m.role === 'CHARACTER' || m.role === 'USER' || m.role === 'GENERATED_IMAGE' || m.role === 'NARRATION' || m.role === 'GIFT'))
      const lastCharMsg = [...conv.messages].reverse().find((m) => m.role === 'CHARACTER')
      if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
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

  // 키보드 열림/닫힘은 index.html의 interactive-widget=resizes-content + 100dvh로 처리됨.
  // visualViewport 리스너는 키보드 애니메이션 종료 후 최신 메시지가 보이도록 스크롤만 담당.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handleResize = () => {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
    vv.addEventListener('resize', handleResize)
    return () => {
      vv.removeEventListener('resize', handleResize)
    }
  }, [])

  const playFromQueue = useCallback(() => {
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
  }, [])

  const stopAllPlayback = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playbackTimeoutRef.current) { clearTimeout(playbackTimeoutRef.current); playbackTimeoutRef.current = null }
    audioQueueRef.current = []
    isPlayingQueueRef.current = false
    setIsPlayingAll(false)
  }, [])

  const playAllLatestAudios = useCallback((urls) => {
    stopAllPlayback()
    setPlayingAudioIdx(null)
    audioQueueRef.current = [...urls]
    setIsPlayingAll(true)
    playFromQueue()
  }, [stopAllPlayback, playFromQueue])

  const send = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    const feedToSend = attachedFeed
    setInput('')
    setSending(true)
    setAttachedFeed(null)
    setShowGalleryTooltip(false)
    const feedImage = feedToSend?.images?.[0]?.filePath || null
    const tempUserMsg = { id: Date.now(), role: 'USER', content: text, feedImage }
    setMessages((prev) => [...prev, tempUserMsg])

    setShowTyping(true)
    const confirmedUserMsg = { role: 'USER', content: text, createdAt: new Date().toISOString(), feedImage }
    const body = { content: text, chatModel }
    if (feedToSend) body.feedPostId = feedToSend.id
    if (voiceMode && character?.voiceId) body.voiceWithChat = true

    await performStreamRound({ body, text, tempUserMsg, confirmedUserMsg, retriesLeft: 1 })
  }

  // 한 라운드의 스트리밍 요청. mid-stream 실패 시 자기 자신을 재호출하여 자동 재시도.
  const performStreamRound = async ({ body, text, tempUserMsg, confirmedUserMsg, retriesLeft }) => {
    // 새 라운드마다 fresh roundId — 이전 라운드의 잔여 버블과 섞이지 않게.
    const roundId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

    // 실패 시 호출 — 이번 라운드 버블 제거 + 재시도 또는 에러 표시.
    const handleRoundFailure = (data) => {
      stopAllPlayback()
      setMessages((prev) => prev.filter((m) => m._round !== roundId))
      if (retriesLeft > 0) {
        // 자동 재시도. typing indicator는 유지하여 유저에게 응답 진행 인상.
        setShowTyping(true)
        performStreamRound({ body, text, tempUserMsg, confirmedUserMsg, retriesLeft: retriesLeft - 1 })
      } else {
        setShowTyping(false)
        setSending(false)
        showError(data?.refunded ? t('chat.errorRefunded') : t('chat.errorSend'))
      }
    }

    try {
      await api.stream(`/conversations/${id}/messages`, body, (event, data) => {
        switch (event) {
          case 'delta': {
            // 라이브 모드: Grok 토큰 단위 스트리밍. 같은 idx에 대한 delta는 기존 버블의 content를 갱신.
            const { idx, role, content, complete } = data
            setShowTyping(false)
            setMessages((prev) => {
              // 1) tempUserMsg → confirmedUserMsg 보장
              const base = prev.some((m) => m.id === tempUserMsg.id)
                ? [...prev.filter((m) => m.id !== tempUserMsg.id), confirmedUserMsg]
                : prev
              // 2) 같은 round + idx 의 기존 버블 찾아 갱신, 없으면 추가
              const existingI = base.findIndex(
                (m) => m._round === roundId && m._streamIdx === idx,
              )
              if (existingI >= 0) {
                const updated = [...base]
                updated[existingI] = {
                  ...updated[existingI],
                  role,
                  content,
                  _streaming: !complete,
                }
                return updated
              }
              return [
                ...base,
                {
                  role,
                  content,
                  _round: roundId,
                  _streamIdx: idx,
                  _streaming: !complete,
                },
              ]
            })
            break
          }
          case 'audio': {
            // 서버 TTS 도착 — 즉시 큐에 추가하여 순차 재생 (라이브 모드에선 버블이 이미 등장한 뒤)
            audioQueueRef.current.push(data.audioUrl)
            playFromQueue()
            break
          }
          case 'done': {
            const { responseMessages } = data
            const rawCharMsgs = responseMessages.filter((m) => m.role === 'CHARACTER' || m.role === 'NARRATION')
            // 호감도가 오른 경우 마지막 캐릭터 메시지에 affinityUp 부착할 인덱스
            let lastCharIdxInCharMsgs = -1
            for (let i = rawCharMsgs.length - 1; i >= 0; i--) {
              if (rawCharMsgs[i].role === 'CHARACTER') { lastCharIdxInCharMsgs = i; break }
            }
            setMessages((prev) => {
              const base = prev.filter((m) => m.id !== tempUserMsg.id)
              const hasUser = base.some((m) => m === confirmedUserMsg || (m.role === 'USER' && m.content === text && m.createdAt === confirmedUserMsg.createdAt))
              const withUser = hasUser ? base : [...base, confirmedUserMsg]
              // delta로 적재된 라운드 버블에 메타데이터 병합 (_streamIdx 매칭)
              const merged = withUser.map((m) => {
                if (m._round === roundId && typeof m._streamIdx === 'number') {
                  const final = rawCharMsgs[m._streamIdx]
                  if (!final) return { ...m, _streaming: false }
                  const isLast = m._streamIdx === lastCharIdxInCharMsgs
                  return {
                    ...m,
                    role: final.role,
                    content: final.content, // delta 누락분 보정 (서버 권위)
                    emotion: final.emotion,
                    createdAt: final.createdAt,
                    audioUrl: final.audioUrl,
                    _streaming: false,
                    ...(isLast && data.affinityChange > 0 ? { affinityUp: true } : {}),
                  }
                }
                return m
              })
              // 라운드에 등록된 _streamIdx 들의 집합
              const seenIdx = new Set(
                merged
                  .filter((m) => m._round === roundId && typeof m._streamIdx === 'number')
                  .map((m) => m._streamIdx),
              )
              // 스트리밍 누락분 (delta 실패 등) — 서버 응답에만 있는 메시지를 끝에 추가
              for (let i = 0; i < rawCharMsgs.length; i++) {
                if (seenIdx.has(i)) continue
                const final = rawCharMsgs[i]
                const isLast = i === lastCharIdxInCharMsgs
                merged.push({
                  ...final,
                  _round: roundId,
                  _streamIdx: i,
                  _streaming: false,
                  ...(isLast && data.affinityChange > 0 ? { affinityUp: true } : {}),
                })
              }
              return merged
            })
            const lastCharMsg = rawCharMsgs[rawCharMsgs.length - 1]
            if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
            setShowTyping(false)
            setSending(false)
            window.gtag?.('event', 'chat_message', { conversation_id: id })
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
            break
          }
          case 'error':
            console.error('Stream error:', data)
            handleRoundFailure(data)
            break
        }
      })
    } catch (error) {
      console.error(error)
      // Insufficient masks는 재시도해도 의미 없음 — 즉시 mask shop으로.
      if (error.message?.includes('Insufficient masks')) {
        setMessages((prev) => prev.filter((m) => m._round !== roundId && m.id !== tempUserMsg.id))
        setShowTyping(false)
        setSending(false)
        window.gtag?.('event', 'mask_depleted', { conversation_id: id })
        navigate('/mask-shop')
        return
      }
      handleRoundFailure({ refunded: true })
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

  const playAudio = useCallback((url, idx) => {
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
  }, [])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingAudioIdx(null)
  }, [])

  // setBackgroundImage 호출하는 안정화된 핸들러 (MessageBubble용)
  const handleSetBackground = useCallback((imageUrl) => {
    api.put(`/conversations/${id}/background`, { backgroundImage: imageUrl })
      .then(() => setBackgroundImage(imageUrl))
      .catch(() => {})
  }, [id])

  // 순차 등장 시 새 버블이 보이게 자동 스크롤
  const handleBubbleAppear = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // 입력창 커서 위치에 () 삽입. 선택 영역이 있으면 그 영역을 (괄호로) 감쌈.
  const handleInsertParens = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? input.length
    const end = textarea.selectionEnd ?? start
    const before = input.slice(0, start)
    const middle = input.slice(start, end)
    const after = input.slice(end)
    const newValue = `${before}(${middle})${after}`
    if (newValue.length > 300) return
    setInput(newValue)
    requestAnimationFrame(() => {
      textarea.focus()
      // 선택 영역이 있으면 닫는 괄호 다음, 없으면 괄호 안쪽에 커서 위치
      const cursorPos = end === start ? start + 1 : end + 1
      textarea.setSelectionRange(cursorPos, cursorPos)
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    })
  }, [input])

  // 채팅 투어 (early return 위에 hook 호출 — Rules of Hooks)
  const tourActive = !!user && !user.onboardingState?.chatTour
  const tourSteps = useMemo(() => [
    { page: 'chatTour', key: 'affinity', target: '[data-onboarding-target="affinity"]', caption: t('chatTour.affinity', { name: user?.name || '' }) },
    { page: 'chatTour', key: 'voice', target: '[data-onboarding-target="voice-btn"]', caption: t('chatTour.voice') },
    { page: 'chatTour', key: 'imageGen', target: '[data-onboarding-target="image-gen-btn"]', caption: t('chatTour.imageGen') },
    { page: 'chatTour', key: 'gallery', target: '[data-onboarding-target="gallery-btn"]', caption: t('chatTour.gallery') },
    {
      page: 'chatTour', key: 'galleryTabs',
      target: '[data-onboarding-target="gallery-tabs"]',
      caption: t('chatTour.galleryTabs'),
      onEnter: () => setShowGallery(true),
      enterDelay: 380,
    },
    {
      page: 'chatTour', key: 'attachFeed',
      target: '[data-onboarding-target="attach-feed"]',
      caption: t('chatTour.attachFeed'),
      onEnter: () => {
        const firstFeed = document.querySelector('[data-onboarding-target="first-feed"]')
        if (firstFeed) firstFeed.click()
      },
      enterDelay: 100,
    },
    { page: 'chatTour', key: 'changeBg', target: '[data-onboarding-target="change-bg"]', caption: t('chatTour.changeBg') },
  ], [user?.name, t])

  if (!conversation) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('common.loading')}</div>
  }

  const { character } = conversation
  const currentStyle = character.styles.find((s) => s.id === conversation.currentStyleId) || character.styles[0]
  const profileImg = character.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
  const profileUrl = getImageUrl(character.profileImage) || getImageUrl(profileImg?.filePath)
  const onlineStatus = getCharacterOnlineStatus(character.activeHours)

  const completeTour = () => {
    setUser({
      ...user,
      onboardingState: { ...(user.onboardingState || {}), chatTour: true },
    })
    api.patch('/auth/onboarding', { key: 'chatTour' }).catch(() => {})
  }

  const handleBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1)
    } else {
      navigate('/chats', { replace: true })
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0" style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}>
        <button onClick={handleBack} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
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
        {character.voiceId && user?.role === 'ADMIN' && (
          <button
            onClick={handleCallClick}
            className={`flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors ${
              showFreeCallBadge
                ? 'text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15'
                : 'text-gray-400 hover:text-indigo-300'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            title={t('chat.call.start')}
            aria-label={t('chat.call.start')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {showFreeCallBadge && (
              <span className="text-[10px] font-semibold leading-none">
                {t('chat.call.freeCount', { count: remainingFreeCalls })}
              </span>
            )}
          </button>
        )}
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
        {/* 상단 overlay — 상태 panel(접기 가능) + 액션 버튼 행 (항상 표시) */}
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          {showStatusPanel ? (
            <div className="bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 rounded-b-2xl px-4 pt-3 pb-3 shadow-xl animate-slide-down pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const status = characterStatus || getDefaultStatus(character.activeHours)
                const affinity = conversation.affinity ?? 0
                const affinityLabel = t(`chat.${getAffinityLabelKey(affinity)}`)
                return (
                  <div className="flex items-start gap-3">
                    <span className="text-3xl leading-none">{status.emoji}</span>
                    <div className="flex-1 min-w-0 grid grid-cols-3 gap-x-2 gap-y-2">
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
                      <div data-onboarding-target="affinity">
                        <p className="text-[10px] text-gray-500 mb-0.5">{t('chat.statusAffinity')}</p>
                        <p className="text-xs text-pink-300 truncate">❤️ {affinity} <span className="text-gray-400">· {affinityLabel}</span></p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] text-gray-500 mb-0.5">{t('chat.statusOutfit')}</p>
                        <p className="text-xs text-gray-200 truncate">{status.outfit || '-'}</p>
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
          ) : (
            <div className="flex justify-end px-3 pt-3 pointer-events-auto">
              <button
                onClick={() => setShowStatusPanel(true)}
                className="w-9 h-9 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 flex items-center justify-center shadow-lg hover:bg-gray-800/90 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                aria-label={t('chat.statusMood')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
            </div>
          )}

          {/* 액션 버튼 5개 — 상태 panel 바로 아래, 항상 표시 */}
          <div className="flex gap-2 justify-end px-3 pt-2 pointer-events-auto">
            <button
              onClick={() => setShowGiftSheet(true)}
              disabled={!token}
              className="w-11 h-11 rounded-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 flex items-center justify-center shadow-lg transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="선물하기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12" />
                <rect x="2" y="7" width="20" height="5" />
                <line x1="12" y1="22" x2="12" y2="7" />
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            </button>
            {(character.voiceId || tourActive) && (
              <div className="relative">
                {excitedTooltipVisible && characterStatus?.isExcited && (
                  <div
                    ref={excitedTooltipRef}
                    className="absolute top-full right-0 mt-2 px-3 py-2 bg-red-600 text-white text-xs rounded-lg shadow-lg whitespace-nowrap animate-slide-down z-30"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {t('chat.excitedTooltip')}
                    <div className="absolute bottom-full right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-red-600" />
                  </div>
                )}
                <button
                  ref={voiceButtonRef}
                  onClick={() => {
                    if (tourActive && !character.voiceId) return
                    setVoiceMode((v) => {
                      const next = !v
                      api.patch(`/conversations/${id}/voice-mode`, { enabled: next }).catch(() => {})
                      return next
                    })
                  }}
                  disabled={!token || (tourActive && !character.voiceId)}
                  className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                    characterStatus?.isExcited
                      ? 'bg-red-600 hover:bg-red-500 ring-2 ring-red-400'
                      : voiceMode
                        ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400'
                        : 'bg-gray-700 hover:bg-gray-600'
                  } disabled:opacity-40`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  data-onboarding-target="voice-btn"
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
              </div>
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
              data-onboarding-target="image-gen-btn"
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
                <div className="absolute top-full right-0 mt-2 whitespace-nowrap pointer-events-none animate-fade-in z-30">
                  <div className="relative bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg">
                    {galleryTooltipText}
                    <div className="absolute bottom-full right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white" />
                  </div>
                </div>
              )}
              <button
                onClick={() => { setShowGallery(true); setShowGalleryTooltip(false); setShowGalleryBadge(false) }}
                className="relative w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-lg transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                data-onboarding-target="gallery-btn"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {showGalleryBadge && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" />}
              </button>
            </div>
            <button
              onClick={() => setShowModelSheet(true)}
              disabled={!token}
              className={`h-11 px-3 rounded-full text-white text-xs font-semibold flex items-center gap-1 shadow-lg transition-colors ${
                chatModel === 'ADVANCED'
                  ? 'bg-amber-600 hover:bg-amber-500 ring-2 ring-amber-400'
                  : 'bg-gray-700 hover:bg-gray-600'
              } disabled:opacity-40`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label={t('chat.modelSelectorTitle')}
              data-onboarding-target="model-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {chatModel === 'ADVANCED' ? t('chat.modelAdvanced') : t('chat.modelBasic')}
            </button>
          </div>
        </div>

      <div ref={scrollContainerRef} className="h-full overflow-auto px-4 py-3 space-y-2" style={backgroundImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {/* 페이지네이션: 시작부터 표시 중일 때만 인트로 카드, 그 외엔 sentinel로 위로 스크롤 시 추가 로드 */}
        {visibleStart === 0 ? (
          profileUrl && (
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
          )
        ) : (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            <div className="text-[11px] text-gray-500">{t('chat.loadingMore', { defaultValue: '이전 대화 불러오는 중...' })}</div>
          </div>
        )}
        {visibleMessages.map((msg, i) => {
          const idx = visibleStart + i
          const prevMsg = messages[idx - 1]
          const nextMsg = messages[idx + 1]
          const isConsecutive = prevMsg?.role === msg.role
          const showTime = msg.createdAt && (
            !nextMsg || nextMsg.role !== msg.role || nextMsg.role === 'NARRATION' || nextMsg.role === 'GENERATED_IMAGE' ||
            formatChatTime(msg.createdAt) !== formatChatTime(nextMsg.createdAt)
          )
          return (
            <MessageBubble
              key={msg.id || idx}
              msg={msg}
              msgIdx={idx}
              isConsecutive={isConsecutive}
              showTime={showTime}
              profileUrl={profileUrl}
              characterName={character.name}
              isLastChar={idx === lastCharIdx}
              latestResponseAudios={latestResponseAudios}
              isPlayingAll={isPlayingAll}
              isThisPlayingAudio={playingAudioIdx === idx}
              onLightbox={setLightboxUrl}
              onPlayAudio={playAudio}
              onStopAudio={stopAudio}
              onSetBackground={handleSetBackground}
              onPlayAll={playAllLatestAudios}
              onStopAll={stopAllPlayback}
              onAppear={handleBubbleAppear}
              t={t}
            />
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

      <div className="flex-shrink-0 p-3 pt-3 border-t border-gray-800 bg-gray-900/95" style={{ paddingBottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 8px)' }}>
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
        <div className="flex gap-2 items-end">
          <textarea ref={textareaRef} value={input} maxLength={300} onChange={(e) => { setInput(e.target.value.slice(0, 300)); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} placeholder={t('chat.inputPlaceholder')} rows={1} className="flex-1 h-10 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none" />
          <button
            onClick={handleInsertParens}
            type="button"
            title={t('chat.insertActionParens', { defaultValue: '행동 묘사 ( ) 추가' })}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-[15px] font-mono leading-none">( )</span>
          </button>
          <div className="relative flex-shrink-0">
            {(() => {
              const cost = (chatModel === 'ADVANCED' ? 3 : 1) + (voiceMode && character?.voiceId ? 4 : 0)
              if (cost <= 1) return null
              const color = chatModel === 'ADVANCED' ? 'text-amber-400' : 'text-emerald-400'
              return (
                <span className={`absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap ${color} flex items-center gap-0.5`}>-{cost} <MaskIcon className="text-base" /></span>
              )
            })()}
            <button onClick={send} disabled={!input.trim() || sending} className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      </div>
      {showModelSheet && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowModelSheet(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.modelSelectorTitle')}</p>
            <p className="text-gray-400 text-xs text-center mb-4">{t('chat.modelSelectorDesc')}</p>
            <div className="flex flex-col gap-2">
              {[
                { key: 'BASIC', label: t('chat.modelBasic'), desc: t('chat.modelBasicDesc'), cost: 1 },
                { key: 'ADVANCED', label: t('chat.modelAdvanced'), desc: t('chat.modelAdvancedDesc'), cost: 3 },
              ].map((opt) => {
                const selected = chatModel === opt.key
                const costLabel = t('chat.maskCostLabel', { count: opt.cost })
                return (
                  <button
                    key={opt.key}
                    onClick={() => { setChatModel(opt.key); setShowModelSheet(false) }}
                    className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                      selected
                        ? (opt.key === 'ADVANCED'
                          ? 'bg-amber-600/20 border-amber-500'
                          : 'bg-indigo-600/20 border-indigo-500')
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200'}`}>{opt.label}</span>
                      <span className={`text-xs font-medium flex items-center gap-1 ${opt.key === 'ADVANCED' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {costLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
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
      {showGiftSheet && (
        <GiftBottomSheet
          characterId={conversation.characterId}
          characterName={character.name}
          conversationId={conversation.id}
          onClose={() => setShowGiftSheet(false)}
          onGiftSent={({ message, thanksMessages = [], imageBubble, affinity }) => {
            // 선물 GIFT 버블 → 캐릭터 감사 인사 → (있다면) 이미지 버블 순으로 append
            setMessages((prev) => [
              ...prev,
              message,
              ...thanksMessages,
              ...(imageBubble ? [imageBubble] : []),
            ])

            // 호감도 반영
            if (typeof affinity === 'number') {
              setConversation((prev) => prev ? { ...prev, affinity } : prev)
            }

            // 이미지 버블이 추가됐다면 갤러리 버튼 툴팁 노출
            if (imageBubble) {
              setGalleryTooltipText('선물 이미지가 추가됐어요!')
              setShowGalleryTooltip(true)
              // 5초 후 자동으로 숨김
              setTimeout(() => setShowGalleryTooltip(false), 5000)
            }
          }}
          onOutfitApplied={({ messages: appliedMessages = [], characterStatus: newStatus }) => {
            // 캐릭터 반응 메시지 append + characterStatus(복장 텍스트) 갱신
            setMessages((prev) => [...prev, ...appliedMessages])
            if (newStatus && typeof newStatus === 'object') {
              setCharacterStatus(newStatus)
              setConversation((prev) => prev ? { ...prev, characterStatus: newStatus } : prev)
            }
          }}
        />
      )}
      {lightboxUrl && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
      <OnboardingSpotlight
        active={tourActive}
        steps={tourSteps}
        onComplete={completeTour}
      />

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
      <CallSheet
        open={!!activeCallMode}
        onClose={() => {
          setActiveCallMode(null)
          // 통화 종료 후 freeCallUses 최신화 (서버 진실)
          if (token) api.get('/auth/me').then(({ user: u }) => setUser(u)).catch(() => {})
        }}
        onFreeUsesExhausted={() => {
          setActiveCallMode(null)
          setShowLightOnlyModal(true)
          if (token) api.get('/auth/me').then(({ user: u }) => setUser(u)).catch(() => {})
        }}
        conversationId={conversation?.id}
        character={character}
        profileUrl={profileUrl}
        characterStatus={characterStatus}
        affinity={conversation?.affinity ?? 0}
        callMode={activeCallMode || 'continue'}
      />

      {/* 무료 통화 횟수 소진 시 안내 모달 */}
      {showLightOnlyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setShowLightOnlyModal(false)}>
          <div
            className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{t('chat.call.lightOnlyTitle')}</h3>
              <p className="text-sm text-gray-400 whitespace-pre-line mb-5">{t('chat.call.lightOnlyDesc')}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setShowLightOnlyModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t('common.close')}
                </button>
                <button
                  onClick={() => { setShowLightOnlyModal(false); navigate('/subscription') }}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t('chat.call.viewSubscription')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 통화 모드 선택 바텀시트 */}
      {showCallChooser && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowCallChooser(false)}>
          <div
            className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-base font-semibold mb-1">{t('chat.call.chooseTitle')}</h3>
            <p className="text-gray-400 text-xs mb-4">{t('chat.call.chooseDesc')}</p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { setActiveCallMode('continue'); setShowCallChooser(false) }}
                className="text-left bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-4 py-3 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="text-indigo-200 font-medium text-sm">{t('chat.call.modeContinue')}</div>
                <div className="text-gray-400 text-xs mt-1">{t('chat.call.modeContinueDesc')}</div>
              </button>
              <button
                onClick={() => { setActiveCallMode('simple'); setShowCallChooser(false) }}
                className="text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="text-gray-100 font-medium text-sm">{t('chat.call.modeSimple')}</div>
                <div className="text-gray-400 text-xs mt-1">{t('chat.call.modeSimpleDesc')}</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
