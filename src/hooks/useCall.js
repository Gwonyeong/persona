import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import i18n from '../i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

// 통화 phase
// idle: 종료/시작 전 / connecting: 마이크 권한·세션 준비
// listening: 마이크 입력 대기 (PTT 누르기 전 / VAD 침묵)
// recording: 사용자가 말하는 중 (오디오 청크 누적)
// sending: 서버 처리 중 (STT → AI → TTS)
// speaking: 캐릭터 음성 재생 중
export const CALL_PHASES = ['idle', 'connecting', 'listening', 'recording', 'sending', 'speaking']

const VAD_OPTIONS = {
  // 음성 임계치(RMS 0~1). 마이크/환경에 따라 조정.
  threshold: 0.02,
  // 말 시작으로 인정하는 누적 시간 (ms) — 잡음 무시
  minSpeechMs: 200,
  // 침묵 지속이 이만큼 되면 발화 종료로 판단
  silenceMs: 700,
  // 임계치 측정 간격
  pollMs: 60,
}

// MediaRecorder가 지원하는 첫 mime 선택. iOS Safari/WebView 호환성.
function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {}
  }
  return ''
}

/**
 * 음성 통화 훅.
 *
 * @param {object} options
 * @param {number} options.conversationId
 * @param {'ptt'|'vad'} options.mode  - PTT / VAD 토글 (마이크 입력 방식)
 * @param {'simple'|'continue'} [options.callMode='continue']  - 서버 측 통화 모드. simple=컨텍스트 무시, continue=채팅 흐름 이어가기
 * @param {function} [options.onTurnComplete]  - 한 턴 완료 시 ({ userText, charText, audioUrl })
 * @param {function} [options.onError]  - ({ code, message })
 */
