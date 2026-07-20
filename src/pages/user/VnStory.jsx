import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import InsufficientMasksModal from '../../components/InsufficientMasksModal'
import MaskIcon from '../../components/MaskIcon'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
// 모델별 기본 소모 마스크 (서버 situationChat CHAT_MODEL_COSTS와 일치)
const MODEL_COSTS = { BASIC: 1, ADVANCED: 3 }

// 스토리 모드(Storyline.jsx)와 동일한 프레젠테이션 상수 — 비주얼 일관성.
const MESSAGE_AREA_STYLE = {
  paddingTop: 'calc(env(safe-area-inset-top) + 64px)',
  paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: '0.75rem',
}
const TEXT_BOX_STYLE = { backgroundColor: 'rgba(0,0,0,0.65)', maxHeight: '45vh', overflowY: 'auto' }

// 순수 나레이션 판별 (《...》로만 이루어진 줄)
const isNarration = (s) => /^《[\s\S]*》$/.test((s || '').trim())
// suggestedReplies({question,normal,sexual}) → 선택지 배열
const toChoices = (sr) => (sr ? [sr.question, sr.normal, sr.sexual].filter(Boolean) : [])
// 메시지에 붙은 선택지 읽기 — 오프닝은 .choices(배열), 이후 턴은 .suggestedReplies(객체).
const readChoices = (msg) => {
  if (!msg) return []
  if (Array.isArray(msg.choices)) return msg.choices
  return toChoices(msg.suggestedReplies)
}

