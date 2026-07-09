import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import i18n from '../i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

// 통화 phase (텍스트 입력 버전 — STT 실패가 통화 이탈 최대 원인이라 음성 입력을 텍스트로 대체)
// idle: 종료/시작 전 / connecting: 세션 준비
// ready: 유저 입력(텍스트) 대기 / sending: 서버 처리 중 (AI → TTS) / speaking: 캐릭터 음성 재생 중
export const CALL_PHASES = ['idle', 'connecting', 'ready', 'sending', 'speaking']

/**
 * 통화 훅 (텍스트 입력 → 캐릭터 음성 응답).
 * 유저는 텍스트로 보내고, 캐릭터는 그대로 음성(TTS)으로 답한다.
 *
 * @param {object} options
 * @param {number} options.conversationId
 * @param {'simple'|'continue'} [options.callMode='continue']  - simple=컨텍스트 무시, continue=채팅 흐름 이어가기
 * @param {function} [options.onTurnComplete]  - 한 턴 완료 시 ({ userText, charText, audioUrl })
 * @param {function} [options.onError]  - ({ code, message })
 */
export default function useCall({ conversationId, callMode = 'continue', onTurnComplete, onError } = {}) {
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscript] = useState(null)
  const [aiText, setAiText] = useState(null)
  // 서버가 LLM 응답 prefix 에서 추출한 캐릭터 감정. 표정 sprite 배경에 사용. 초기 NEUTRAL.
  const [aiEmotion, setAiEmotion] = useState('NEUTRAL')
  // 통화 화면 대화 기록. [{role: 'user'|'assistant', content, audioUrl?}]
  const [sessionHistory, setSessionHistory] = useState([])
  const [error, setError] = useState(null)

  const audioRef = useRef(null)   // 재생용 Audio 엘리먼트 (재사용)
  const abortRef = useRef(null)   // 진행 중 fetch abort용
  const sendingRef = useRef(false) // 동시 전송 방지
  // simple 모드 전용 in-memory 통화 히스토리. connect 시 초기화, disconnect 시 휘발.
  const sessionHistoryRef = useRef([])
  // 캐릭터가 능동적으로 질문할 확률(0~100). 매 턴 서버로 전송 → 응답의 nextQuestionChance로 갱신.
  const questionChanceRef = useRef(30)

  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  const fullCleanup = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (abortRef.current) {
      try { abortRef.current.abort() } catch {}
      abortRef.current = null
    }
    sendingRef.current = false
  }, [])

  // 컴포넌트 언마운트 시 항상 정리
  useEffect(() => fullCleanup, [fullCleanup])

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

  // 서버로 한 턴 전송 (텍스트 → SSE 응답 파싱 → 캐릭터 음성 재생).
  const sendText = useCallback(async (rawText) => {
    const text = (rawText || '').trim()
    if (!text) return
    if (sendingRef.current) return
    if (phaseRef.current === 'idle' || phaseRef.current === 'connecting') return
    sendingRef.current = true

    // 이전 턴 음성이 재생 중이면 멈춘다.
    if (audioRef.current) { try { audioRef.current.pause() } catch {} }

    setPhase('sending')
    setTranscript(null)
    setAiText(null)

    const token = useStore.getState().token
    const payload = {
      text,
      mode: callMode,
      questionChance: questionChanceRef.current,
    }
    if (callMode === 'simple' && sessionHistoryRef.current.length > 0) {
      payload.sessionHistory = sessionHistoryRef.current
    }

    const controller = new AbortController()
    abortRef.current = controller

    let res
    try {
      res = await fetch(`${API_URL}/conversations/${conversationId}/call/turn`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Accept-Language': i18n.language || 'en',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      sendingRef.current = false
      if (err.name === 'AbortError') return
      const p = { code: 'NETWORK', message: err.message }
      setError(p); onError?.(p)
      setPhase((ph) => (ph === 'idle' ? ph : 'ready'))
      return
    }

    if (!res.ok || !res.body) {
      sendingRef.current = false
      const body = await res.text().catch(() => '')
      let code = 'CALL_FAILED'
      if (res.status === 402) code = 'INSUFFICIENT_MASKS'
      else if (res.status === 403) code = 'SUBSCRIPTION_REQUIRED'
      const p = { code, message: body || `HTTP ${res.status}` }
      setError(p); onError?.(p)
      setPhase((ph) => (ph === 'idle' ? ph : 'ready'))
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

    // === streaming audio queue (audio-chunk 이벤트용) ===
    // 서버가 문장 단위 mp3 chunk 를 base64 로 보내면 도착 즉시 큐에 넣고 순차 재생.
    const CHUNK_GAP_MS = 1000
    const chunkQueue = []
    let firstAudioStarted = false
    let aborted = false
    let streamEnded = false
    let processingPromise = null
    const blobUrlsToRevoke = []

    const base64ToBlobUrl = (base64) => {
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      blobUrlsToRevoke.push(url)
      return url
    }

    const playOne = (url) => new Promise((resolve) => {
      if (aborted) { resolve(); return }
      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current
      audio.src = url
      const onEnd = () => {
        audio.removeEventListener('ended', onEnd)
        audio.removeEventListener('error', onEnd)
        resolve()
      }
      audio.addEventListener('ended', onEnd)
      audio.addEventListener('error', onEnd)
      audio.play().catch(() => resolve())
    })

    const processQueueLoop = async () => {
      while (true) {
        if (aborted) return
        if (chunkQueue.length === 0) {
          if (streamEnded) return
          await new Promise((r) => setTimeout(r, 50))
          continue
        }
        const url = chunkQueue.shift()
        if (!firstAudioStarted) {
          firstAudioStarted = true
          setPhase('speaking')
        }
        await playOne(url)
        if (aborted) return
        if (chunkQueue.length === 0 && streamEnded) return
        await new Promise((r) => setTimeout(r, CHUNK_GAP_MS))
      }
    }

    const startProcessing = () => {
      if (processingPromise) return
      processingPromise = processQueueLoop().finally(() => { processingPromise = null })
    }

    const enqueueAudioChunk = (base64) => {
      if (aborted || !base64) return
      chunkQueue.push(base64ToBlobUrl(base64))
      startProcessing()
    }

    const handleEvent = (type, data) => {
      if (type === 'transcript') {
        lastUserText = data.text || ''
        setTranscript(lastUserText)
      } else if (type === 'text-delta') {
        if (typeof data.delta === 'string' && data.delta) {
          lastAiText = (lastAiText || '') + data.delta
          setAiText(lastAiText)
        }
      } else if (type === 'audio-chunk') {
        enqueueAudioChunk(data.audioBase64)
      } else if (type === 'text') {
        lastAiText = data.text || ''
        setAiText(lastAiText)
        setPhase('speaking')
      } else if (type === 'emotion') {
        if (typeof data.emotion === 'string' && data.emotion) setAiEmotion(data.emotion)
      } else if (type === 'audio') {
        lastAudioUrl = data.audioUrl || null
      } else if (type === 'blocked') {
        const p = { code: 'MINOR_CONTENT_BLOCKED', message: data.error }
        setError(p); onError?.(p)
      } else if (type === 'error') {
        const p = { code: data.error || 'CALL_FAILED', message: data.error }
        setError(p); onError?.(p)
      } else if (type === 'done') {
        if (typeof data.nextQuestionChance === 'number') questionChanceRef.current = data.nextQuestionChance
        if (typeof data.freeCallUses === 'number') {
          lastFreeCallUses = data.freeCallUses
          consumedFreeUse = !!data.consumedFreeUse
        }
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
      if (err.name === 'AbortError') {
        aborted = true
      } else {
        const p = { code: 'STREAM_ERROR', message: err.message }
        setError(p); onError?.(p)
      }
    }
    abortRef.current = null

    // 오디오 재생 완료까지 대기 후 ready 복귀.
    streamEnded = true
    startProcessing()
    if (!aborted) {
      try {
        if (firstAudioStarted || chunkQueue.length > 0) {
          if (processingPromise) await processingPromise
        } else if (lastAudioUrl) {
          await playAudio(lastAudioUrl)
        }
      } catch (err) {
        console.warn('[Call] audio playback failed:', err)
      }
    }
    for (const u of blobUrlsToRevoke) {
      try { URL.revokeObjectURL(u) } catch {}
    }

    // 통화 세션 in-memory 히스토리 누적. 양쪽 다 있을 때만.
    if (lastUserText && lastAiText) {
      const assistantEntry = { role: 'assistant', content: lastAiText }
      if (lastAudioUrl) assistantEntry.audioUrl = lastAudioUrl
      const nextHistory = [
        ...sessionHistoryRef.current,
        { role: 'user', content: lastUserText },
        assistantEntry,
      ]
      sessionHistoryRef.current = nextHistory
      setSessionHistory(nextHistory)
      setTranscript(null)
      setAiText(null)
    }

    onTurnComplete?.({
      userText: lastUserText,
      charText: lastAiText,
      audioUrl: lastAudioUrl,
      freeCallUses: lastFreeCallUses,
      consumedFreeUse,
    })

    sendingRef.current = false
    setPhase((p) => (p === 'idle' ? p : 'ready'))
  }, [conversationId, callMode, onError, onTurnComplete, playAudio])

  const connect = useCallback(async () => {
    if (phase !== 'idle') return
    setError(null)
    setTranscript(null)
    setAiText(null)
    setPhase('connecting')
    sessionHistoryRef.current = []
    setSessionHistory([])
    questionChanceRef.current = 30

    // simple 모드: 이전 통화 세션 히스토리를 서버에서 받아 LLM 컨텍스트로 사용. 실패해도 빈 세션으로 진행.
    if (callMode === 'simple' && conversationId) {
      try {
        const token = useStore.getState().token
        const res = await fetch(`${API_URL}/conversations/${conversationId}/call/session`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data?.sessionHistory)) {
            sessionHistoryRef.current = data.sessionHistory
            setSessionHistory(data.sessionHistory)
          }
          if (typeof data?.lastEmotion === 'string' && data.lastEmotion) {
            setAiEmotion(data.lastEmotion)
          }
        }
      } catch (err) {
        console.warn('[Call] simple session fetch failed:', err)
      }
    }

    setPhase('ready')
  }, [phase, callMode, conversationId])

  const disconnect = useCallback(() => {
    setPhase('idle')
    fullCleanup()
  }, [fullCleanup])

  // 진행 중 턴 취소 (음성 재생 중단 + fetch abort)
  const cancelTurn = useCallback(() => {
    if (abortRef.current) {
      try { abortRef.current.abort() } catch {}
      abortRef.current = null
    }
    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
    }
    sendingRef.current = false
    setPhase((p) => (p === 'idle' ? p : 'ready'))
  }, [])

  return {
    phase,
    transcript,
    aiText,
    aiEmotion,
    sessionHistory,
    error,
    connect,
    disconnect,
    sendText,
    cancelTurn,
  }
}