export default function useCall({ conversationId, mode = 'ptt', callMode = 'continue', onTurnComplete, onError } = {}) {
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscript] = useState(null)
  const [aiText, setAiText] = useState(null)
  const [error, setError] = useState(null)

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const mimeTypeRef = useRef('')
  const audioRef = useRef(null) // 재생용 Audio 엘리먼트 (재사용)
  const abortRef = useRef(null) // 진행 중 fetch abort용
  // simple 모드 전용 in-memory 통화 히스토리. connect 시 초기화, disconnect 시 휘발.
  // continue 모드에서는 서버가 conversation.messages를 직접 보므로 사용 안 함.
  const sessionHistoryRef = useRef([])
  // 캐릭터가 능동적으로 질문할 확률(0~100). 통화 세션 단위로 관리.
  // 매 턴 서버로 전송 → 서버 응답의 nextQuestionChance로 업데이트.
  const questionChanceRef = useRef(30)

  // VAD 관련
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const vadIntervalRef = useRef(null)
  const speechStartedAtRef = useRef(null)
  const silenceStartedAtRef = useRef(null)

  // 가장 최신 mode 값을 ref로 — VAD interval 안에서 클로저 stale 방지
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  // PTT는 user-driven, VAD는 자동. phase를 ref로도 추적해서 VAD interval이 phase에 따라 동작 결정.
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  const cleanupRecorder = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch {}
    }
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const stopVAD = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    speechStartedAtRef.current = null
    silenceStartedAtRef.current = null
  }, [])

  const fullCleanup = useCallback(() => {
    cleanupRecorder()
    stopVAD()
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
      analyserRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop() } catch {} })
      streamRef.current = null
    }
    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (abortRef.current) {
      try { abortRef.current.abort() } catch {}
      abortRef.current = null
    }
  }, [cleanupRecorder, stopVAD])

  // 컴포넌트 언마운트 시 항상 정리
  useEffect(() => fullCleanup, [fullCleanup])

  // 서버로 한 턴 전송 (SSE 응답을 직접 파싱).
  const sendTurn = useCallback(async (audioBlob) => {
    if (!audioBlob || audioBlob.size === 0) {
      // 비어있는 녹음은 무시하고 listening으로 복귀
      setPhase((p) => (p === 'idle' ? p : 'listening'))
      return
    }

    setPhase('sending')
    setTranscript(null)
    setAiText(null)

    const token = useStore.getState().token
    const fd = new FormData()
    fd.append('audio', audioBlob, `call-${Date.now()}.${mimeTypeRef.current.includes('mp4') ? 'm4a' : 'webm'}`)
    fd.append('mode', callMode)
    if (callMode === 'simple' && sessionHistoryRef.current.length > 0) {
      // 통화 세션 내부의 직전 발화들을 LLM에 함께 전달.
      // 서버가 길이 제한·검증 후 사용하므로 클라는 raw 누적치 그대로 전송.
      fd.append('sessionHistory', JSON.stringify(sessionHistoryRef.current))
    }
    fd.append('questionChance', String(questionChanceRef.current))

    const controller = new AbortController()
    abortRef.current = controller

    let res
    try {
      res = await fetch(`${API_URL}/conversations/${conversationId}/call/turn`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          Accept: 'text/event-stream',
          'Accept-Language': i18n.language || 'en',
        },
        body: fd,
        signal: controller.signal,
      })
    } catch (err) {
      if (err.name === 'AbortError') return
      const payload = { code: 'NETWORK', message: err.message }
      setError(payload)
      onError?.(payload)
      setPhase('listening')
      return
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      let code = 'CALL_FAILED'
      if (res.status === 402) code = 'INSUFFICIENT_MASKS'
      else if (res.status === 403) code = 'SUBSCRIPTION_REQUIRED'
      else if (res.status === 413) code = 'AUDIO_TOO_LARGE'
      const payload = { code, message: text || `HTTP ${res.status}` }
      setError(payload)
      onError?.(payload)
      setPhase('listening')
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventType = null
    let dataLine = null
    let lastUserText = null
    let lastAiText = null
    let lastAudioUrl = null
    let lastFreeCallUses = null
    let consumedFreeUse = false

    const handleEvent = (type, payload) => {
      if (type === 'transcript') {
        lastUserText = payload.text || ''
        setTranscript(lastUserText)
      } else if (type === 'text') {
        lastAiText = payload.text || ''
        setAiText(lastAiText)
        setPhase('speaking') // 곧 오디오 도착 예정 → 미리 phase 전환해 UI 자연스럽게
      } else if (type === 'audio') {
        lastAudioUrl = payload.audioUrl || null
      } else if (type === 'empty') {
        const p = { code: 'EMPTY_TRANSCRIPT', message: 'No speech detected' }
        setError(p)
        onError?.(p)
      } else if (type === 'error') {
        const p = { code: payload.error || 'CALL_FAILED', message: payload.error }
        setError(p)
        onError?.(p)
      } else if (type === 'done') {
        // 다음 턴 질문 확률 업데이트 (서버에서 계산해 반환)
        if (typeof payload.nextQuestionChance === 'number') {
          questionChanceRef.current = payload.nextQuestionChance
        }
        if (typeof payload.freeCallUses === 'number') {
          lastFreeCallUses = payload.freeCallUses
          consumedFreeUse = !!payload.consumedFreeUse
        }
        // 그 외 처리는 stream close 후 audio 재생까지 끝낸 다음
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (let raw of lines) {
          const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
          if (line === '') {
            if (eventType && dataLine !== null) {
              try { handleEvent(eventType, JSON.parse(dataLine)) } catch {}
            }
            eventType = null
            dataLine = null
          } else if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6)
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        const payload = { code: 'STREAM_ERROR', message: err.message }
        setError(payload)
        onError?.(payload)
      }
    }
    abortRef.current = null

    // 오디오 재생 — 끝까지 기다린 다음 listening으로 복귀
    if (lastAudioUrl) {
      try {
        await playAudio(lastAudioUrl)
      } catch (err) {
        console.warn('[Call] audio playback failed:', err)
      }
    }

    // 통화 세션 in-memory 히스토리 누적 (simple 모드용). 양쪽 모두 있을 때만.
    if (lastUserText && lastAiText) {
      sessionHistoryRef.current.push({ role: 'user', content: lastUserText })
      sessionHistoryRef.current.push({ role: 'assistant', content: lastAiText })
    }

    onTurnComplete?.({
      userText: lastUserText,
      charText: lastAiText,
      audioUrl: lastAudioUrl,
      freeCallUses: lastFreeCallUses,
      consumedFreeUse,
    })

    // 다음 턴 준비
    setPhase((p) => (p === 'idle' ? p : 'listening'))
    // VAD 모드면 silence 카운터 리셋
    silenceStartedAtRef.current = null
    speechStartedAtRef.current = null
  }, [conversationId, callMode, onError, onTurnComplete])

  const playAudio = useCallback((url) => {
    return new Promise((resolve) => {
      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current
      audio.src = url
      const onEnd = () => { audio.removeEventListener('ended', onEnd); audio.removeEventListener('error', onEnd); resolve() }
      audio.addEventListener('ended', onEnd)
      audio.addEventListener('error', onEnd)
      audio.play().catch(() => resolve())
    })
  }, [])

  // VAD 루프 — listening 상태일 때만 RMS 측정해 음성 시작/종료 판정
  const vadTick = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    // VAD는 listening 상태일 때만 동작. recording/sending/speaking에서는 패스.
    if (phaseRef.current !== 'listening' && phaseRef.current !== 'recording') return
    if (modeRef.current !== 'vad') return

    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length)

    const now = Date.now()
    const speaking = rms > VAD_OPTIONS.threshold

    if (phaseRef.current === 'listening') {
      if (speaking) {
        if (!speechStartedAtRef.current) speechStartedAtRef.current = now
        if (now - speechStartedAtRef.current >= VAD_OPTIONS.minSpeechMs) {
          // 발화 시작 → recording 진입
          speechStartedAtRef.current = null
          silenceStartedAtRef.current = null
          startRecording()
        }
      } else {
        speechStartedAtRef.current = null
      }
    } else if (phaseRef.current === 'recording') {
      if (speaking) {
        silenceStartedAtRef.current = null
      } else {
        if (!silenceStartedAtRef.current) silenceStartedAtRef.current = now
        if (now - silenceStartedAtRef.current >= VAD_OPTIONS.silenceMs) {
          // 발화 종료 → stopRecording (send 트리거)
          silenceStartedAtRef.current = null
          stopRecording()
        }
      }
    }
  }, [])

  const startRecording = useCallback(() => {
    if (!streamRef.current) return
    if (recorderRef.current && recorderRef.current.state === 'recording') return
    chunksRef.current = []
    let rec
    try {
      rec = mimeTypeRef.current
        ? new MediaRecorder(streamRef.current, { mimeType: mimeTypeRef.current })
        : new MediaRecorder(streamRef.current)
    } catch (err) {
      const payload = { code: 'RECORDER_INIT', message: err.message }
      setError(payload)
      onError?.(payload)
      return
    }
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
      chunksRef.current = []
      sendTurn(blob)
    }
    recorderRef.current = rec
    try {
      rec.start()
      setPhase('recording')
    } catch (err) {
      const payload = { code: 'RECORDER_START', message: err.message }
      setError(payload)
      onError?.(payload)
    }
  }, [onError, sendTurn])

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    try { rec.stop() } catch {}
    recorderRef.current = null
  }, [])

  const connect = useCallback(async () => {
    if (phase !== 'idle') return
    setError(null)
    setTranscript(null)
    setAiText(null)
    setPhase('connecting')
    // 세션 시작 시 simple 모드 in-memory 히스토리 초기화 (통화 간 누수 방지).
    sessionHistoryRef.current = []
    // 질문 확률도 매 통화 세션마다 30%로 리셋.
    questionChanceRef.current = 30

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const payload = { code: 'UNSUPPORTED', message: 'mediaDevices not supported' }
      setError(payload)
      onError?.(payload)
      setPhase('idle')
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      const payload = { code: 'PERMISSION_DENIED', message: err.message }
      setError(payload)
      onError?.(payload)
      setPhase('idle')
      return
    }

    streamRef.current = stream
    mimeTypeRef.current = pickMimeType()

    // AudioContext + Analyser — VAD/시각화 둘 다에 사용
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyserRef.current = analyser
      source.connect(analyser)
      vadIntervalRef.current = setInterval(vadTick, VAD_OPTIONS.pollMs)
    } catch (err) {
      console.warn('[Call] AudioContext setup failed (VAD disabled):', err)
    }

    setPhase('listening')
  }, [onError, phase, vadTick])

  const disconnect = useCallback(() => {
    setPhase('idle')
    fullCleanup()
  }, [fullCleanup])

  // PTT 컨트롤 — UI 버튼에서 호출
  const startTalking = useCallback(() => {
    if (phaseRef.current !== 'listening') return
    startRecording()
  }, [startRecording])

  const stopTalking = useCallback(() => {
    if (phaseRef.current !== 'recording') return
    stopRecording()
  }, [stopRecording])

  // 진행 중 발화 취소 (사용자가 통화 종료 누른 경우 등)
  const cancelTurn = useCallback(() => {
    if (abortRef.current) {
      try { abortRef.current.abort() } catch {}
      abortRef.current = null
    }
    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
    }
    cleanupRecorder()
    setPhase((p) => (p === 'idle' ? p : 'listening'))
  }, [cleanupRecorder])

  // 현재 마이크 입력 레벨(0~1) — UI 시각화용. 가벼운 폴링 대신 분석기 직접 노출.
  const getInputLevel = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return 0
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    return Math.min(1, Math.sqrt(sum / buf.length) * 4) // 4배 amplify (UI 표시용)
  }, [])

  return {
    phase,
    transcript,
    aiText,
    error,
    connect,
    disconnect,
    startTalking,
    stopTalking,
    cancelTurn,
    getInputLevel,
  }
}
