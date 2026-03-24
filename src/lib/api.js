import useStore from '../store/useStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

function getGuestId() {
  let id = localStorage.getItem('guestId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('guestId', id)
  }
  return id
}

async function request(path, options = {}) {
  const token = useStore.getState().token
  const headers = { ...options.headers }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    headers['X-Guest-Id'] = getGuestId()
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
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function streamRequest(path, body, onEvent) {
  const token = useStore.getState().token
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    headers['X-Guest-Id'] = getGuestId()
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let eventType = null
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7)
      } else if (line.startsWith('data: ') && eventType) {
        try {
          const data = JSON.parse(line.slice(6))
          onEvent(eventType, data)
        } catch {}
        eventType = null
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
  delete: (path) => request(path, { method: 'DELETE' }),
  stream: streamRequest,
}
