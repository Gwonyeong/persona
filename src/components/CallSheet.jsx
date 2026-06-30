import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useCall from '../hooks/useCall'
import useStore from '../store/useStore'

const COST_PER_TURN = 3

const BUTTON_RESET = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// Chat.jsx의 동일 함수와 일치. 호감도 라벨 i18n 키 매핑.
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

function PhaseLabel({ phase, mode, t }) {
  switch (phase) {
    case 'connecting':
      return <span>{t('chat.call.connecting')}</span>
    case 'listening':
      return <span>{mode === 'ptt' ? t('chat.call.tapToTalk') : t('chat.call.listening')}</span>
    case 'recording':
      return <span className="text-red-300">{mode === 'ptt' ? t('chat.call.release') : t('chat.call.listening')}</span>
    case 'sending':
      return <span>{t('chat.call.thinking')}</span>
    case 'speaking':
      return <span className="text-indigo-300">{t('chat.call.speaking')}</span>
    default:
      return <span>{t('chat.call.ready')}</span>
  }
}

export default function CallSheet({ open, onClose, onFreeUsesExhausted, conversationId, character, currentStyle, profileUrl, characterStatus, affinity = 0, safetyMode = true, callMode = 'continue' }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState('ptt') // 'ptt' | 'vad'
  const [errorMsg, setErrorMsg] = useState(null)
  // 몰입 모드 — 우상단 X 클릭 시 true. 배경 sprite 만 남기고 모든 UI 숨김. 화면 탭하면 false 로 복귀.
  const [uiHidden, setUiHidden] = useState(false)
  const isSimple = callMode === 'simple'

  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const subscriptionTier = useStore((s) => s.subscription?.tier) || 'FREE'
  const canCallUnlimited = subscriptionTier === 'LIGHT' || user?.role === 'ADMIN'
  const remainingFreeCalls = user?.freeCallUses ?? 0
  const showFreeCallBadge = !canCallUnlimited && remainingFreeCalls > 0

  const {
    phase,
    transcript,
    aiText,
    aiEmotion,
    sessionHistory,
    error,
    connect,
    disconnect,
    startTalking,
    stopTalking,
  } = useCall({
    conversationId,
    mode,
    callMode,
    onError: (err) => {
      const map = {
        PERMISSION_DENIED: t('chat.call.permissionDenied'),
        SUBSCRIPTION_REQUIRED: t('chat.call.needLight'),
        INSUFFICIENT_MASKS: t('chat.call.errorInsufficientMasks'),
        EMPTY_TRANSCRIPT: t('chat.call.errorEmpty'),
        INVALID_AUDIO: t('chat.call.errorInvalidAudio'),
      }
      setErrorMsg(map[err.code] || t('chat.call.errorSend'))
    },
    onTurnComplete: ({ freeCallUses, consumedFreeUse }) => {
      // 무료 횟수 차감되었을 경우, store에 즉시 반영해 배지 카운트가 실시간 업데이트되도록 한다
      if (consumedFreeUse && typeof freeCallUses === 'number' && user) {
        setUser({ ...user, freeCallUses })
      }
      // 무료 통화 사용한 FREE 유저가 0회 도달 → 시트 닫고 부모에게 알림
      if (consumedFreeUse && freeCallUses === 0) {
        onFreeUsesExhausted?.()
      }
    },
  })

  // 열릴 때 자동 연결, 닫힐 때 자동 종료
  useEffect(() => {
    if (open) {
      setErrorMsg(null)
      setUiHidden(false) // 이전 통화에서 숨김 상태였더라도 새 진입 시 항상 UI 노출
      connect()
    }
    return () => {
      if (!open) {
        disconnect()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // unmount 시 무조건 disconnect
  useEffect(() => () => { disconnect() }, [disconnect])

  // 캐릭터 표정 sprite — aiEmotion 에 매칭되는 첫 이미지. 없으면 NEUTRAL fallback → profile.
  // CharacterImage 의 URL 필드는 filePath (Supabase 절대 URL).
  // (hooks 사용 위해 early return 위에서 계산.)
  const emotionSpriteUrl = (() => {
    const images = currentStyle?.images || []
    const matched = images.find((img) => img.emotion === aiEmotion)
    if (matched?.filePath) return matched.filePath
    const neutral = images.find((img) => img.emotion === 'NEUTRAL')
    return neutral?.filePath || profileUrl || null
  })()

  // === 표정 sprite 크로스페이드 ===
  // 두 슬롯(A, B) 에 이전/현재 URL 을 번갈아 둔다. URL 변경 시 inactive 슬롯에 새 URL 을 쓰고 active 토글
  // → 옛 슬롯은 opacity 1→0, 새 슬롯은 opacity 0→1 으로 동시 진행 (CSS transition).
  const CROSSFADE_MS = 700
  const [spriteLayers, setSpriteLayers] = useState({ A: null, B: null })
  const [activeSpriteSlot, setActiveSpriteSlot] = useState('A')
  const lastSpriteUrlRef = useRef(null)
  useEffect(() => {
    if (!emotionSpriteUrl) return
    if (lastSpriteUrlRef.current === emotionSpriteUrl) return
    lastSpriteUrlRef.current = emotionSpriteUrl
    setActiveSpriteSlot((prev) => {
      const next = prev === 'A' ? 'B' : 'A'
      setSpriteLayers((prevLayers) => ({ ...prevLayers, [next]: emotionSpriteUrl }))
      return next
    })
  }, [emotionSpriteUrl])

  if (!open) return null

  const isConnecting = phase === 'connecting'
  const canSpeak = phase === 'listening' || phase === 'recording'
  const isFatal = errorMsg && (phase === 'idle' || !canSpeak)

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-gray-950"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={() => { if (uiHidden) setUiHidden(false) }}
    >
      {/* 캐릭터 표정 배경 — emotion 별 sprite. 두 슬롯 모두 DOM 상주, opacity 토글로 크로스페이드. */}
      <img
        src={spriteLayers.A || ''}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{
          filter: 'saturate(0.9)',
          opacity: spriteLayers.A && activeSpriteSlot === 'A' ? 1 : 0,
          transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          // src 가 비어있는 슬롯은 broken icon 안 보이도록 visibility 도 함께 끔.
          visibility: spriteLayers.A ? 'visible' : 'hidden',
        }}
        aria-hidden="true"
        draggable={false}
      />
      <img
        src={spriteLayers.B || ''}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{
          filter: 'saturate(0.9)',
          opacity: spriteLayers.B && activeSpriteSlot === 'B' ? 1 : 0,
          transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          visibility: spriteLayers.B ? 'visible' : 'hidden',
        }}
        aria-hidden="true"
        draggable={false}
      />
      {/* 가독성 위해 위에 어두운 그라데이션 오버레이. UI 가 숨겨진 상태에선 sprite 가 깨끗하게 보이도록 함께 숨김. */}
      {emotionSpriteUrl && !uiHidden && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.25) 35%, rgba(2,6,23,0.55) 70%, rgba(2,6,23,0.85) 100%)',
          }}
          aria-hidden="true"
        />
      )}

      {!uiHidden && (
      <div className="relative flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
            {t('chat.call.title', { name: character?.name || '' })}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${isSimple ? 'bg-gray-700/70 text-gray-200' : 'bg-indigo-500/40 text-indigo-100'}`}>
            {isSimple ? t('chat.call.modeSimple') : t('chat.call.modeContinue')}
          </span>
          {/* Safety mode 상태 표시 — 1:1 채팅의 토글과 동기화. 읽기 전용 (토글은 채팅 페이지에서). */}
          <span
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${safetyMode ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-pink-500/15 border-pink-500/40 text-pink-200'}`}
            title={safetyMode ? t('safetyMode.tooltipOn') : t('safetyMode.tooltipOff')}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: safetyMode ? '#34d399' : '#f472b6' }} />
            {safetyMode ? 'Safety ON' : 'Safety OFF'}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setUiHidden(true) }}
          className="text-gray-100 hover:text-white text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
          style={BUTTON_RESET}
          aria-label={t('call.hideUi')}
          title={t('call.hideUiTitle')}
        >
          ✕
        </button>
      </div>
      )}

      {!uiHidden && (
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-center">
          <p className="text-xl font-semibold text-white">{character?.name}</p>
          {!isSimple && characterStatus?.isExcited && (
            <p className="mt-1 inline-block text-[10px] font-medium text-red-200 bg-red-500/30 border border-red-500/40 rounded-full px-2 py-0.5">
              {t('chat.excitedTooltip')}
            </p>
          )}
          <p className="text-sm text-gray-300 mt-2">
            <PhaseLabel phase={phase} mode={mode} t={t} />
          </p>
        </div>

        {/* 캐릭터 상태 카드 — continue 모드에서만 표시 (simple 모드는 컨텍스트 무시) */}
        {!isSimple && (characterStatus || affinity !== undefined) && (
          <div className="w-full max-w-sm grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
              <div className="text-gray-500 text-[10px]">{t('chat.statusMood')}</div>
              <div className="text-gray-100 truncate">{characterStatus?.mood || '-'}</div>
            </div>
            <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
              <div className="text-gray-500 text-[10px]">{t('chat.statusLocation')}</div>
              <div className="text-gray-100 truncate">{characterStatus?.location || '-'}</div>
            </div>
            <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
              <div className="text-gray-500 text-[10px]">{t('chat.statusActivity')}</div>
              <div className="text-gray-100 truncate">{characterStatus?.activity || '-'}</div>
            </div>
            <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
              <div className="text-gray-500 text-[10px]">{t('chat.statusOutfit')}</div>
              <div className="text-gray-100 truncate">{characterStatus?.outfit || '-'}</div>
            </div>
            <div className="col-span-2 bg-white/5 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-gray-500 text-[10px]">{t('chat.statusAffinity')}</span>
              <span className="text-pink-300">
                ❤️ {affinity} <span className="text-gray-400">· {t(`chat.${getAffinityLabelKey(affinity)}`)}</span>
              </span>
            </div>
          </div>
        )}

        {/* 별도 transcript/aiText 표시는 아래의 sessionHistory 박스로 통합됨. 에러만 인라인 노출. */}
        {errorMsg && (
          <div className="text-xs text-red-300 text-center">{errorMsg}</div>
        )}
      </div>
      )}

      {!uiHidden && (
      <div className="relative px-6 pb-6 flex flex-col items-center gap-4">
        {/* 통화 대화 기록 — 누적된 sessionHistory + 진행 중인 turn(transcript/aiText) 라이브 머지.
            턴이 끝나면 useCall 이 sessionHistory 로 옮기고 transcript/aiText 를 null 로 비우므로 중복 없음.
            assistant 메시지 중 audioUrl 이 있는 항목은 박스로 감싸고 클릭 시 해당 음성 재생. */}
        {(() => {
          const merged = [...sessionHistory]
          if (transcript) merged.push({ role: 'user', content: transcript, live: true })
          if (aiText) merged.push({ role: 'assistant', content: aiText, live: true })
          if (merged.length === 0) return null
          const tail = merged.slice(-5)
          const playAudioMsg = (url) => {
            if (!url) return
            try {
              const a = new Audio(url)
              a.play().catch(() => {})
            } catch {}
          }
          return (
            <div
              ref={(el) => { if (el) el.scrollTop = el.scrollHeight }}
              className="w-full max-w-sm bg-black/40 rounded-xl p-3 max-h-[180px] overflow-y-auto space-y-1.5 text-xs"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onClick={(e) => e.stopPropagation()}
            >
              {tail.map((m, i) => {
                const isUser = m.role === 'user'
                const label = isUser ? t('call.labelMe') : (character?.name || t('call.labelCharacterFallback'))
                const canReplay = !isUser && !m.live && !!m.audioUrl
                if (canReplay) {
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); playAudioMsg(m.audioUrl) }}
                      className="w-full text-left bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/15 rounded-lg px-2.5 py-2 flex items-start gap-2 transition-colors cursor-pointer"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      title={t('call.replay')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-pink-200 flex-shrink-0 mt-0.5" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span className="leading-snug">
                        <span className="text-pink-200 font-medium mr-1.5">{label}</span>
                        <span className="text-gray-100">{m.content}</span>
                      </span>
                    </button>
                  )
                }
                return (
                  <div key={i} className={`leading-snug ${m.live ? 'opacity-90' : ''}`}>
                    <span className={isUser ? 'text-emerald-300 font-medium mr-1.5' : 'text-pink-200 font-medium mr-1.5'}>
                      {label}
                    </span>
                    <span className="text-gray-100">{m.content}</span>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* 모드 토글 */}
        <div className="flex bg-white/10 rounded-full p-1 text-xs">
          <button
            onClick={() => setMode('ptt')}
            className={`px-4 py-1.5 rounded-full transition-colors ${mode === 'ptt' ? 'bg-white text-gray-900' : 'text-gray-300'}`}
            style={BUTTON_RESET}
          >
            {t('chat.call.modePtt')}
          </button>
          <button
            onClick={() => setMode('vad')}
            className={`px-4 py-1.5 rounded-full transition-colors ${mode === 'vad' ? 'bg-white text-gray-900' : 'text-gray-300'}`}
            style={BUTTON_RESET}
          >
            {t('chat.call.modeVad')}
          </button>
        </div>

        {/* 메인 액션 */}
        <div className="flex items-center gap-4">
          {/* 탭 모드일 때만 마이크 버튼 표시. VAD는 자동이라 hands-free. */}
          {/* 탭하여 시작 → 탭하여 정지로 토글. 녹음 중에는 정지(사각형) 아이콘으로 전환. */}
          {mode === 'ptt' && (
            <div className="relative">
              {showFreeCallBadge && phase !== 'recording' && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow whitespace-nowrap pointer-events-none">
                  {t('chat.call.freeCount', { count: remainingFreeCalls })}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (phase === 'recording') stopTalking()
                  else startTalking()
                }}
                disabled={!canSpeak || isConnecting}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all select-none disabled:opacity-40 ${
                  phase === 'recording'
                    ? 'bg-red-500 scale-110 shadow-[0_0_40px_rgba(239,68,68,0.6)]'
                    : showFreeCallBadge
                      ? 'bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.5)]'
                      : 'bg-white'
                }`}
                style={BUTTON_RESET}
                aria-label={phase === 'recording' ? t('chat.call.release') : t('chat.call.tapToTalk')}
              >
                {phase === 'recording' ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                )}
              </button>
            </div>
          )}

          <button
            onClick={() => { disconnect(); onClose?.() }}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg"
            style={BUTTON_RESET}
            aria-label={t('chat.call.end')}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)" />
            </svg>
          </button>
        </div>

        <p className="text-[11px] text-gray-500">
          {t('chat.call.costPerTurn', { count: COST_PER_TURN + (safetyMode === false ? 3 : 0) })} · {t('chat.call.secured')}
        </p>
      </div>
      )}
    </div>
  )
}