// 상황극(VN) 렌더러 — 스토리 모드 UI 룩을 따름. /vn/:id.
// 배경+스프라이트 풀스크린, 하단 텍스트박스(탭 진행), 끝 도달 시 선택지/자유입력.
export default function VnStory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [character, setCharacter] = useState(null)
  const [beats, setBeats] = useState([]) // { role, content, emotion? }
  const [cursor, setCursor] = useState(0)
  const [choices, setChoices] = useState([])
  const [emotion, setEmotion] = useState('NEUTRAL')
  const [turnSeed, setTurnSeed] = useState(0) // 턴(선택/전송)마다 증가 — 같은 감정 이미지 순환 기준
  // 스프라이트 크로스페이드('스르륵') — A/B 두 레이어를 opacity 토글로 교차
  const [imgA, setImgA] = useState(null)
  const [imgB, setImgB] = useState(null)
  const [showA, setShowA] = useState(true)
  const [spriteBg, setSpriteBg] = useState(null)
  const [roomBg, setRoomBg] = useState(null)
  const [styleId, setStyleId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [insufficient, setInsufficient] = useState(false)
  const [videoUnlockedImageIds, setVideoUnlockedImageIds] = useState(() => new Set())
  const [unlockingVideo, setUnlockingVideo] = useState(false)
  const setMasks = useStore((s) => s.setMasks)
  // 음성(TTS) — 토글 ON이면 생성되는 응답 대사에 audio가 실려와 자동 재생.
  const audioRef = useRef(null)
  const [voiceOn, setVoiceOn] = useState(false)
  const [isNsfw, setIsNsfw] = useState(false) // 음성 추가요금 계산용
  // 채팅 모델 — V1 채팅과 동일하게 BASIC/ADVANCED 선택. 상황극 기본은 BASIC(1마스크).
  const [chatModel, setChatModel] = useState('BASIC')
  const [showModelSheet, setShowModelSheet] = useState(false)
  const [typed, setTyped] = useState('')
  const typingRef = useRef(null)

  const beatsRef = useRef([])
  useEffect(() => { beatsRef.current = beats }, [beats])

  useEffect(() => {
    api
      .get(`/situation-conversations/${id}/messages`)
      .then(({ conversation: conv, seenRecords }) => {
        setCharacter(conv.character)
        setIsNsfw(conv.safetyMode === false)
        setChatModel(conv.chatModel === 'ADVANCED' ? 'ADVANCED' : 'BASIC')
        if (Array.isArray(seenRecords)) {
          setVideoUnlockedImageIds(new Set(seenRecords.filter((r) => r.videoUnlockedAt).map((r) => r.characterImageId)))
        }
        setRoomBg(conv.backgroundImage || null)
        setSpriteBg(conv.spriteBackgroundImage || null)
        setStyleId(conv.currentStyleId || conv.character?.styles?.[0]?.id || null)
        const msgs = (conv.messages || []).filter((m) => ['CHARACTER', 'NARRATION', 'USER'].includes(m.role))
        setBeats(msgs)
        // 선택지 — 선택지/추천을 가진 가장 최근 beat에서 읽음 (오프닝 .choices 또는 응답 .suggestedReplies)
        const choiceMsg = [...msgs].reverse().find((m) => Array.isArray(m.choices) || m.suggestedReplies)
        setChoices(readChoices(choiceMsg))
        const lastChar = [...msgs].reverse().find((m) => m.role === 'CHARACTER')
        if (lastChar?.emotion) setEmotion(lastChar.emotion)
        // 재진입: 유저의 최근 선택 "다음" 메시지(그 선택에 대한 응답 시작)부터.
        // 마지막 beat로 두면 atEnd라 선택지 UI로 바로 튀므로, 응답 첫 beat에 위치시킨다.
        const lastUserIdx = msgs.reduce((acc, m, i) => (m?.role === 'USER' ? i : acc), -1)
        setCursor(lastUserIdx >= 0 ? Math.min(lastUserIdx + 1, msgs.length - 1) : 0)
      })
      .catch(() => setError(t('vn.loadFailed', { defaultValue: '불러오지 못했어요' })))
      .finally(() => setLoading(false))
  }, [id, t])

  const current = beats[cursor] || null
  const atEnd = beats.length === 0 || cursor >= beats.length - 1

  useEffect(() => {
    if (current?.role === 'CHARACTER' && current.emotion) setEmotion(current.emotion)
  }, [cursor, current])

  // 현재 스프라이트 CharacterImage 객체 (id/filePath/videoFilePath 포함)
  const spriteImage = useMemo(() => {
    const styles = character?.styles
    if (!Array.isArray(styles) || !styles.length) return null
    const style = styles.find((s) => s.id === styleId) || styles[0]
    const imgs = style?.images
    if (!Array.isArray(imgs) || !imgs.length) return null
    // 같은 감정에 이미지가 여러 개면 턴(turnSeed=선택지 기준)에 따라 순환. 매칭 없을 때만 단일 폴백.
    const pick = (pool) => (pool.length ? pool[turnSeed % pool.length] : null)
    const matching = imgs.filter((im) => im.emotion === emotion)
    if (matching.length) return pick(matching)
    const neutral = imgs.filter((im) => im.emotion === 'NEUTRAL')
    if (neutral.length) return pick(neutral)
    return imgs[0] || null
  }, [character, styleId, emotion, turnSeed])

  const spriteUrl = spriteImage?.filePath || null
  const videoUnlocked = !!(spriteImage?.videoFilePath && videoUnlockedImageIds.has(spriteImage.id))
  const needsVideoUnlock = !!(spriteImage?.videoFilePath && spriteImage.id && !videoUnlockedImageIds.has(spriteImage.id))
  const activeVideoUrl = videoUnlocked ? spriteImage.videoFilePath : null

  // spriteUrl 변경 시 A/B 레이어 교차 → opacity transition으로 '스르륵' 크로스페이드
  useEffect(() => {
    if (!spriteUrl) return
    const current = showA ? imgA : imgB
    if (spriteUrl === current) return
    if (showA) { setImgB(spriteUrl); setShowA(false) }
    else { setImgA(spriteUrl); setShowA(true) }
  }, [spriteUrl, showA, imgA, imgB])

  const bgUrl = spriteBg || roomBg || null

  // 타이핑 애니메이션 — 현재 beat 텍스트를 한 글자씩 노출
  const fullText = sending ? '' : (current?.content || '')
  useEffect(() => {
    if (typingRef.current) { clearInterval(typingRef.current); typingRef.current = null }
    if (!fullText) { setTyped(''); return }
    setTyped('')
    let i = 0
    typingRef.current = setInterval(() => {
      i += 1
      setTyped(fullText.slice(0, i))
      if (i >= fullText.length) { clearInterval(typingRef.current); typingRef.current = null }
    }, 22)
    return () => { if (typingRef.current) { clearInterval(typingRef.current); typingRef.current = null } }
  }, [fullText])
  const isTyping = !sending && typed.length < fullText.length

  // 탭: 타이핑 중이면 즉시 완성, 아니면 다음 beat로.
  const advance = () => {
    if (sending) return
    if (isTyping) {
      if (typingRef.current) { clearInterval(typingRef.current); typingRef.current = null }
      setTyped(fullText)
      return
    }
    if (!atEnd) setCursor((c) => c + 1)
  }

  const doSend = async (text) => {
    const msg = (text || '').trim()
    if (!msg || sending) return
    setSending(true)
    setError(null)
    setInput('')
    // 선택지는 지우지 않음 — sending 동안엔 숨겨지고(atChoicePoint=false),
    // 실패(마스크 부족 등) 시 그대로 다시 노출된다. 성공 시에만 새 선택지로 교체.
    await runRound(msg, 1)
  }

  // 한 라운드 전송 — 버퍼드(비-SSE) POST. 상황극은 스트리밍 이득이 없고,
  // 서버 chat()이 callChatLLMWithRetry로 자체 재시도+폴백(+실패 시 마스크 환불)하므로 더 견고.
  // 클라도 그래도 실패하면 1회 추가 재시도.
  const runRound = async (msg, retriesLeft) => {
    try {
      const res = await api.post(`/situation-conversations/${id}/messages`, { content: msg, chatModel, voiceWithChat: voiceOn && !!character?.voiceId })
      const received = (res.responseMessages || []).filter((m) => ['CHARACTER', 'NARRATION'].includes(m.role))
      if (res.spriteBackgroundImage !== undefined) setSpriteBg(res.spriteBackgroundImage)
      const lastChar = [...received].reverse().find((m) => m.role === 'CHARACTER')
      if (lastChar?.emotion) setEmotion(lastChar.emotion)
      if (received.length) {
        const startIdx = beatsRef.current.length
        setBeats((prev) => [...prev, ...received])
        setCursor(startIdx)
      }
      setChoices(toChoices(res.suggestedReplies))
      setTurnSeed((s) => s + 1) // 이번 턴 반영 — 같은 감정이어도 다음 이미지로 순환
      setSending(false)
    } catch (e) {
      // 마스크 부족(402) → 충전 유도 모달 (재시도 안 함). 보낸 내용 복원.
      if (e?.status === 402 || (e?.message || '').includes('Insufficient masks')) {
        setInput(msg)
        setInsufficient(true)
        setSending(false)
        return
      }
      if (retriesLeft > 0) { await runRound(msg, retriesLeft - 1); return } // 1회 재시도
      setError(t('vn.sendFailed', { defaultValue: '전송하지 못했어요' }))
      setInput(msg)
      setSending(false)
    }
  }

  const atChoicePoint = atEnd && !sending && !isTyping

  // 표정 영상 해금 (10마스크) — 현재 스프라이트에 연결된 영상.
  const handleUnlockVideo = async () => {
    if (!spriteImage?.videoFilePath || !spriteImage.id || unlockingVideo) return
    setUnlockingVideo(true)
    try {
      const res = await api.post(`/situation-conversations/${id}/unlock-image-video`, { characterImageId: spriteImage.id })
      setVideoUnlockedImageIds((prev) => new Set([...prev, spriteImage.id]))
      if (res?.masks !== undefined) setMasks(res.masks)
    } catch (e) {
      if (e?.status === 402 || (e?.message || '').includes('Insufficient') || (e?.message || '').includes('INSUFFICIENT')) {
        setInsufficient(true)
      } else {
        setError(t('vn.videoUnlockFailed', { defaultValue: '영상 해금에 실패했어요' }))
      }
    } finally {
      setUnlockingVideo(false)
    }
  }

  // 음성 ON일 때, 표시 중인 CHARACTER beat에 audioUrl 있으면 자동 재생. beat 바뀌면 이전 재생 중지.
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const beat = beats[cursor]
    if (voiceOn && beat?.role === 'CHARACTER' && beat.audioUrl) {
      const audio = new Audio(beat.audioUrl)
      audioRef.current = audio
      audio.play().catch(() => {})
    }
  }, [cursor, voiceOn, beats])
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause() }, [])

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-20">
        <span className="text-gray-500 text-sm">{t('common.loading', { defaultValue: '불러오는 중...' })}</span>
      </div>
    )
  }

  // 화자/뱃지 (스토리 모드 규칙)
  const isNarr = current ? (current.role === 'NARRATION' || isNarration(current.content)) : false
  const isUser = current?.role === 'USER'
  const speakerName = isUser ? (t('vn.you', { defaultValue: '나' })) : (isNarr ? null : character?.name)
  const badgeSide = isUser ? 'right' : 'left'
  const badgeColor = isUser ? 'bg-emerald-600' : (isNarr ? 'bg-gray-700' : 'bg-indigo-600')
  const text = sending ? '...' : typed

  return (
    <>
    <div className="absolute inset-0 overflow-hidden bg-gray-950 z-20 select-none" onClick={advance}>
      {/* 배경 */}
      {bgUrl ? (
        <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
      )}

      {/* 스프라이트 등장 시 약한 배경 딤 (스토리 모드와 동일 0.15) */}
      {(imgA || imgB) && <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />}

      {/* 캐릭터 스프라이트 — A/B 크로스페이드('스르륵'). 상단 여백 없이 전체 꽉차게 */}
      {imgA && (
        <img src={imgA} alt="" className={`absolute inset-0 w-full h-full object-cover drop-shadow-2xl pointer-events-none transition-opacity duration-500 ${showA ? 'opacity-100' : 'opacity-0'}`} />
      )}
      {imgB && (
        <img src={imgB} alt="" className={`absolute inset-0 w-full h-full object-cover drop-shadow-2xl pointer-events-none transition-opacity duration-500 ${showA ? 'opacity-0' : 'opacity-100'}`} />
      )}
      {/* 해금된 표정 영상 — 이미지 위에 재생 */}
      {activeVideoUrl && (
        <video key={activeVideoUrl} src={activeVideoUrl} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover drop-shadow-2xl pointer-events-none" />
      )}

      {/* 상단 바 */}
      <header
        className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 pb-2"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => navigate(-1)} className="text-white/90" style={NO_OUTLINE} aria-label={t('common.back', { defaultValue: '뒤로' })}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-white font-semibold text-sm drop-shadow">{character?.name}</span>
        {/* 모델 선택 토글 — V1 채팅과 동일한 바텀시트. ADVANCED면 별 강조. */}
        <button
          onClick={() => setShowModelSheet(true)}
          className={`ml-auto h-7 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shadow transition-colors whitespace-nowrap flex-shrink-0 ${
            chatModel === 'ADVANCED' ? 'bg-amber-500/25 ring-1 ring-amber-400 text-amber-200' : 'bg-black/40 text-white/90'
          }`}
          style={NO_OUTLINE}
          aria-label={t('chat.modelSelectorTitle', { defaultValue: '모델 선택' })}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {chatModel === 'ADVANCED' ? t('chat.modelAdvanced', { defaultValue: '고급' }) : t('chat.modelBasic', { defaultValue: '기본' })}
        </button>
      </header>

      {/* 메시지 영역 — 하단 정렬 (스토리 모드 MESSAGE_AREA_STYLE) */}
      <div className="absolute inset-0 z-20 px-5 pointer-events-none" style={MESSAGE_AREA_STYLE}>
        {/* 텍스트박스 */}
        {(fullText || sending) && (
          <div className="relative pointer-events-auto" onClick={(e) => { e.stopPropagation(); advance() }}>
            {/* 대사 우측 위 컨트롤 — [음성 토글] [미해금 영상] 순 (영상이 음성 버튼 오른쪽) */}
            {(character?.voiceId || needsVideoUnlock) && (
              <div className="absolute right-2 bottom-full mb-2 flex items-end gap-2 z-30 pointer-events-auto">
                {character?.voiceId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setVoiceOn((v) => !v) }}
                    className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center border shadow-lg ${voiceOn ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-gray-900/80 border-gray-700 text-white/70'}`}
                    style={NO_OUTLINE}
                    aria-label={t('vn.voiceToggle', { defaultValue: '음성' })}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      {voiceOn ? (<><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></>) : (<path d="M17 9l4 6M21 9l-4 6" />)}
                    </svg>
                  </button>
                )}
                {needsVideoUnlock && (
                  <div
                    className="relative w-16 flex-shrink-0 rounded-2xl overflow-hidden bg-gray-800/80 border border-gray-700/50 shadow-lg cursor-pointer"
                    style={{ aspectRatio: '9 / 16' }}
                    onClick={(e) => { e.stopPropagation(); if (!unlockingVideo) handleUnlockVideo() }}
                  >
                    <video src={spriteImage.videoFilePath} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover object-bottom blur" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-black/75 backdrop-blur-sm border border-white/20 rounded-lg px-2 py-1 flex flex-col items-center shadow-lg">
                        <div className="flex items-center gap-0.5 text-white text-[11px] font-bold leading-none">
                          <MaskIcon style={{ width: '0.9em', height: '0.9em' }} />
                          <span>10</span>
                        </div>
                        <span className="text-white/90 text-[9px] font-medium mt-0.5 leading-none">{unlockingVideo ? '처리중' : '해금하기'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {speakerName && (
              <span className={`absolute -top-2.5 z-10 ${badgeSide === 'right' ? 'right-3' : 'left-3'} px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap shadow-lg ${badgeColor} text-white`}>
                {speakerName}
              </span>
            )}
            <div className="rounded-xl px-4 py-5" style={TEXT_BOX_STYLE}>
              <p className={`text-[15px] leading-relaxed text-white whitespace-pre-line ${isNarr ? 'text-white/85 italic' : ''}`}>
                {text}{isTyping && <span className="text-white/70 animate-pulse">▍</span>}
              </p>
            </div>
            {/* 다음 진행 표시 — 고정 높이 행(예약)이라 밀림 없음 */}
            <div className="h-5 mt-1 pr-1 flex items-center justify-end">
              {!atEnd && !sending && !isTyping && <span className="text-white/50 text-base animate-pulse">▼</span>}
            </div>
          </div>
        )}

        {/* 유저 차례 — 선택지 + 직접 입력 동시 노출 */}
        {atChoicePoint && (
          <div className="flex flex-col gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            {choices.map((c, i) => (
              <button
                key={i}
                onClick={() => doSend(c)}
                className="w-full text-left px-4 py-3 rounded-lg text-sm border bg-gray-900/85 hover:bg-indigo-900/70 active:bg-indigo-800/70 border-gray-700 hover:border-indigo-500 text-gray-100"
                style={NO_OUTLINE}
              >
                {c}
              </button>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSend(input) }}
                placeholder={t('vn.inputPlaceholder', { defaultValue: '직접 입력...' })}
                className="flex-1 px-4 py-3 rounded-lg text-sm border bg-gray-900/85 border-gray-700 text-gray-100 placeholder-gray-500"
                style={NO_OUTLINE}
              />
              <button
                onClick={() => doSend(input)}
                disabled={!input.trim() || sending}
                className="relative w-11 h-11 flex-shrink-0 rounded-full bg-indigo-600 disabled:opacity-40 flex items-center justify-center"
                style={NO_OUTLINE}
                aria-label={t('vn.send', { defaultValue: '보내기' })}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                {/* 마스크 소모 배지 (V1 전송버튼처럼) */}
                <span className="absolute -bottom-1 -right-1 flex items-center gap-px text-[9px] font-bold leading-none text-white bg-black/70 px-1 py-0.5 rounded-full pointer-events-none">
                  -{(MODEL_COSTS[chatModel] ?? MODEL_COSTS.BASIC) + (voiceOn && character?.voiceId ? 4 + (isNsfw ? 3 : 0) : 0)}<MaskIcon style={{ width: '0.8em', height: '0.8em' }} />
                </span>
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-rose-400 text-[11px] text-center pointer-events-auto">{error}</p>}
      </div>
    </div>

    {/* 모델 선택 바텀시트 — V1 채팅과 동일 구성 */}
    {showModelSheet && (
      <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setShowModelSheet(false)}>
        <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-gray-700 rounded-full" />
          </div>
          <p className="text-white font-semibold text-center mb-1">{t('chat.modelSelectorTitle', { defaultValue: '채팅 모델' })}</p>
          <p className="text-gray-400 text-xs text-center mb-4">{t('chat.modelSelectorDesc', { defaultValue: '모델에 따라 소모 마스크가 달라져요' })}</p>
          <div className="flex flex-col gap-2">
            {[
              { key: 'BASIC', label: t('chat.modelBasic', { defaultValue: '기본' }), desc: t('chat.modelBasicDesc', { defaultValue: '가볍고 빠른 응답' }), cost: MODEL_COSTS.BASIC },
              { key: 'ADVANCED', label: t('chat.modelAdvanced', { defaultValue: '고급' }), desc: t('chat.modelAdvancedDesc', { defaultValue: '더 깊고 풍부한 응답' }), cost: MODEL_COSTS.ADVANCED },
            ].map((opt) => {
              const selected = chatModel === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => { setChatModel(opt.key); setShowModelSheet(false) }}
                  className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                    selected
                      ? (opt.key === 'ADVANCED' ? 'bg-amber-600/20 border-amber-500' : 'bg-indigo-600/20 border-indigo-500')
                      : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                  }`}
                  style={NO_OUTLINE}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200'}`}>{opt.label}</span>
                    <span className={`text-xs font-medium flex items-center gap-1 ${opt.key === 'ADVANCED' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {t('chat.maskCostLabel', { count: opt.cost, defaultValue: `${opt.cost}마스크` })}
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

    <InsufficientMasksModal
      open={insufficient}
      onClose={() => setInsufficient(false)}
      currentStyle={character?.styles?.find((s) => s.id === styleId)}
      spriteBackgroundImage={spriteBg}
      profileUrl={character?.profileImage}
    />
    </>
  )
}
