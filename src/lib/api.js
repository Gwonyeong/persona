import useStore from '../store/useStore'
import i18n from '../i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

async function request(path, options = {}) {
  const token = useStore.getState().token
  const headers = { ...options.headers }

  headers['Accept-Language'] = i18n.language || 'en'

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json()

  if (!res.ok) {
    if (res.status === 401 && token) {
      useStore.getState().clearAuth()
    }
    const err = new Error(data.error || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

async function streamRequest(path, body, onEvent) {
  const token = useStore.getState().token
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'Accept-Language': i18n.language || 'en',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    if (res.status === 401 && token) {
      useStore.getState().clearAuth()
    }
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Request failed')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // eventType은 청크 경계를 넘어 유지되어야 한다. 빈 라인(SSE 메시지 종결자)에서만 리셋.
  let eventType = null
  let dataLine = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (let raw of lines) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (line === '') {
        // SSE 메시지 종결: 누적된 event/data를 dispatch
        if (eventType && dataLine !== null) {
          try {
            onEvent(eventType, JSON.parse(dataLine))
          } catch {}
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
}

export const api = {
  get: (path) => request(path),
  post: (path, body, options = {}) =>
    request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  put: (path, body) =>
    request(path, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: (path) => request(path, { method: 'DELETE' }),
  stream: streamRequest,
}
