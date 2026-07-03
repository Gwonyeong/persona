import { Fragment, useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
// 통화 기능이 V2에 없어 마이크/앱 업데이트 체크 의존성도 제거.
import useStore from '../../store/useStore'
import GalleryBottomSheet from '../../components/GalleryBottomSheet'
import EventsBottomSheet from '../../components/EventsBottomSheet'
import EpisodeStartOverlay from '../../components/EpisodeStartOverlay'
import ReportModal from '../../components/ReportModal'
import OnboardingSpotlight from '../../components/OnboardingSpotlight'
import MaskIcon from '../../components/MaskIcon'
// V2는 통화 기능 미지원 — CallSheet 미사용.
import InsufficientMasksModal from '../../components/InsufficientMasksModal'
import { getPushPermissionStatus, requestPushPermission } from '../../lib/push'
import useBackHandler from '../../hooks/useBackHandler'
import { formatChatTime } from '../../lib/timeFormat'
// import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

// sprite URL이 비디오인지 판별. Supabase 업로드 시 원본 확장자가 보존됨 (sprites/.../EMOTION_uid.mp4).
function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const clean = url.split('?')[0].toLowerCase()
  return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v')
}

// 비디오면 <video>, 이미지면 <img>. sprite는 음소거 자동재생/루프.
// 비율 무관하게 하단 정렬 (object-bottom) — 1:1 이미지 등도 9:16 프레임 하단에 붙어 출력됨.
function SpriteMedia({ src, className = '' }) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return <img src={src} alt="" className={className} loading="lazy" />
}

