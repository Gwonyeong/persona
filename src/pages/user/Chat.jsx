import { Fragment, useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { ensureMicPermission } from '../../lib/microphone'
import { ensureAppUpToDate } from '../../lib/appUpdate'
import useStore from '../../store/useStore'
import GalleryBottomSheet from '../../components/GalleryBottomSheet'
import ReportModal from '../../components/ReportModal'
import OnboardingSpotlight from '../../components/OnboardingSpotlight'
import MaskIcon from '../../components/MaskIcon'
import CallSheet from '../../components/CallSheet'
import InsufficientMasksModal from '../../components/InsufficientMasksModal'
import MemoryModal from '../../components/MemoryModal'
import PersonalityModal from '../../components/PersonalityModal'
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

// FULL 모드 전용 — 버블 없이 텍스트 라인만 노출 (비주얼 노벨 풍).
// 캐릭터 본문: 흰색, 캐릭터 이름: amber 강조, 행동 묘사(《》, ()): 회색 italic.
// 유저 본문: 우측 정렬, 옅은 인디고. NARRATION: 가운데 회색 italic. GIFT/GENERATED_IMAGE는 기존 박스 유지.
const MessageLine = memo(function MessageLine({
  msg,
  msgIdx,
  isConsecutive,
  profileUrl,
  characterName,
  isLastChar,
  latestResponseAudios,
  isPlayingAll,
  isThisPlayingAudio,
  chatMode,
  onLightbox,
  onPlayAudio,
  onStopAudio,
  onSetBackground,
  onPlayAll,
  onStopAll,
  onAppear,
  t,
}) {
  const isStreamingBubble = msg._streaming === true
  useEffect(() => {
    if (isStreamingBubble && onAppear) onAppear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreamingBubble])

  const isNormalMode = chatMode === 'NORMAL'

  // NARRATION: 가운데 회색 italic.
  if (msg.role === 'NARRATION') {
    if (isNormalMode) return null
    return (
      <p className="my-2 text-[13px] text-gray-400/90 italic text-center leading-relaxed">
        {msg.content || ''}
      </p>
    )
  }

  // GIFT / GENERATED_IMAGE는 기존 박스 컴포넌트로 위임 (시각 요소가 박스로 묶이는 게 자연스러움).
  if (msg.role === 'GIFT' || msg.role === 'GENERATED_IMAGE') {
    return (
      <MessageBubble
        msg={msg}
        msgIdx={msgIdx}
        isConsecutive={isConsecutive}
        showTime={false}
        profileUrl={profileUrl}
        characterName={characterName}
        isLastChar={isLastChar}
        latestResponseAudios={latestResponseAudios}
        isPlayingAll={isPlayingAll}
        isThisPlayingAudio={isThisPlayingAudio}
        chatMode={chatMode}
        onLightbox={onLightbox}
        onPlayAudio={onPlayAudio}
        onStopAudio={onStopAudio}
        onSetBackground={onSetBackground}
        onPlayAll={onPlayAll}
        onStopAll={onStopAll}
        onAppear={onAppear}
        t={t}
      />
    )
  }

  if (msg.role !== 'CHARACTER' && msg.role !== 'USER') return null

  const segments = parseMessageSegments(msg.content || '', msg.role)
  const filteredSegs = isNormalMode ? segments.filter((s) => s.type !== 'action') : segments
  const hasText = filteredSegs.some((s) => (s.value || '').trim().length > 0)
  const hasExtras = !!(msg.feedImage || (msg.role === 'CHARACTER' && msg.audioUrl))
  if (!hasText && !hasExtras) return null

  const isCharacter = msg.role === 'CHARACTER'
  const actionWrap = (val) => (isCharacter ? `《${val}》` : `(${val})`)

  return (
    <div className={`${isConsecutive ? 'mt-1' : 'mt-2.5'} ${isCharacter ? 'text-left' : 'text-right'}`}>
      {isCharacter && !isConsecutive && (
        <p className="text-[11px] text-amber-200/90 font-semibold mb-0.5">{characterName}</p>
      )}
      {msg.feedImage && (
        <div className={`mb-1.5 ${isCharacter ? '' : 'inline-block'} rounded-xl overflow-hidden max-w-[60%]`}>
          <img src={msg.feedImage} alt="" className="w-full aspect-square object-cover" loading="lazy" />
        </div>
      )}
      <div className={`flex items-end gap-1.5 ${isCharacter ? 'justify-start' : 'justify-end'}`}>
        <p
          className={`text-[14px] leading-relaxed whitespace-pre-wrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] ${
            isCharacter ? 'text-gray-50' : 'text-indigo-200/95'
          }`}
        >
          {filteredSegs.map((seg, i) => (
            <Fragment key={i}>
              {i > 0 && (seg.type === 'action' || filteredSegs[i - 1].type === 'action') ? '\n' : ''}
              {seg.type === 'action' ? (
                <span className="italic text-gray-400/80 text-[13px]">{actionWrap(seg.value)}</span>
              ) : (
                seg.value
              )}
            </Fragment>
          ))}
        </p>
        {isCharacter && msg.audioUrl && (
          <button
            onClick={() => isThisPlayingAudio ? onStopAudio() : onPlayAudio(msg.audioUrl, msgIdx)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {isThisPlayingAudio ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
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
          <svg width="11" height="11" viewBox="0 0 24 24" fill={isPlayingAll ? '#fca5a5' : '#6ee7b7'}>
            {isPlayingAll
              ? <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>
              : <polygon points="5 3 19 12 5 21 5 3" />}
          </svg>
          <span className={`text-[11px] font-medium ${isPlayingAll ? 'text-red-200' : 'text-emerald-200'}`}>
            {isPlayingAll ? t('chat.playAllStop', { defaultValue: '중지' }) : t('chat.playAll', { defaultValue: '전체 재생' })}
          </span>
        </button>
      )}
    </div>
  )
})

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

  const isNormalMode = chatMode === 'NORMAL'

  const segments = useMemo(() => {
    if (msg.role !== 'CHARACTER' && msg.role !== 'USER') return null
    const parsed = parseMessageSegments(msg.content || '', msg.role)
    // NORMAL 모드: action(《...》, (...)) 세그먼트는 숨기고 대사 텍스트만 남김.
    if (isNormalMode) return parsed.filter((s) => s.type !== 'action')
    return parsed
  }, [msg.content, msg.role, isNormalMode])

  if (msg.role === 'NARRATION') {
    // NORMAL 모드: 별도 NARRATION 메시지는 숨김.
    if (isNormalMode) return null
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
            <span className="text-pink-300/80">{t('chat2.giftSent')}</span>
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
  if (isNormalMode && (msg.role === 'CHARACTER' || msg.role === 'USER')) {
    const hasText = segments && segments.some((s) => (s.value || '').trim().length > 0)
    const hasExtras = !!(msg.feedImage || (msg.role === 'CHARACTER' && msg.audioUrl))
    if (!hasText && !hasExtras) return null
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
  // 채팅 스타일 토글 상태 — { styles: [{id, unlocked, disabled, ...}], hasNewStyle: bool }
  const [chatStyles, setChatStyles] = useState(null)
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
  // 본인인증 유도 모달: Safety ON 상태에서 유저가 성적 시도를 감지했을 때 (세션당 1회).
  const [showAdultVerifyPrompt, setShowAdultVerifyPrompt] = useState(false)
  // 마스크 부족 모달 — actionType: 'message' | 'image' | 'tts'
  const [insufficientMasksFor, setInsufficientMasksFor] = useState(null)
  const [showGallery, setShowGallery] = useState(false)
  const [attachedFeed, setAttachedFeed] = useState(null)
  // 영상 언락 — Set of characterImageId (per-image, 1:1)
  const [videoUnlockedImageIds, setVideoUnlockedImageIds] = useState(new Set())
  const [unlockingVideo, setUnlockingVideo] = useState(false)
  // 본 이미지 marked 추적 — 중복 호출 방지 (per session)
  const markedSeenRef = useRef(new Set())
  // read polling burst 윈도우 종료 시각(ms). send() 호출 시 + 60초로 갱신.
  // heartbeat useEffect의 5초 interval이 이 값을 보고 그 동안만 read 호출.
  const readPollUntilRef = useRef(0)
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
  const [showStatusPanel, setShowStatusPanel] = useState(true)
  const [showInputButtons, setShowInputButtons] = useState(true)
  const [showReport, setShowReport] = useState(false)
  // 장기기억(LTM) 슬롯 — 책 버튼 색 결정에 used/count 사용. 모달이 갱신할 때마다 onUpdate로 반영.
  const [showMemoryModal, setShowMemoryModal] = useState(false)
  const [memorySnapshot, setMemorySnapshot] = useState(null) // { slot:{used,count,capReached} }
  // 캐릭터 personality 프리셋 — 활성 프리셋 content가 시스템 프롬프트에 주입됨.
  const [showPersonalityModal, setShowPersonalityModal] = useState(false)
  const [showCallChooser, setShowCallChooser] = useState(false)
  // null 이면 통화 닫힘, 'simple' 이면 CallSheet 오픈 (continue 모드는 deprecated).
  const [activeCallMode, setActiveCallMode] = useState(null)
  // CallSession 메타데이터 — '통화 기록 이어서' 버튼 노출/비노출 + 턴 수 표시용. null=미로드.
  const [callSessionMeta, setCallSessionMeta] = useState(null)
  const [showLightOnlyModal, setShowLightOnlyModal] = useState(false)
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

  const canCallUnlimited = subscriptionTier === 'LIGHT' || user?.role === 'ADMIN'
  const remainingFreeCalls = user?.freeCallUses ?? 0
  // FREE 티어 한정 — 무료 횟수가 남아있을 때만 강조 (LIGHT/ADMIN은 의미 없음)
  const showFreeCallBadge = !canCallUnlimited && remainingFreeCalls > 0
  // 무료 보이스 채팅 잔여 횟수 — FREE 티어 한정, voiceWithChat 사용 시 +4 마스크 면제
  const remainingFreeVoiceUses = user?.freeVoiceUses ?? 0
  const canUseFreeVoice = subscriptionTier === 'FREE' && remainingFreeVoiceUses > 0
  const handleCallClick = async () => {
    if (!canCallUnlimited && remainingFreeCalls <= 0) {
      setShowLightOnlyModal(true)
      return
    }
    // 통화 진입 전 Play Store 업데이트 체크 — 새 버전이 있으면 IMMEDIATE 풀스크린 업데이트 UI 트리거.
    // 유저가 업데이트를 수락하면 앱이 재시작되어 이 코드는 반환되지 않고, 거부/실패 시 UPDATE_REQUIRED throw.
    try {
      await ensureAppUpToDate()
    } catch (err) {
      if (err?.code === 'UPDATE_REQUIRED') {
        setErrorToast(t('chat.call.updateRequired'))
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
        errorTimerRef.current = setTimeout(() => setErrorToast(null), 4000)
        return
      }
      // 그 외 unexpected 에러는 차단하지 않고 통과
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

  // CallSession 메타 fetch — '통화 기록 이어서' 버튼 노출/턴 수 표시용.
  // 마운트 + 통화 종료 시 갱신. 메시지 본문은 통화 화면이 useCall 훅에서 직접 노출.
  const refetchCallSessionMeta = useCallback(async () => {
    if (!id) return
    try {
      const data = await api.get(`/conversations/${id}/call/session`)
      setCallSessionMeta({
        turnCount: data?.turnCount || 0,
        lastCallAt: data?.lastCallAt || null,
      })
    } catch (err) {
      // 404 등은 무시 — 비어있는 세션으로 간주.
      setCallSessionMeta({ turnCount: 0, lastCallAt: null })
    }
  }, [id])

  // 장기기억 슬롯 스냅샷 — 책 버튼 색 결정용 (가득 차면 강조색).
  // 모달 열 때 한 번 더 fetch하므로 실패해도 색만 부정확 — 조용히 무시.
  useEffect(() => {
    if (!id) return
    api
      .get(`/memory/conversations/${id}`)
      .then((res) => setMemorySnapshot(res))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    initialLoadRef.current = true
    refetchCallSessionMeta()
    api.get(`/conversations/${id}/messages`).then(({ conversation: conv, seenRecords }) => {
      setConversation(conv)
      // 채팅 스타일 on/off 상태 — 표정 매칭 풀 + 신규 인디케이터에 사용
      if (conv?.characterId) {
        api
          .get(`/chat-styles/${conv.characterId}`)
          .then((data) => setChatStyles(data))
          .catch(() => setChatStyles(null))
      }
      if (seenRecords) {
        const unlockedIds = new Set(
          seenRecords.filter((r) => r.videoUnlockedAt).map((r) => r.characterImageId)
        )
        setVideoUnlockedImageIds(unlockedIds)
        // 이미 본 이미지는 markedSeen에 미리 채워서 중복 호출 방지
        seenRecords.forEach((r) => markedSeenRef.current.add(r.characterImageId))
      }
      setBackgroundImage(conv.backgroundImage || null)
      setSpriteBackgroundImage(conv.spriteBackgroundImage || null)
      if (conv.characterStatus) setCharacterStatus(conv.characterStatus)
      setVoiceMode(!!conv.voiceMode)
      setSafetyMode(conv.safetyMode !== false)
      setSpriteMode(['FULL', 'BUBBLE', 'BACKGROUND', 'OFF'].includes(conv.spriteMode) ? conv.spriteMode : 'BUBBLE')
      setChatMode(conv.chatMode === 'NORMAL' ? 'NORMAL' : 'ROLEPLAY')
      setChatModel(conv.chatModel === 'BASIC' ? 'BASIC' : 'ADVANCED')
      setMessages(conv.messages.filter((m) => m.role === 'CHARACTER' || m.role === 'USER' || m.role === 'GENERATED_IMAGE' || m.role === 'NARRATION' || m.role === 'GIFT'))
      const lastCharMsg = [...conv.messages].reverse().find((m) => m.role === 'CHARACTER')
      if (lastCharMsg?.emotion) setCurrentEmotion(lastCharMsg.emotion)
      // 초기 로드 시 즉시 맨 아래로
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
        initialLoadRef.current = false
      })
    })
  }, [id, token])

  // 읽음 처리 — 이벤트 기반 burst polling.
  // 평소엔 polling 안 함. 메시지 전송 시 send() 핸들러가 readPollUntilRef를 갱신해
  // 그 시점부터 60초 동안만 5초 간격으로 read 호출 → 캐릭터 응답·후속 메시지가 도착하는
  // 짧은 윈도우에서만 unread가 잘못 잡히는 걸 방지. 진입·퇴장 시는 항상 1회 호출.
  useEffect(() => {
    api.post(`/conversations/${id}/read`).catch(() => {})

    const interval = setInterval(() => {
      if (readPollUntilRef.current > Date.now()) {
        api.post(`/conversations/${id}/read`).catch(() => {})
      }
    }, 5000)

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
    // read polling burst 시작 — 응답 스트림 + 후속 메시지 도착 동안 unread 동기화.
    readPollUntilRef.current = Date.now() + 60000
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
            // AI가 선택한 배경은 표정 sprite의 backdrop으로만 사용 — 채팅방 자체 배경(backgroundImage)은 건드리지 않음
            if (data.spriteBackgroundImage !== undefined) {
              setSpriteBackgroundImage(data.spriteBackgroundImage)
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

  // 최신 캐릭터 메시지에 대응하는 CharacterImage 객체 — 이미지 row만 (standalone 영상 row 제외).
  // 영상은 같은 row의 videoFilePath 필드로 따라옴 (이미지↔영상 1:1).
  // 랜덤 선택 로직과 동일한 seed를 써서 이미지와 영상이 항상 같은 row를 가리킴.
  // early return 전에 호출해야 hook order 안정.
  const latestCharacterSprite = useMemo(() => {
    if (!conversation) return null
    const ch = conversation.character
    if (!ch) return null
    // 활성 스타일 풀 — chatStyles.styles 중 disabled=false. 없으면 전체 styles 폴백.
    const activeStyleIds = chatStyles?.styles
      ? new Set(chatStyles.styles.filter((s) => !s.disabled).map((s) => s.id))
      : null
    const activeStyles = activeStyleIds
      ? (ch.styles || []).filter((s) => activeStyleIds.has(s.id))
      : ch.styles || []
    if (!activeStyles.length) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'CHARACTER' || !msg.emotion) continue
      // 활성 스타일들의 emotion 이미지 후보 합집합 — 영상 row 제외
      const candidates = activeStyles.flatMap((style) =>
        (style.images || [])
          .filter((img) => img.emotion === msg.emotion && !isVideoUrl(img.filePath))
          .map((img) => ({ ...img, styleId: style.id })),
      )
      if (candidates.length === 0) continue
      if (candidates.length === 1) return candidates[0]
      const seed = String(msg.createdAt || '') + '|' + i
      let h = 0
      for (let s = 0; s < seed.length; s++) h = ((h << 5) - h + seed.charCodeAt(s)) | 0
      return candidates[Math.abs(h) % candidates.length]
    }
    return null
  }, [messages, conversation, chatStyles])

  const latestCharacterSpriteUrl = latestCharacterSprite?.filePath ?? null

  // sprite가 새로 노출될 때 mark-seen 호출 (세션 내 중복 방지)
  useEffect(() => {
    const imgId = latestCharacterSprite?.id
    if (!imgId || markedSeenRef.current.has(imgId)) return
    markedSeenRef.current.add(imgId)
    api.post(`/conversations/${id}/mark-image-seen`, { characterImageId: imgId }).catch(() => {
      // 실패 시 다음 번 재시도 가능하게 markedSeen에서 제거
      markedSeenRef.current.delete(imgId)
    })
  }, [latestCharacterSprite?.id, id])

  // 선택된 이미지에 영상이 있고 해금됐는지 — per-image (1:1)
  const hasEmotionVideo = !!latestCharacterSprite?.videoFilePath
  const isCurrentVideoUnlocked = hasEmotionVideo
    ? videoUnlockedImageIds.has(latestCharacterSprite.id)
    : false

  const activeSpriteUrl = (isCurrentVideoUnlocked && hasEmotionVideo)
    ? latestCharacterSprite.videoFilePath
    : latestCharacterSpriteUrl

  // 미해금 영상 오버레이 필요 여부 — sprite 이미지는 그대로 두고 그 위에 별도 블러 영상 레이어 + CTA.
  const bubbleNeedsUnlock = hasEmotionVideo && !isCurrentVideoUnlocked

  const handleUnlockEmotionVideo = async () => {
    if (!latestCharacterSprite?.videoFilePath || unlockingVideo) return
    setUnlockingVideo(true)
    try {
      const res = await api.post(`/conversations/${id}/unlock-image-video`, {
        characterImageId: latestCharacterSprite.id,
      })
      setVideoUnlockedImageIds((prev) => new Set([...prev, latestCharacterSprite.id]))
      if (res.masks !== undefined) setUser({ ...user, masks: res.masks })
    } catch (err) {
      if (err?.error === 'INSUFFICIENT_MASKS') {
        setInsufficientMasksFor('emotionVideo')
      }
    } finally {
      setUnlockingVideo(false)
    }
  }

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
        {spriteMode === 'BACKGROUND' && activeSpriteUrl && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {spriteBackgroundImage && (
              <CrossfadeMedia
                src={spriteBackgroundImage}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(2px)' }}
              />
            )}
            <CrossfadeMedia
              src={activeSpriteUrl}
              variant="sprite"
              className="absolute inset-0 w-full h-full object-cover object-bottom"
            />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        )}
        {/* FULL 모드: sprite를 화면 상단부 배경으로 깔고, 메시지는 하단 박스에서 스크롤.
            sprite 영역 = 화면 위 60%, 메시지 박스 = 하단 40%. 영상 카드는 박스 바로 위 우측. */}
        {spriteMode === 'FULL' && activeSpriteUrl && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {spriteBackgroundImage && (
              <CrossfadeMedia
                src={spriteBackgroundImage}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(2px)' }}
              />
            )}
            <CrossfadeMedia
              src={activeSpriteUrl}
              variant="sprite"
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
            {/* 미해금 영상 카드 — 메시지 박스 바로 위 우측 */}
            {bubbleNeedsUnlock && (
              <div
                className="absolute right-3 w-16 rounded-2xl overflow-hidden bg-gray-800/80 border border-gray-700/50 shadow-lg cursor-pointer pointer-events-auto z-30"
                style={{ aspectRatio: '9 / 16', bottom: 'calc(42% + 8px)' }}
                onClick={(e) => { e.stopPropagation(); if (!unlockingVideo) handleUnlockEmotionVideo() }}
              >
                <CrossfadeMedia
                  src={latestCharacterSprite.videoFilePath}
                  variant="sprite"
                  className="absolute inset-0 w-full h-full object-cover object-bottom blur"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/75 backdrop-blur-sm border border-white/20 rounded-lg px-2 py-1 flex flex-col items-center shadow-lg">
                    <div className="flex items-center gap-0.5 text-white text-[11px] font-bold leading-none">
                      <MaskIcon style={{ width: '0.9em', height: '0.9em' }} />
                      <span>10</span>
                    </div>
                    <span className="text-white/90 text-[9px] font-medium mt-0.5 leading-none">
                      {unlockingVideo ? '처리중' : '해금하기'}
                    </span>
                  </div>
                </div>
              </div>
            )}
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
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{status.emoji}</span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {status.virtualTime && (() => {
                        const vt = status.virtualTime
                        const parts = [
                          vt.season,
                          vt.monthDay,
                          vt.weekday ? `${vt.weekday}요일` : null,
                          vt.dayPart,
                          Number.isInteger(vt.hour) ? `${vt.hour}시` : null,
                        ].filter(Boolean)
                        return parts.length > 0 ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-[10px] text-gray-300 font-medium w-12 flex-shrink-0">{t('chat2.timeLabel')}</span>
                            <span className="text-xs text-amber-200/90">{parts.join(' · ')}</span>
                          </div>
                        ) : null
                      })()}
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] text-gray-300 font-medium w-12 flex-shrink-0">{t('chat.statusMood')}</span>
                        <span className="text-xs text-gray-200">{status.mood}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] text-gray-300 font-medium w-12 flex-shrink-0">{t('chat.statusLocation')}</span>
                        <span className="text-xs text-gray-200">{status.location}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] text-gray-300 font-medium w-12 flex-shrink-0">{t('chat.statusActivity')}</span>
                        <span className="text-xs text-gray-200">{status.activity}</span>
                      </div>
                      <div className="flex items-baseline gap-2" data-onboarding-target="affinity">
                        <span className="text-[10px] text-gray-300 font-medium w-12 flex-shrink-0">{t('chat.statusAffinity')}</span>
                        <span className="text-xs text-pink-300">❤️ {affinity} <span className="text-gray-400">· {affinityLabel}</span></span>
                      </div>
                      {status.outfit && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-[10px] text-gray-300 font-medium w-12 flex-shrink-0">{t('chat.statusOutfit')}</span>
                          <span className="text-xs text-gray-200">{status.outfit}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* 액션 버튼 — status panel과 함께 토글 */}
          {showStatusPanel && (
          <div className="flex flex-wrap gap-2 justify-end px-3 pt-2 pointer-events-auto">
            {character.voiceId && (
              <button
                onClick={handleCallClick}
                className={`relative w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 flex items-center justify-center shadow-lg transition-colors ${
                  showFreeCallBadge ? 'ring-2 ring-emerald-400' : ''
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                aria-label={t('chat.call.start')}
                title={t('chat.call.start')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={showFreeCallBadge ? '#6ee7b7' : 'white'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {showFreeCallBadge && (
                  <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-300 text-emerald-900 text-[10px] font-bold flex items-center justify-center shadow">
                    {remainingFreeCalls}
                  </span>
                )}
                <span className="absolute -top-1 -right-1 px-1 py-px text-[8px] font-bold leading-none rounded-sm bg-gray-600 text-white tracking-tight shadow">
                  β
                </span>
              </button>
            )}
            <button
              onClick={() => setShowPersonalityModal(true)}
              className="w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 flex items-center justify-center shadow-lg transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label={t('personality.button')}
              title={t('personality.button')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            {(() => {
              const isMemoryFull =
                memorySnapshot?.slot && memorySnapshot.slot.used >= memorySnapshot.slot.count
              return (
                <button
                  onClick={() => setShowMemoryModal(true)}
                  className={`w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 flex items-center justify-center shadow-lg transition-colors ${
                    isMemoryFull ? 'ring-2 ring-amber-400' : ''
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  aria-label={t('memory.button')}
                  title={t('memory.button')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isMemoryFull ? '#fcd34d' : 'white'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </button>
              )
            })()}
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
            {/* 채팅 설정 페이지 진입 — 새 스타일 보유 시 emerald 보더 + 툴팁 */}
            <div className="relative">
              <button
                onClick={() => navigate(`/chats/${id}/settings`)}
                className={`w-11 h-11 rounded-full bg-gray-800/80 hover:bg-gray-700/80 flex items-center justify-center shadow-lg transition-colors border-2 ${
                  chatStyles?.hasNewStyle
                    ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]'
                    : 'border-gray-700/50'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                aria-label={t('chatSettings.title')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {chatStyles?.hasNewStyle && (
                <div className="absolute right-0 top-full mt-1.5 px-2.5 py-1 rounded-md bg-emerald-500 text-emerald-950 text-[10px] font-bold whitespace-nowrap shadow-lg pointer-events-none">
                  새 스타일! 설정에서 적용해보세요
                  <div className="absolute -top-1 right-3 w-2 h-2 rotate-45 bg-emerald-500" />
                </div>
              )}
            </div>
          </div>
          )}
        </div>

      <div
        ref={scrollContainerRef}
        className={
          spriteMode === 'FULL'
            ? 'absolute left-0 right-0 bottom-0 z-10 overflow-auto px-4 pt-10 space-y-1'
            : 'relative z-10 h-full overflow-auto px-4 space-y-2'
        }
        style={(() => {
          if (spriteMode === 'FULL') {
            const fadeMask = 'linear-gradient(to bottom, black 0%, black calc(100% - env(safe-area-inset-bottom) - 115px), transparent calc(100% - env(safe-area-inset-bottom) - 90px))'
            return {
              top: '58%',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 110px)',
              backgroundImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.95) 100%)',
              maskImage: fadeMask,
              WebkitMaskImage: fadeMask,
            }
          }
          const base = {
            paddingTop: 'calc(env(safe-area-inset-top) + 48px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)',
          }
          // BACKGROUND 모드는 별도 레이어로 처리. 갤러리 배경(기본)만 여기서 그림.
          if (spriteMode !== 'BACKGROUND' && backgroundImage) {
            return {
              ...base,
              backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          }
          return base
        })()}
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
          const isConsecutive = prevMsg?.role === msg.role
          const showTime = msg.createdAt && (
            !nextMsg || nextMsg.role !== msg.role || nextMsg.role === 'NARRATION' || nextMsg.role === 'GENERATED_IMAGE' ||
            formatChatTime(msg.createdAt) !== formatChatTime(nextMsg.createdAt)
          )
          const MessageComponent = spriteMode === 'FULL' ? MessageLine : MessageBubble
          return (
            <Fragment key={msg.id || idx}>
              <MessageComponent
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
        {/* FULL 모드 sprite/영상 카드는 메시지 컨테이너 밖 배경 레이어로 옮겨짐 (line 1406~). */}
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

      {/* 부모 wrapper 자체를 pointer-events-none — sprite/미니버튼 행의 빈 좌측 영역이 채팅 스크롤 터치를 가로채지 않도록.
          실제 인터랙티브 자식(sprite 박스, 미니버튼 행, 입력바)에만 pointer-events-auto 적용. */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
        {/* 표정 sprite 고정 표시 (BUBBLE 모드) — 미니 버튼 행 위 우측 (크로스페이드).
            미해금 영상이 있으면 sprite 카드 위에 별도 영상 카드를 쌓아 표시. */}
        {spriteMode === 'BUBBLE' && activeSpriteUrl && (
          <div className="flex justify-end px-3 mb-1.5">
            <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
              {/* 미해금 영상 카드 — sprite 카드 위에 별도 표시 */}
              {bubbleNeedsUnlock && (
                <div
                  className="relative w-16 rounded-2xl overflow-hidden bg-gray-800/80 border border-gray-700/50 shadow-lg cursor-pointer"
                  style={{ aspectRatio: '9 / 16' }}
                  onClick={() => { if (!unlockingVideo) handleUnlockEmotionVideo() }}
                >
                  <CrossfadeMedia
                    src={latestCharacterSprite.videoFilePath}
                    variant="sprite"
                    className="absolute inset-0 w-full h-full object-cover object-bottom blur"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/75 backdrop-blur-sm border border-white/20 rounded-lg px-2 py-1 flex flex-col items-center shadow-lg">
                      <div className="flex items-center gap-0.5 text-white text-[11px] font-bold leading-none">
                        <MaskIcon style={{ width: '0.9em', height: '0.9em' }} />
                        <span>10</span>
                      </div>
                      <span className="text-white/90 text-[9px] font-medium mt-0.5 leading-none">
                        {unlockingVideo ? '처리중' : '해금하기'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 표정 sprite 카드 — 깔끔하게 (영상 카드와 분리) */}
              <div
                className="relative w-16 rounded-2xl overflow-hidden bg-gray-800/80 border border-gray-700/50 shadow-lg cursor-pointer"
                style={{ aspectRatio: '9 / 16' }}
                onClick={() => setLightboxUrl({ url: activeSpriteUrl, bgUrl: spriteBackgroundImage })}
              >
                {spriteBackgroundImage && (
                  <CrossfadeMedia
                    src={spriteBackgroundImage}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: 'blur(2px)' }}
                  />
                )}
                <CrossfadeMedia
                  src={activeSpriteUrl}
                  variant="sprite"
                  className="absolute inset-0 w-full h-full object-cover object-bottom"
                />
              </div>
            </div>
          </div>
        )}
        {/* 추가 기능 미니 버튼 행 — 채팅 영역 바로 위에 독립 배치 */}
        <div className="flex items-center gap-2 px-3 mb-1.5">
          <div className="ml-auto relative h-8 flex items-center justify-end pointer-events-auto">
            <button
              onClick={() => setShowInputButtons(true)}
              className={`w-8 h-8 rounded-full bg-gray-900/75 border border-gray-800/50 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-800/80 transition-opacity duration-200 ${
                showInputButtons ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label={t('chat2.actionMenuOpen')}
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
              className="w-7 h-7 rounded-full bg-gray-800/80 hover:bg-gray-700/80 disabled:opacity-40 flex items-center justify-center shadow transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              data-onboarding-target="image-gen-btn"
            >
              {generatingImage ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M8.757 15.243l-2.121 2.121m12.728 0l-2.121-2.121M8.757 8.757L6.636 6.636" />
                </svg>
              )}
            </button>
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
              aria-label={t('chat2.actionMenuClose')}
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
      <MemoryModal
        open={showMemoryModal}
        conversationId={conversation.id}
        characterName={character?.name}
        onClose={() => setShowMemoryModal(false)}
        onUpdate={(s) => setMemorySnapshot(s)}
      />
      <PersonalityModal
        open={showPersonalityModal}
        conversationId={conversation.id}
        characterName={character?.name}
        onClose={() => setShowPersonalityModal(false)}
      />
      {showGallery && (
        <GalleryBottomSheet
          characterId={conversation.characterId}
          characterName={character.name}
          conversationId={conversation.id}
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
      <CallSheet
        open={!!activeCallMode}
        onClose={() => {
          setActiveCallMode(null)
          // 통화 종료 후 freeCallUses 최신화 (서버 진실) + 통화 기록 메타 갱신
          if (token) api.get('/auth/me').then(({ user: u }) => setUser(u)).catch(() => {})
          refetchCallSessionMeta()
        }}
        onFreeUsesExhausted={() => {
          setActiveCallMode(null)
          setShowLightOnlyModal(true)
          if (token) api.get('/auth/me').then(({ user: u }) => setUser(u)).catch(() => {})
          refetchCallSessionMeta()
        }}
        conversationId={conversation?.id}
        character={character}
        currentStyle={currentStyle}
        profileUrl={profileUrl}
        characterStatus={characterStatus}
        affinity={conversation?.affinity ?? 0}
        safetyMode={safetyMode}
        callMode={activeCallMode || 'simple'}
      />

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

      {/* 통화 진입 바텀시트 — 통화 기록이 있으면 '이어서' 버튼을 위에 보여줌 */}
      {showCallChooser && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowCallChooser(false)}>
          <div
            className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-base font-semibold mb-4">{t('call.chooserTitle')}</h3>

            <div className="flex flex-col gap-2.5">
              {/* 이전 통화 기록이 있으면 '이어서' 버튼 — simple 모드로 열되 connect 가 GET 으로 history 시드 */}
              {callSessionMeta && callSessionMeta.turnCount > 0 && (
                <button
                  onClick={() => { setActiveCallMode('simple'); setShowCallChooser(false) }}
                  className="text-left bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 rounded-xl px-4 py-3 transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="text-indigo-100 font-medium text-sm flex items-center gap-2">
                    {t('call.continueLabel')}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-100">
                      {t('call.turnsCount', { count: callSessionMeta.turnCount })}
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">{t('call.continueDesc')}</div>
                </button>
              )}
              {/* 새로 통화 — 기존 CallSession 을 wipe 한 뒤 빈 컨텍스트로 시작 */}
              <button
                onClick={async () => {
                  setShowCallChooser(false)
                  if (callSessionMeta && callSessionMeta.turnCount > 0) {
                    try { await api.delete(`/conversations/${id}/call/session`) } catch {}
                    setCallSessionMeta({ turnCount: 0, lastCallAt: null })
                  }
                  setActiveCallMode('simple')
                }}
                className="text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="text-gray-100 font-medium text-sm">{t('call.newCall')}</div>
                <div className="text-gray-400 text-xs mt-1">
                  {callSessionMeta && callSessionMeta.turnCount > 0
                    ? t('call.newCallResetDesc')
                    : t('call.newCallFreshDesc')}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
