import useStore from '../store/useStore'
import i18n from '../i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

/**
 * 서버의 TTS 스트리밍 엔드포인트를 호출하여 오디오를 재생한다.
 * 서버가 ElevenLabs 스트리밍 응답을 프록시하므로, 클라이언트는 오디오 청크를 받아 즉시 재생한다.
 *
 * @param {string} path - API 경로 (예: /tts/stream)
 * @param {object} body - 요청 바디 { text, voiceId, emotion }
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - 취소 시그널
 * @param {function} [options.onStart] - 오디오 재생 시작 시 콜백
 * @param {function} [options.onEnd] - 오디오 재생 완료 시 콜백
 * @param {function} [options.onError] - 에러 발생 시 콜백
 * @returns {Promise<void>}
 */
export async function streamTTSAudio(path, body, options = {}) {
  const { signal, onStart, onEnd, onError } = options
  const token = useStore.getState().token

  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': i18n.language || 'en',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') return
    onError?.(err)
    throw err
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      useStore.getState().clearAuth()
    }
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || 'TTS request failed')
    err.status = res.status
    onError?.(err)
    throw err
  }

  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const reader = res.body.getReader()
  const chunks = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal?.aborted) break
      chunks.push(value)
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      audioContext.close()
      return
    }
    throw err
  }

  if (signal?.aborted) {
    audioContext.close()
    return
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const audioData = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    audioData.set(chunk, offset)
    offset += chunk.length
  }

  try {
    const audioBuffer = await audioContext.decodeAudioData(audioData.buffer)
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContext.destination)

    onStart?.()

    return new Promise((resolve) => {
      source.onended = () => {
        audioContext.close()
        onEnd?.()
        resolve()
      }

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            source.stop()
            audioContext.close()
            resolve()
          },
          { once: true }
        )
      }

      source.start(0)
    })
  } catch (err) {
    audioContext.close()
    onError?.(err)
    throw err
  }
}

/**
 * 간단한 TTS 재생 (비스트리밍, 전체 오디오를 받아 한 번에 재생)
 *
 * @param {string} path - API 경로 (예: /tts/generate)
 * @param {object} body - 요청 바디 { text, voiceId, emotion }
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - 취소 시그널
 * @returns {Promise<HTMLAudioElement>} 오디오 엘리먼트
 */
export async function playTTSAudio(path, body, options = {}) {
  const { signal } = options
  const token = useStore.getState().token

  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': i18n.language || 'en',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    if (res.status === 401 && token) {
      useStore.getState().clearAuth()
    }
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'TTS request failed')
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)

  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        audio.pause()
        URL.revokeObjectURL(url)
      },
      { once: true }
    )
  }

  return audio
}