// CallSheet 패턴 — 두 슬롯(A, B)에 이전/현재 URL을 번갈아 두고 opacity 토글로 크로스페이드.
// `src` 변경 시 inactive 슬롯에 새 URL을 넣고 active 토글 → 옛 슬롯은 1→0, 새 슬롯은 0→1.
// variant: 'img' (정적 img) | 'sprite' (video URL 처리 포함)
function CrossfadeMedia({ src, className = '', style, fadeMs = 500, variant = 'img' }) {
  const [layers, setLayers] = useState({ A: null, B: null })
  const [activeSlot, setActiveSlot] = useState('A')
  const lastSrcRef = useRef(null)

  useEffect(() => {
    if (!src) return
    if (lastSrcRef.current === src) return
    lastSrcRef.current = src
    setActiveSlot((prev) => {
      const next = prev === 'A' ? 'B' : 'A'
      setLayers((prevLayers) => ({ ...prevLayers, [next]: src }))
      return next
    })
  }, [src])

  const renderSlot = (slot) => {
    const url = layers[slot]
    const slotStyle = {
      ...style,
      opacity: url && activeSlot === slot ? 1 : 0,
      transition: `opacity ${fadeMs}ms ease-in-out`,
      visibility: url ? 'visible' : 'hidden',
    }
    if (!url) {
      return <div key={slot} className={className} style={slotStyle} aria-hidden="true" />
    }
    if (variant === 'sprite' && isVideoUrl(url)) {
      return (
        <video
          key={slot}
          src={url}
          className={className}
          style={slotStyle}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )
    }
    return (
      <img
        key={slot}
        src={url}
        alt=""
        className={className}
        style={slotStyle}
        loading="lazy"
        draggable={false}
        aria-hidden="true"
      />
    )
  }

  return (
    <>
      {renderSlot('A')}
      {renderSlot('B')}
    </>
  )
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

// V2 스트리밍 메시지의 인위적 char 노출 속도 (ms/글자).
// 위쪽 TYPING_SPEED_MS(자모 typewriter 훅용)와는 별개 — V2는 char 단위 단순 typewriter.
// 0이면 비활성 (즉시 전체 표시). 환경변수로 오버라이드 가능.
const V2_CHAR_TYPING_MS = Number(import.meta.env.VITE_V2_TYPING_SPEED_MS) || 25

// 캐릭터 상태(시간/장소/기분 등) 변화를 메시지 위에 작은 카드로 표시.
// 표시할 필드 + 라벨 + 아이콘 매핑.
const STATUS_DIFF_FIELDS = [
  { key: 'timeLabel', icon: '🕐' },
  { key: 'location', icon: '📍' },
  { key: 'activity', icon: '💼' },
  { key: 'mood', icon: '😌' },
  { key: 'outfit', icon: '👕' },
]

function computeStatusDiff(prev, curr) {
  if (!prev || !curr) return null
  const changes = []
  for (const f of STATUS_DIFF_FIELDS) {
    const a = (prev[f.key] || '').trim()
    const b = (curr[f.key] || '').trim()
    if (a && b && a !== b) changes.push({ icon: f.icon, from: a, to: b })
  }
  return changes.length > 0 ? changes : null
}

// MEETING ↔ DM 모드 전환 시점에 그어지는 강조 디바이더.
// 같이 있던 → 떨어진 (DM) 또는 떨어져 있던 → 같이 있게 됨 (MEETING) 전환을 시각적으로 명확히.
function ModeChangeDivider({ to }) {
  const isMeeting = to === 'MEETING'
  return (
    <div className="flex items-center gap-2 my-5 px-4">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gray-600/50" />
      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm ${
        isMeeting
          ? 'bg-amber-500/10 border-amber-400/40'
          : 'bg-indigo-500/10 border-indigo-400/40'
      }`}>
        <span className="text-sm leading-none">{isMeeting ? '🤝' : '📱'}</span>
        <span className={`text-[11px] font-semibold tracking-wide ${
          isMeeting ? 'text-amber-200' : 'text-indigo-200'
        }`}>
          {isMeeting ? '함께 있음' : '메신저 대화'}
        </span>
      </div>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gray-600/50" />
    </div>
  )
}

// 상태 패널 — 시간/에피소드/기분/장소/활동/호감도/복장 표시.
// 각 행마다 useChangeHighlight 훅 사용하므로 별도 컴포넌트로 분리 (IIFE 안에서는 훅 호출 불가).
// 변경된 항목은 라벨 색이 emerald-300으로 강조 + 4초 후 원복.
function StatusPanel({ status, currentTimeLabel, activeEpisode, affinity, affinityLabel, t }) {
  const moodH = useChangeHighlight(status.mood)
  const locationH = useChangeHighlight(status.location)
  const activityH = useChangeHighlight(status.activity)
  const outfitH = useChangeHighlight(status.outfit)
  const timeH = useChangeHighlight(currentTimeLabel)
  const episodeH = useChangeHighlight(activeEpisode?.id)

  const labelBase = 'text-[10px] font-medium w-12 flex-shrink-0 transition-colors duration-500'
  const labelOn = 'text-emerald-300'
  const labelOff = 'text-gray-300'

  return (
    <div className="flex items-start gap-3">
      <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{status.emoji}</span>
      <div className="flex-1 min-w-0 space-y-1.5">
        {currentTimeLabel && (
          <div className="flex items-baseline gap-2">
            <span className={`${labelBase} ${timeH ? labelOn : labelOff}`}>시간</span>
            <span className="text-xs text-amber-200">⏰ <TypingText value={currentTimeLabel} /></span>
          </div>
        )}
        {activeEpisode && activeEpisode.snapshot && (
          <div className="flex items-baseline gap-2">
            <span className={`${labelBase} ${episodeH ? labelOn : labelOff}`}>에피소드</span>
            <span className="text-xs text-violet-200">
              🎬 <TypingText value={activeEpisode.snapshot.title} />
              <span className="text-gray-400 ml-1">({(activeEpisode.turnsElapsed ?? 0) + 1}/{activeEpisode.snapshot.duration})</span>
            </span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className={`${labelBase} ${moodH ? labelOn : labelOff}`}>{t('chat.statusMood')}</span>
          <TypingText value={status.mood} className="text-xs text-gray-200" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`${labelBase} ${locationH ? labelOn : labelOff}`}>{t('chat.statusLocation')}</span>
          <TypingText value={status.location} className="text-xs text-gray-200" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`${labelBase} ${activityH ? labelOn : labelOff}`}>{t('chat.statusActivity')}</span>
          <TypingText value={status.activity} className="text-xs text-gray-200" />
        </div>
        <div className="flex items-baseline gap-2" data-onboarding-target="affinity">
          <span className={`${labelBase} ${labelOff}`}>{t('chat.statusAffinity')}</span>
          <span className="text-xs text-pink-300">❤️ {affinity} <span className="text-gray-400">· {affinityLabel}</span></span>
        </div>
        {status.outfit && (
          <div className="flex items-baseline gap-2">
            <span className={`${labelBase} ${outfitH ? labelOn : labelOff}`}>{t('chat.statusOutfit')}</span>
            <TypingText value={status.outfit} className="text-xs text-gray-200" />
          </div>
        )}
      </div>
    </div>
  )
}

// 값이 바뀐 직후 일정 시간 동안 highlighted=true. 첫 마운트나 빈 → 값 전환은 highlight 안 함.
function useChangeHighlight(value, durationMs = 4000) {
  const [highlighted, setHighlighted] = useState(false)
  const prevRef = useRef(value)
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = value
    if (prev !== undefined && prev !== '' && prev !== value) {
      setHighlighted(true)
      const tid = setTimeout(() => setHighlighted(false), durationMs)
      return () => clearTimeout(tid)
    }
  }, [value, durationMs])
  return highlighted
}

// 상태 패널 텍스트 — 값이 바뀔 때만 한 글자씩 타이핑되어 등장. 동일하면 즉시 표시.
// 첫 마운트도 즉시 (페이지 진입 시 모든 행이 타이핑되면 어색).
function TypingText({ value, speedMs = 35, className = '' }) {
  const target = String(value ?? '')
  const [display, setDisplay] = useState(target)
  const prevTargetRef = useRef(target)
  useEffect(() => {
    if (target === prevTargetRef.current) return
    prevTargetRef.current = target
    // 값 변경 — 빈 문자열에서 타이핑 시작
    setDisplay('')
  }, [target])
  useEffect(() => {
    if (display === target) return
    if (display.length < target.length) {
      const tid = setTimeout(() => {
        setDisplay(target.slice(0, display.length + 1))
      }, speedMs)
      return () => clearTimeout(tid)
    }
    // target이 더 짧아진 경우 즉시 동기화
    setDisplay(target)
  }, [display, target, speedMs])
  return <span className={className}>{display}</span>
}

function StatusChangeCard({ changes }) {
  if (!changes || changes.length === 0) return null
  return (
    <div className="flex justify-center my-3">
      <div className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 bg-gray-800/40 border border-gray-700/40 rounded-xl px-3 py-1.5 max-w-[92%]">
        {changes.map((c, i) => (
          <span key={i} className="text-[11px] flex items-center gap-1 leading-tight">
            <span>{c.icon}</span>
            <span className="text-gray-500 line-through max-w-[90px] truncate">{c.from}</span>
            <span className="text-gray-500">→</span>
            <span className="text-emerald-300 font-medium max-w-[110px] truncate">{c.to}</span>
          </span>
        ))}
      </div>
    </div>
  )
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
  chatMode,
  isMyTypingTurn = true,
  onTypingComplete,
  onLightbox,
  onPlayAudio,
  onStopAudio,
  onSetBackground,
  onPlayAll,
  onStopAll,
  onAppear,
  t,
}) {
  // 라이브 스트리밍: 서버가 delta 이벤트로 content를 점진적으로 갱신.
  const isStreamingBubble = msg._streaming === true
  // 새 버블이 등장하거나, 숨김 상태에서 자기 차례가 되어 등장할 때 스크롤 따라가기.
  useEffect(() => {
    if ((isStreamingBubble || isMyTypingTurn) && msg._round && onAppear) onAppear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreamingBubble, isMyTypingTurn])

  // Typewriter 효과 — msg.content가 갱신될 때마다 displayContent를 한 글자씩 따라잡으며 노출.
  // V2_CHAR_TYPING_MS=0이면 비활성 (즉시 전체 표시).
  // 첫 마운트 분기:
  //   · _round 있음(이번 라이브 라운드의 새 메시지, CHARACTER/NARRATION/NPC 모두 포함) → 빈 문자열로 시작 → typewriter
  //   · _round 없음(히스토리/USER) → 즉시 전체
  const [displayContent, setDisplayContent] = useState(() =>
    (msg._round && V2_CHAR_TYPING_MS > 0) ? '' : (msg.content || '')
  )
  useEffect(() => {
    const target = msg.content || ''
    if (V2_CHAR_TYPING_MS <= 0) {
      if (displayContent !== target) setDisplayContent(target)
      return
    }
    // 라이브 라운드 메시지인데 아직 내 차례가 아니면 대기 (displayContent 빈 채로 유지)
    if (msg._round && !isMyTypingTurn) {
      return
    }
    if (displayContent.length >= target.length) {
      if (displayContent !== target) setDisplayContent(target)
      return
    }
    const tid = setTimeout(() => {
      setDisplayContent(target.slice(0, displayContent.length + 1))
    }, V2_CHAR_TYPING_MS)
    return () => clearTimeout(tid)
  }, [msg.content, displayContent, isMyTypingTurn, msg._round])

  // typewriter 완료 알림 — 같은 라운드 다음 메시지 차례로 넘김.
  // 한 메시지에 대해 한 번만 발사 (ref로 가드).
  const typingCompletedRef = useRef(false)
  useEffect(() => {
    typingCompletedRef.current = false
  }, [msg._round, msg._streamIdx])
  useEffect(() => {
    if (typingCompletedRef.current) return
    if (!msg._round) return
    const target = msg.content || ''
    // 완료 조건: target이 일정 길이 이상이고 displayContent가 따라잡았으며 이번 차례인 경우
    if (!isMyTypingTurn) return
    if (displayContent.length < target.length) return
    if (target.length === 0) return
    typingCompletedRef.current = true
    onTypingComplete?.(msg._round, msg._streamIdx ?? 0)
  }, [displayContent, msg.content, isMyTypingTurn, msg._round, msg._streamIdx, onTypingComplete])

  const isNormalMode = chatMode === 'NORMAL'

  const segments = useMemo(() => {
    if (msg.role !== 'CHARACTER' && msg.role !== 'USER' && msg.role !== 'NPC') return null
    // displayContent 기반 — typewriter가 점진적으로 노출하는 그 시점의 텍스트.
    const parsed = parseMessageSegments(displayContent || '', msg.role)
    if (isNormalMode) return parsed.filter((s) => s.type !== 'action')
    return parsed
  }, [displayContent, msg.role, isNormalMode])

  // 라이브 라운드 메시지인데 아직 typing 차례가 안 왔으면 버블 자체 숨김 — 빈 버블이 미리 생성되는 어색함 제거.
  if (msg._round && !isMyTypingTurn && (displayContent || '').length === 0) {
    return null
  }

  if (msg.role === 'NARRATION') {
    // NORMAL 모드: 별도 NARRATION 메시지는 숨김.
    if (isNormalMode) return null
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-2 max-w-[85%]">
          <p className="text-xs text-gray-400 text-center italic leading-relaxed">{displayContent || ''}</p>
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

  // NORMAL 모드에서 캐릭터/유저 메시지의 모든 세그먼트가 action(행동 묘사)이어서 필터링 후 본문이 비면 버블을 숨김.
  // (단, 미디어/오디오 등 표시할 다른 요소가 있으면 유지)
  if (isNormalMode && (msg.role === 'CHARACTER' || msg.role === 'USER' || msg.role === 'NPC')) {
    const hasText = segments && segments.some((s) => (s.value || '').trim().length > 0)
    const hasExtras = !!(msg.feedImage || (msg.role === 'CHARACTER' && msg.audioUrl))
    if (!hasText && !hasExtras) return null
  }

  // NPC는 캐릭터 버블과 동일한 UI를 사용하되 아바타는 기본 프로필 아이콘으로.
  const isCharLike = msg.role === 'CHARACTER' || msg.role === 'NPC'
  const displayName = msg.role === 'NPC' ? (msg.npcName || '제 3자') : characterName
  return (
    <div className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'} ${isConsecutive ? '' : 'mt-3'}`}>
      {isCharLike && (
        <div className="w-7 flex-shrink-0 mr-2">
          {!isConsecutive ? (
            msg.role === 'NPC' ? (
              // 기본 프로필 아이콘 — 회색 원 안에 사람 SVG
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden cursor-pointer" onClick={() => profileUrl && onLightbox(profileUrl)}>
                {profileUrl ? <img src={profileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>}
              </div>
            )
          ) : null}
        </div>
      )}
      <div className="max-w-[75%]">
        {isCharLike && !isConsecutive && <p className="text-xs text-gray-400 mb-1 font-medium">{displayName}</p>}
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

// V2 채팅 화면 — Chat.jsx에서 fork한 독립 컴포넌트 (2026-06-03).
// V1과 동일한 UI/상호작용을 유지하되, 채팅 데이터 API만 /v2/conversations 라우트로 호출한다.
// TTS, 이미지 생성, safety/voice/background/call, gallery, read 등 부가 API는 V1 라우트 그대로 사용.
// V1 Chat.jsx와는 이 시점 이후로 독립적으로 진화한다 — 한쪽 수정이 다른 쪽에 자동 반영되지 않음.
export default function ChatV2() {
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
  // V2 typewriter — 같은 라운드의 메시지들이 순차적으로 typing되도록 큐 관리.
  // { round: <roundId>, idx: <다음 차례 _streamIdx> }. 새 라운드 시작 시 자동 reset.
  const [typingHead, setTypingHead] = useState({ round: null, idx: 0 })
  const handleTypingComplete = useCallback((round, streamIdx) => {
    setTypingHead((prev) => {
      // 같은 라운드인데 이미 더 앞으로 진행한 경우만 무시.
      // 다른 라운드(prev.round=null 또는 이전 round)이거나 같은 라운드의 동등/큰 idx면 갱신.
      if (prev.round === round && prev.idx > streamIdx) return prev
      return { round, idx: streamIdx + 1 }
    })
  }, [])
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  // 본인인증 유도 모달: Safety ON 상태에서 유저가 성적 시도를 감지했을 때 (세션당 1회).
  const [showAdultVerifyPrompt, setShowAdultVerifyPrompt] = useState(false)
  // 마스크 부족 모달 — actionType: 'message' | 'image' | 'tts'
  const [insufficientMasksFor, setInsufficientMasksFor] = useState(null)
  const [showGallery, setShowGallery] = useState(false)
  const [attachedFeed, setAttachedFeed] = useState(null)
  // 채팅방 전체 배경 — 유저가 갤러리에서 선택. AI가 덮어쓰지 않음.
  const [backgroundImage, setBackgroundImage] = useState(null)
  // 캐릭터 표정 sprite 뒤 backdrop — AI가 scene에 따라 자동 선택. 채팅방 배경과 독립.
  const [spriteBackgroundImage, setSpriteBackgroundImage] = useState(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [showGalleryTooltip, setShowGalleryTooltip] = useState(false)
  const [galleryTooltipText, setGalleryTooltipText] = useState('')
  const [showImageGenModal, setShowImageGenModal] = useState(false)
  const [showSelfieModal, setShowSelfieModal] = useState(false)
  const [previewFeedImages, setPreviewFeedImages] = useState([])
  const [characterStatus, setCharacterStatus] = useState(null)
  // V2 전용 — 채팅 내 가상 시간 (계절/날짜/요일/시간대). 서버 응답에 포함되어 들어옴.
  const [currentTime, setCurrentTime] = useState(null)
  const [currentTimeLabel, setCurrentTimeLabel] = useState(null)
  // V2 전용 — 현재 진행 중인 에피소드 (id/snapshot/turnsElapsed). null이면 없음.
  const [activeEpisode, setActiveEpisode] = useState(null)
  // 에피소드 시작/완료 토스트 — done 이벤트에서 잠깐 노출.
  const [episodeToast, setEpisodeToast] = useState(null)
  // V2 전용 — 이벤트 바텀시트 + episodes 목록 (활성/미진행/완료 상태 포함).
  const [showEvents, setShowEvents] = useState(false)
  const [episodes, setEpisodes] = useState([])
  // V2 전용 — 에피소드 시작 풀화면 오버레이. done.episodeStarted 시점에 활성 에피소드 셋업.
  const [startOverlayEpisode, setStartOverlayEpisode] = useState(null)
  const [showStatusPanel, setShowStatusPanel] = useState(true)
  const [showInputButtons, setShowInputButtons] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  // Safety Mode: true=SFW 유지(기본), false=NSFW 허용. 인증된 유저만 OFF 가능.
  const [safetyMode, setSafetyMode] = useState(true)
  const [safetyConfirmVisible, setSafetyConfirmVisible] = useState(false)
  // 표정 sprite 출력 모드: 'FULL' | 'BUBBLE'(기본) | 'OFF'. 설정 페이지에서 변경.
  const [spriteMode, setSpriteMode] = useState('BUBBLE')
  // 메시지 출력 모드: 'ROLEPLAY'(기본) — 나레이션·행동까지 표시 / 'NORMAL' — 대사만 표시. 설정 페이지에서 변경.
  const [chatMode, setChatMode] = useState('ROLEPLAY')
  const [chatModel, setChatModel] = useState('ADVANCED') // 'BASIC' (Mistral) | 'ADVANCED' (Grok 4.3)
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
  const adultVerifyPromptShownRef = useRef(false)
  const messagesEndRef = useRef(null)
  const initialLoadRef = useRef(true)
  const token = useStore((s) => s.token)
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const subscriptionTier = useStore((s) => s.subscription?.tier) || 'FREE'

  // 무료 보이스 채팅 잔여 횟수 — FREE 티어 한정, voiceWithChat 사용 시 +4 마스크 면제
  const remainingFreeVoiceUses = user?.freeVoiceUses ?? 0
  const canUseFreeVoice = subscriptionTier === 'FREE' && remainingFreeVoiceUses > 0
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
  useBackHandler(showAdultVerifyPrompt, () => setShowAdultVerifyPrompt(false))
  useBackHandler(showGallery, () => setShowGallery(false))
  useBackHandler(showImageGenModal, () => setShowImageGenModal(false))
  useBackHandler(showSelfieModal, () => setShowSelfieModal(false))
  useBackHandler(showReport, () => setShowReport(false))
  useBackHandler(showModelSheet, () => setShowModelSheet(false))

  const showError = (msg, duration = 3000) => {
    setErrorToast(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setErrorToast(null), duration)
  }

  useEffect(() => {
    initialLoadRef.current = true
    api.get(`/v2/conversations/${id}/messages`).then(({ conversation: conv }) => {
      setConversation(conv)
      setBackgroundImage(conv.backgroundImage || null)
      setSpriteBackgroundImage(conv.spriteBackgroundImage || null)
      if (conv.characterStatus) setCharacterStatus(conv.characterStatus)
      if (conv.currentTime) setCurrentTime(conv.currentTime)
      if (conv.currentTimeLabel) setCurrentTimeLabel(conv.currentTimeLabel)
      if (conv.activeEpisode !== undefined) setActiveEpisode(conv.activeEpisode)
      if (Array.isArray(conv.episodes)) setEpisodes(conv.episodes)
      // 오프닝 에피소드 — 채팅방 생성 직후(아직 메시지 0개) + 활성 에피소드가 있으면 시작 오버레이 노출.
      // preset.openingEpisode가 init 시점에 dataV2.activeEpisode로 박혀 들어옴 → 첫 진입 시 이 조건 만족.
      // 한 번이라도 메시지를 보내면 messages.length > 0이 되어 다시 진입해도 안 뜸.
      if ((conv.messages?.length ?? 0) === 0 && conv.activeEpisode) {
        setStartOverlayEpisode(conv.activeEpisode)
      }
      setVoiceMode(!!conv.voiceMode)
      setSafetyMode(conv.safetyMode !== false)
      setSpriteMode(['FULL', 'BUBBLE', 'BACKGROUND', 'OFF'].includes(conv.spriteMode) ? conv.spriteMode : 'BUBBLE')
      setChatMode(conv.chatMode === 'NORMAL' ? 'NORMAL' : 'ROLEPLAY')
      setChatModel(conv.chatModel === 'BASIC' ? 'BASIC' : 'ADVANCED')
      setMessages(conv.messages.filter((m) => m.role === 'CHARACTER' || m.role === 'USER' || m.role === 'GENERATED_IMAGE' || m.role === 'NARRATION' || m.role === 'NPC' || m.role === 'GIFT'))
      const lastCharMsg = [...conv.messages].reverse().find((m) => m.role === 'CHARACTER')
      if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
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
      await api.stream(`/v2/conversations/${id}/messages`, body, (event, data) => {
        switch (event) {
          case 'delta': {
            // 라이브 모드: 토큰 단위 스트리밍. 같은 idx에 대한 delta는 기존 버블의 content를 갱신.
            // NPC 버블은 npcName도 같이 받음 (V2 한정).
            const { idx, role, content, complete, npcName } = data
            setShowTyping(false)
            setMessages((prev) => {
              const base = prev.some((m) => m.id === tempUserMsg.id)
                ? [...prev.filter((m) => m.id !== tempUserMsg.id), confirmedUserMsg]
                : prev
              const existingI = base.findIndex(
                (m) => m._round === roundId && m._streamIdx === idx,
              )
              if (existingI >= 0) {
                const updated = [...base]
                updated[existingI] = {
                  ...updated[existingI],
                  role,
                  content,
                  ...(npcName !== undefined ? { npcName } : {}),
                  _streaming: !complete,
                }
                return updated
              }
              return [
                ...base,
                {
                  role,
                  content,
                  ...(npcName !== undefined ? { npcName } : {}),
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
            const rawCharMsgs = responseMessages.filter((m) => m.role === 'CHARACTER' || m.role === 'NARRATION' || m.role === 'NPC')
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
                    ...(final.statusSnapshot ? { statusSnapshot: final.statusSnapshot } : {}),
                    ...(final.npcName ? { npcName: final.npcName } : {}),
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
            // Safety ON 상태에서 유저가 성적 시도 → 세이프티 모드를 끌 수 있음을 안내 (세션당 1회).
            // 인증 여부와 무관하게 노출. 인증 상태에 따라 CTA만 분기 (모달 UI에서 처리).
            if (
              data.userNsfwAttempt === true
              && !adultVerifyPromptShownRef.current
            ) {
              adultVerifyPromptShownRef.current = true
              setShowAdultVerifyPrompt(true)
              window.gtag?.('event', 'nsfw_attempt_detected', {
                conversation_id: id,
                adult_verified: user?.adultVerified ? 1 : 0,
              })
            }
            if (data.affinity !== undefined) {
              setConversation((prev) => ({ ...prev, affinity: data.affinity }))
            }
            if (data.characterStatus) {
              setCharacterStatus(data.characterStatus)
            }
            // V2 — Planner가 시간 이동을 결정했으면 currentTime 갱신
            if (data.currentTime) setCurrentTime(data.currentTime)
            if (data.currentTimeLabel) setCurrentTimeLabel(data.currentTimeLabel)
            // V2 — 에피소드 상태 갱신 + 시작/완료 토스트
            if (data.activeEpisode !== undefined) setActiveEpisode(data.activeEpisode)
            if (Array.isArray(data.episodes)) setEpisodes(data.episodes)
            // 에피소드 시작 — 풀화면 딤드 오버레이 (1초 hold-to-dismiss)
            if (data.episodeStarted && data.activeEpisode) {
              setStartOverlayEpisode(data.activeEpisode)
            } else if (data.episodeCompleted) {
              // 성공 보상 토스트 — 호감도/친밀도 변화 표시
              const reward = data.episodeReward
              if (reward && (reward.affinity > 0 || reward.familiarity > 0)) {
                setEpisodeToast({
                  kind: 'reward',
                  title: '에피소드 성공',
                  affinity: reward.affinity,
                  familiarity: reward.familiarity,
                })
                setTimeout(() => setEpisodeToast(null), 4000)
              } else {
                setEpisodeToast({ kind: 'complete', title: '에피소드 종료' })
                setTimeout(() => setEpisodeToast(null), 2500)
              }
            }
            // AI가 선택한 배경은 표정 sprite의 backdrop으로만 사용
            if (data.spriteBackgroundImage !== undefined) {
              setSpriteBackgroundImage(data.spriteBackgroundImage)
            }
            // V2 — 채팅방 자체 배경(backgroundImage)도 AI가 mode 기반 자동 갱신.
            // 변경된 경우에만 done에 포함되어 옴 (null이면 메신저 모드라 배경 제거).
            if (data.backgroundImage !== undefined) {
              setBackgroundImage(data.backgroundImage)
            }
            // 무료 보이스 사용 시 잔여 횟수 동기화 (서버 진실)
            if (data.consumedFreeVoice && typeof data.freeVoiceUses === 'number' && user) {
              setUser({ ...user, freeVoiceUses: data.freeVoiceUses })
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
      // 미성년 성적 콘텐츠 검열 차단 — 재시도/환불 안내 대신 명확한 검열 메시지.
      if (error.data?.error === 'MINOR_CONTENT_BLOCKED' || error.message === 'MINOR_CONTENT_BLOCKED') {
        setMessages((prev) => prev.filter((m) => m._round !== roundId && m.id !== tempUserMsg.id))
        setShowTyping(false)
        setSending(false)
        showError(error.data?.warned ? t('chat.minorBlockedWarned') : t('chat.minorBlocked'), 5000)
        return
      }
      // Insufficient masks — 작성 메시지 보존 + in-context 결제 모달 노출
      if (error.message?.includes('Insufficient masks')) {
        setMessages((prev) => prev.filter((m) => m._round !== roundId && m.id !== tempUserMsg.id))
        setShowTyping(false)
        setSending(false)
        setInput(text)
        window.gtag?.('event', 'mask_depleted', { conversation_id: id })
        setInsufficientMasksFor('message')
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
        setInsufficientMasksFor('image')
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
      const convMessages = (await api.get(`/v2/conversations/${id}/messages`)).conversation.messages
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
        setInsufficientMasksFor('tts')
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

  // 최신 캐릭터 메시지의 emotion sprite URL — BUBBLE 고정 표시 + BACKGROUND 모드에서 사용.
  // early return 전에 호출해야 hook order 안정.
  const latestCharacterSpriteUrl = useMemo(() => {
    if (!conversation) return null
    const ch = conversation.character
    if (!ch) return null
    const style = ch.styles?.find((s) => s.id === conversation.currentStyleId) || ch.styles?.[0]
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'CHARACTER' || !msg.emotion) continue
      // 이미지 row만 후보로 — filePath가 영상인 standalone row는 제외
      const candidates = style?.images?.filter((img) => img.emotion === msg.emotion && !isVideoUrl(img.filePath)) || []
      if (candidates.length === 0) continue
      if (candidates.length === 1) return candidates[0].filePath
      const seed = String(msg.createdAt || '') + '|' + i
      let h = 0
      for (let s = 0; s < seed.length; s++) h = ((h << 5) - h + seed.charCodeAt(s)) | 0
      return candidates[Math.abs(h) % candidates.length].filePath
    }
    return null
  }, [messages, conversation])

  if (!conversation) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('common.loading')}</div>
  }

  const { character } = conversation
  const currentStyle = character.styles.find((s) => s.id === conversation.currentStyleId) || character.styles[0]
  // 프로필 썸네일도 이미지 row만 (standalone 영상 row 제외)
  const profileImg = character.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL' && !isVideoUrl(i.filePath))
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
    <div className="absolute inset-0 bg-gray-950 z-20">
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-4 py-1.5 border-b border-gray-800/30 bg-gray-900/30" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <button onClick={handleBack} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button
          onClick={() => navigate(`/characters/${conversation.characterId}`)}
          className="flex items-center gap-2 flex-1 min-w-0"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
              {profileUrl ? <img src={profileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>}
            </div>
            {onlineStatus === 'free' && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <span className="font-semibold text-sm text-white block truncate">{character.name}</span>
            {onlineStatus === 'free' && <p className="text-[10px] text-green-400 truncate">{t('chat.online')}</p>}
          </div>
        </button>
        <button
          onClick={() => {
            if (!user?.adultVerified) {
              navigate('/adult-verify')
              return
            }
            if (safetyMode) {
              setSafetyConfirmVisible(true)
            } else {
              setSafetyMode(true)
              api.patch(`/conversations/${id}/safety-mode`, { enabled: true }).catch(() => {})
            }
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            !user?.adultVerified
              ? 'text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/20'
              : safetyMode
                ? 'text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/20'
                : 'text-pink-300 bg-pink-500/15 hover:bg-pink-500/20'
          }`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          title={!user?.adultVerified ? t('safetyMode.verifyRequired') : safetyMode ? t('safetyMode.tooltipOn') : t('safetyMode.tooltipOff')}
        >
          {!user?.adultVerified ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" />
            </svg>
          )}
          <span>{safetyMode ? 'Safety ON' : 'Safety OFF'}</span>
        </button>
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
        <button
          onClick={() => setShowStatusPanel(v => !v)}
          className="text-gray-400 hover:text-white transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label={showStatusPanel ? '패널 접기' : '패널 펼치기'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {showStatusPanel ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
          </svg>
        </button>
      </header>

      <div className="absolute inset-0">
        {/* BACKGROUND 모드: sprite + spriteBackgroundImage 합성 레이어 (블러 처리 가능, 크로스페이드) */}
        {spriteMode === 'BACKGROUND' && latestCharacterSpriteUrl && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {spriteBackgroundImage && (
              <CrossfadeMedia
                src={spriteBackgroundImage}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(2px)' }}
              />
            )}
            <CrossfadeMedia
              src={latestCharacterSpriteUrl}
              variant="sprite"
              className="absolute inset-0 w-full h-full object-cover object-bottom"
            />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        )}
        {/* 상단 overlay — 상태 panel(접기 가능) + 액션 버튼 행 (항상 표시) */}
        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 44px)' }}>
          {showStatusPanel && (
            <div className="bg-gray-900/75 border border-gray-800/50 rounded-2xl mx-3 mt-2 px-4 pt-3 pb-3 animate-slide-down pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const status = characterStatus || getDefaultStatus(character.activeHours)
                const affinity = conversation.affinity ?? 0
                const affinityLabel = t(`chat.${getAffinityLabelKey(affinity)}`)
                return (
                  <StatusPanel
                    status={status}
                    currentTimeLabel={currentTimeLabel}
                    activeEpisode={activeEpisode}
                    affinity={affinity}
                    affinityLabel={affinityLabel}
                    t={t}
                  />
                )
              })()}
            </div>
          )}

          {/* 액션 버튼 — status panel과 함께 토글. V2는 통화 버튼 없음. */}
          {showStatusPanel && (
          <div className="flex flex-wrap gap-2 justify-end px-3 pt-2 pointer-events-auto">
            {/* V2 — 이벤트(에피소드) 버튼. 활성 에피소드가 있으면 초록 보더로 깜빡임. */}
            <button
              onClick={() => setShowEvents(true)}
              className={`relative w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 border flex items-center justify-center shadow-lg transition-colors ${
                activeEpisode ? 'episode-active-border' : 'border-gray-700/50'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="이벤트"
              title="이벤트"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={activeEpisode ? '#4ade80' : 'white'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
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
                onClick={() => { navigate(`/collection/${conversation.characterId}`); setShowGalleryTooltip(false); setShowGalleryBadge(false) }}
                className="relative w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 flex items-center justify-center shadow-lg transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                data-onboarding-target="gallery-btn"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
            </div>
            {/* 채팅 설정 페이지 진입 */}
            <button
              onClick={() => navigate(`/chats/${id}/settings`)}
              className="w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 flex items-center justify-center shadow-lg transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label={t('chatSettings.title')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
          )}
        </div>

      {/* 채팅방 배경 이미지 — 크로스페이드 레이어. backgroundImage 변경 시 스르륵 페이드 인/아웃. */}
      {spriteMode !== 'BACKGROUND' && backgroundImage && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <CrossfadeMedia
            src={backgroundImage}
            className="absolute inset-0 w-full h-full object-cover"
            fadeMs={700}
          />
          <div className="absolute inset-0 bg-black/45" />
        </div>
      )}
      <div
        ref={scrollContainerRef}
        className="relative z-10 h-full overflow-auto px-4 space-y-2"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 48px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)',
        }}
      >
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
          // NPC는 같은 이름끼리만 consecutive로 묶임 (손님 → 사장 같이 화자 바뀌면 분리).
          const isConsecutive = prevMsg?.role === msg.role &&
            (msg.role !== 'NPC' || prevMsg?.npcName === msg.npcName)
          const showTime = msg.createdAt && (
            !nextMsg ||
            nextMsg.role !== msg.role ||
            (msg.role === 'NPC' && nextMsg.npcName !== msg.npcName) ||
            nextMsg.role === 'NARRATION' || nextMsg.role === 'GENERATED_IMAGE' ||
            formatChatTime(msg.createdAt) !== formatChatTime(nextMsg.createdAt)
          )
          // typewriter 차례 판정 — 라이브 라운드 메시지만 큐 순서 따름. 히스토리/USER는 항상 즉시.
          const isMyTypingTurn = !msg._round
            ? true
            : (typingHead.round !== msg._round
                ? msg._streamIdx === 0   // 새 라운드 첫 메시지는 즉시 시작
                : typingHead.idx >= (msg._streamIdx ?? 0))
          // 상태 변화는 헤더 status panel에서 라벨 색 강조로 표시 (메시지 영역에 카드/디바이더 미표시).
          return (
            <Fragment key={msg.id || idx}>
              <MessageBubble
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
                chatMode={chatMode}
                isMyTypingTurn={isMyTypingTurn}
                onTypingComplete={handleTypingComplete}
                onLightbox={setLightboxUrl}
                onPlayAudio={playAudio}
                onStopAudio={stopAudio}
                onSetBackground={handleSetBackground}
                onPlayAll={playAllLatestAudios}
                onStopAll={stopAllPlayback}
                onAppear={handleBubbleAppear}
                t={t}
              />
            </Fragment>
          )
        })}
        {/* FULL 모드: 메시지 목록 끝에 1회만 표시 — 최신 캐릭터 표정 sprite (크로스페이드) */}
        {spriteMode === 'FULL' && latestCharacterSpriteUrl && (
          <div
            className="-mx-4 mt-2 relative cursor-pointer overflow-hidden bg-gray-900"
            style={{ aspectRatio: '9 / 16' }}
            onClick={() => setLightboxUrl({ url: latestCharacterSpriteUrl, bgUrl: spriteBackgroundImage })}
          >
            {spriteBackgroundImage && (
              <CrossfadeMedia
                src={spriteBackgroundImage}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(2px)' }}
              />
            )}
            <CrossfadeMedia
              src={latestCharacterSpriteUrl}
              variant="sprite"
              className="absolute inset-0 w-full h-full object-cover object-bottom"
            />
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
        {/* 텍스트 스트림 완료 후 done 이벤트 대기 — 마지막 버블 아래 작은 스피너 */}
        {sending && !showTyping && !messages.some((m) => m._streaming) && (
          <div className="flex justify-start mt-1.5 ml-9 items-center gap-1.5 text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" className="animate-spin">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeDasharray="42 100" strokeLinecap="round" />
            </svg>
            <span className="text-[10px]">{t('chat.finalizing', { defaultValue: '응답 마무리 중...' })}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
        {/* 표정 sprite 고정 표시 (BUBBLE 모드) — 미니 버튼 행 위 우측 (크로스페이드)
            wrapper는 pointer-events-none — 좌측 빈 공간에서 스크롤 통과되도록.
            sprite 박스 자체만 pointer-events-auto로 클릭 받음. */}
        {spriteMode === 'BUBBLE' && latestCharacterSpriteUrl && (
          <div className="flex justify-end px-3 mb-1.5 pointer-events-none">
            <div
              className="relative w-16 rounded-2xl overflow-hidden bg-gray-800/80 border border-gray-700/50 shadow-lg cursor-pointer pointer-events-auto"
              style={{ aspectRatio: '9 / 16' }}
              onClick={() => setLightboxUrl({ url: latestCharacterSpriteUrl, bgUrl: spriteBackgroundImage })}
            >
              {spriteBackgroundImage && (
                <CrossfadeMedia
                  src={spriteBackgroundImage}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'blur(2px)' }}
                />
              )}
              <CrossfadeMedia
                src={latestCharacterSpriteUrl}
                variant="sprite"
                className="absolute inset-0 w-full h-full object-cover object-bottom"
              />
            </div>
          </div>
        )}
        {/* 추가 기능 미니 버튼 행 — 채팅 영역 바로 위에 독립 배치.
            wrapper는 pointer-events-none, 우측 버튼 그룹만 pointer-events-auto. */}
        <div className="flex items-center gap-2 px-3 mb-1.5 pointer-events-none">
          <div className="ml-auto relative h-8 flex items-center justify-end pointer-events-auto">
            <button
              onClick={() => setShowInputButtons(true)}
              className={`w-8 h-8 rounded-full bg-gray-900/75 border border-gray-800/50 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-800/80 transition-opacity duration-200 ${
                showInputButtons ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="기능 버튼 열기"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <div className={`absolute right-0 top-0 bg-gray-900/75 border border-gray-800/50 rounded-full pl-1.5 pr-0.5 py-0.5 flex items-center gap-1.5 origin-right transition-all duration-300 ease-out ${
              showInputButtons ? 'opacity-100 scale-x-100 pointer-events-auto' : 'opacity-0 scale-x-0 pointer-events-none'
            }`}>
            {(character.voiceId || tourActive) && (
              <div className="relative">
                {excitedTooltipVisible && characterStatus?.isExcited && (
                  <div
                    ref={excitedTooltipRef}
                    className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-red-600 text-white text-xs rounded-lg shadow-lg whitespace-nowrap animate-slide-up z-30"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {t('chat.excitedTooltip')}
                    <div className="absolute top-full right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-red-600" />
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
                  className={`relative w-7 h-7 rounded-full bg-gray-800/80 hover:bg-gray-700/80 flex items-center justify-center shadow transition-colors ${
                    characterStatus?.isExcited
                      ? 'ring-2 ring-red-400'
                      : voiceMode
                        ? 'ring-2 ring-emerald-400'
                        : canUseFreeVoice
                          ? 'ring-2 ring-emerald-400'
                          : ''
                  } disabled:opacity-40`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  data-onboarding-target="voice-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={canUseFreeVoice && !characterStatus?.isExcited ? '#6ee7b7' : 'white'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  {canUseFreeVoice && (
                    <span className="absolute -bottom-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-emerald-300 text-emerald-900 text-[9px] font-bold flex items-center justify-center shadow">
                      {remainingFreeVoiceUses}
                    </span>
                  )}
                </button>
              </div>
            )}
            {/* V2 채팅에서는 이미지 생성 버튼 미지원 — 제거됨 */}
            <button
              onClick={() => setShowModelSheet(true)}
              disabled={!token}
              className={`h-7 px-2 rounded-full text-[10px] font-semibold flex items-center gap-0.5 shadow transition-colors whitespace-nowrap flex-shrink-0 bg-gray-800/80 hover:bg-gray-700/80 ${
                chatModel === 'ADVANCED'
                  ? 'ring-1 ring-amber-400 text-amber-300'
                  : 'text-white'
              } disabled:opacity-40`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label={t('chat.modelSelectorTitle')}
              data-onboarding-target="model-btn"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {chatModel === 'ADVANCED' ? t('chat.modelAdvanced') : t('chat.modelBasic')}
            </button>
            <button
              onClick={() => setShowInputButtons(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="기능 버튼 닫기"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            </div>
          </div>
        </div>
        <div className="px-3 py-1.5 border-t border-gray-800/30 bg-gray-900/30 pointer-events-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}>
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
            <button onClick={send} disabled={!input.trim() || sending} className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              {(() => {
                const voiceActive = voiceMode && character?.voiceId
                const voiceSurcharge = voiceActive && !canUseFreeVoice ? 4 : 0
                const cost = (chatModel === 'ADVANCED' ? 3 : 1) + voiceSurcharge
                return (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold leading-none flex items-center gap-px bg-black/60 px-1 py-0.5 rounded">
                      -{cost}<MaskIcon className="text-[11px]" />
                    </span>
                  </span>
                )
              })()}
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
            <p className="text-gray-400 text-sm text-center mb-3">
              {t('chat.imageGenDesc', { name: character.name })}
              <br />
              <span className="text-purple-400 font-medium">{t('chat.imageGenCost', { count: 5 })}</span>
            </p>
            <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-gray-800/70 border border-gray-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-[12px] text-gray-300 leading-snug">{t('chat.imageGenSafetyNotice')}</p>
            </div>
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
            <p className="text-gray-400 text-sm text-center mb-3">
              {t('chat.selfieDesc')}
              <br />
              <span className="text-pink-400 font-medium">{t('chat.imageGenCost', { count: 5 })}</span>
            </p>
            <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-gray-800/70 border border-gray-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-[12px] text-gray-300 leading-snug">{t('chat.imageGenSafetyNotice')}</p>
            </div>
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
      {showAdultVerifyPrompt && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowAdultVerifyPrompt(false)}>
          <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.safetyHintTitle')}</p>
            <p className="text-gray-400 text-sm text-center mb-5 whitespace-pre-line">
              {user?.adultVerified ? t('chat.safetyHintDescVerified') : t('chat.safetyHintDescUnverified')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdultVerifyPrompt(false)}
                className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('chat.safetyHintLater')}
              </button>
              <button
                onClick={() => {
                  setShowAdultVerifyPrompt(false)
                  if (user?.adultVerified) {
                    window.gtag?.('event', 'nsfw_attempt_turnoff_cta', { conversation_id: id })
                    setSafetyConfirmVisible(true)
                  } else {
                    window.gtag?.('event', 'nsfw_attempt_verify_cta', { conversation_id: id })
                    navigate('/adult-verify')
                  }
                }}
                className="flex-1 py-2.5 text-sm text-white bg-pink-600 rounded-xl font-semibold"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {user?.adultVerified ? t('chat.safetyHintCtaTurnOff') : t('chat.safetyHintCtaVerify')}
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
      <EventsBottomSheet
        open={showEvents}
        episodes={episodes}
        onClose={() => setShowEvents(false)}
      />

      <EpisodeStartOverlay
        episode={startOverlayEpisode}
        onDismiss={() => setStartOverlayEpisode(null)}
      />
      {showGallery && (
        <GalleryBottomSheet
          characterId={conversation.characterId}
          characterName={character.name}
          conversationId={conversation.id}
          allowBackgroundChange={false}
          onClose={() => setShowGallery(false)}
          onAttachFeed={(feed) => setAttachedFeed(feed)}
          onBackgroundChange={(url) => setBackgroundImage(url)}
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
          {typeof lightboxUrl === 'object' ? (
            // 표정 sprite 합성 — bg + 투명 sprite 겹쳐 출력. 9:16 비율 유지, sprite는 하단 정렬.
            <div
              className="relative rounded-lg overflow-hidden bg-gray-900"
              style={{ aspectRatio: '9 / 16', height: '90vh', maxWidth: '90vw' }}
            >
              {lightboxUrl.bgUrl && (
                <img src={lightboxUrl.bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(2px)' }} />
              )}
              <SpriteMedia
                src={lightboxUrl.url}
                className="absolute inset-0 w-full h-full object-cover object-bottom"
              />
            </div>
          ) : isVideoUrl(lightboxUrl) ? (
            <video
              src={lightboxUrl}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
              autoPlay
              loop
              muted
              playsInline
              controls
            />
          ) : (
            <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          )}
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

      {/* 에피소드 시작/종료/보상 토스트 — 미연시 게임적 연출. */}
      {episodeToast && (
        <div className="absolute top-16 left-4 right-4 z-50 flex justify-center pointer-events-none">
          <div
            className={`text-white text-sm px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm border ${
              episodeToast.kind === 'start'
                ? 'bg-violet-600/85 border-violet-300/40'
                : episodeToast.kind === 'reward'
                ? 'bg-emerald-600/90 border-emerald-300/50'
                : 'bg-gray-800/85 border-gray-500/40'
            }`}
          >
            {episodeToast.kind === 'reward' ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span>🏆</span>
                  <span>{episodeToast.title}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {episodeToast.affinity > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="text-pink-200">❤️</span>
                      <span className="font-semibold">+{episodeToast.affinity}</span>
                    </span>
                  )}
                  {episodeToast.familiarity > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="text-amber-200">✨</span>
                      <span className="font-semibold">+{episodeToast.familiarity}</span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>{episodeToast.kind === 'start' ? '🎬 에피소드 시작: ' : '✅ '}{episodeToast.title}</>
            )}
          </div>
        </div>
      )}
      <InsufficientMasksModal
        open={!!insufficientMasksFor}
        onClose={() => setInsufficientMasksFor(null)}
        currentStyle={currentStyle}
        spriteBackgroundImage={spriteBackgroundImage}
        profileUrl={profileUrl}
      />

      {/* Safety Mode OFF 확인 다이얼로그 */}
      {safetyConfirmVisible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setSafetyConfirmVisible(false)}>
          <div
            className="bg-gray-900 border border-pink-700/40 rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-pink-600/20 border border-pink-500/40 flex items-center justify-center mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-line mb-5">{t('safetyMode.confirmOff')}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setSafetyConfirmVisible(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t('common.cancel', { defaultValue: '취소' })}
                </button>
                <button
                  onClick={async () => {
                    setSafetyConfirmVisible(false)
                    setSafetyMode(false)
                    try {
                      await api.patch(`/conversations/${id}/safety-mode`, { enabled: false })
                    } catch (err) {
                      // 실패 시 ON으로 되돌리고 인증 필요면 인증 페이지로 유도
                      setSafetyMode(true)
                      if (err?.data?.error === 'ADULT_VERIFICATION_REQUIRED') navigate('/adult-verify')
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold rounded-xl transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  Safety OFF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
