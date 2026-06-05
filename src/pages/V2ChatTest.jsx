// V2 채팅 테스트 페이지 (임시).
// 경로: /v2-test/:conversationId
// 기존 채팅 UI 영향 없이 V2 API(POST /api/v2/conversations/:id/messages)로만 통신.
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import i18n from '../i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

async function v2Request(path, options = {}) {
  const token = useStore.getState().token
  const headers = {
    'Accept-Language': i18n.language || 'en',
    ...options.headers,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export default function V2ChatTest() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [initing, setIniting] = useState(false)
  const [error, setError] = useState(null)
  const [showPlanFor, setShowPlanFor] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await v2Request(`/v2/conversations/${id}`)
        if (!cancelled) setInfo(data)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  async function initWithPreset(presetId) {
    if (initing) return
    setIniting(true)
    setError(null)
    try {
      const result = await v2Request(`/v2/conversations/${id}/init`, {
        method: 'POST',
        body: JSON.stringify({ presetId }),
      })
      setInfo((prev) => ({ ...prev, dataV2: result.dataV2 }))
    } catch (e) {
      setError(e.message || 'init failed')
    } finally {
      setIniting(false)
    }
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [info?.dataV2?.messages?.length])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const userMsg = { role: 'USER', content: text, createdAt: new Date().toISOString() }
      setInfo((prev) => ({
        ...prev,
        dataV2: { ...prev.dataV2, messages: [...prev.dataV2.messages, userMsg] },
      }))
      setInput('')

      const result = await v2Request(`/v2/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      })

      const charMsg = {
        role: 'CHARACTER',
        content: result.messages,
        emotion: result.emotion,
        plan: result.plan,
        createdAt: new Date().toISOString(),
      }
      setInfo((prev) => ({
        ...prev,
        dataV2: {
          ...prev.dataV2,
          messages: [...prev.dataV2.messages, charMsg],
          affinity: result.affinity,
          familiarity: result.familiarity,
          characterStatus: result.characterStatus || prev.dataV2.characterStatus,
          currentStageIds: result.stages,
        },
        lastElapsed: result.elapsedMs,
        lastSummarized: result.summarized,
      }))
    } catch (e) {
      setError(e.message || 'failed')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (error && !info) {
    return (
      <div style={{ padding: 20, color: '#c00' }}>
        <h2>V2 채팅 로드 실패</h2>
        <p>{error}</p>
        <button
          onClick={() => navigate('/chats')}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          채팅 목록
        </button>
      </div>
    )
  }

  if (!info) {
    return <div style={{ padding: 20 }}>로딩…</div>
  }

  const { character, dataV2, lastElapsed, startingPresets } = info

  // dataV2가 없으면 preset 선택 화면
  if (!dataV2) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fafafa', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            ←
          </button>
          <strong>{character?.name} — 시작 난이도 선택</strong>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          어떤 관계로 시작할지 선택해주세요. 선택에 따라 친밀도·호감도 시작점이 달라집니다.
        </p>
        {error && <div style={{ color: '#c00', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        {!startingPresets?.length ? (
          <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>
            이 캐릭터에 startingPresets이 정의되어 있지 않습니다.
            <br />
            <button
              onClick={() => initWithPreset(null)}
              disabled={initing}
              style={{
                marginTop: 12, padding: '10px 16px', borderRadius: 8, border: 'none',
                background: '#3182f6', color: '#fff', cursor: initing ? 'default' : 'pointer',
                outline: 'none', WebkitTapHighlightColor: 'transparent',
              }}
            >
              기본값(0/0)으로 시작
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {startingPresets.map((p) => (
              <button
                key={p.id}
                onClick={() => initWithPreset(p.id)}
                disabled={initing}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: initing ? 'default' : 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{p.description}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  친밀도 {p.familiarity} · 호감도 {p.affinity}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const stages = dataV2.currentStageIds || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 480, margin: '0 auto', background: '#fafafa' }}>
      {/* Header */}
      <div style={{ padding: 12, borderBottom: '1px solid #ddd', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            ←
          </button>
          <strong>{character?.name} (V2 테스트)</strong>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>친밀도: <strong>{dataV2.familiarity}</strong> ({stages.familiarity || '-'})</span>
          <span>호감도: <strong>{dataV2.affinity}</strong> ({stages.affinity || '-'})</span>
          {dataV2.userNickname && <span>호칭: <strong>{dataV2.userNickname}</strong></span>}
          {lastElapsed && <span>응답: {lastElapsed}ms</span>}
          <span>LTM: <strong>{(dataV2.longTermMemory || []).length}</strong></span>
          {info?.lastSummarized && <span style={{ color: '#3182f6' }}>요약 갱신됨</span>}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {(dataV2.messages || []).length === 0 && (
          <div style={{ color: '#999', textAlign: 'center', padding: 24, fontSize: 13 }}>
            아직 대화 없음. 첫 메시지를 보내보세요.
          </div>
        )}
        {(dataV2.messages || []).map((m, i) => (
          <MessageBubble key={i} msg={m} index={i} showPlan={showPlanFor === i} onTogglePlan={() => setShowPlanFor(showPlanFor === i ? null : i)} />
        ))}
        {sending && (
          <div style={{ padding: 8, color: '#999', fontStyle: 'italic', fontSize: 12 }}>응답 생성 중… (Planner → Generator)</div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: '1px solid #ddd', background: '#fff' }}>
        {error && <div style={{ color: '#c00', fontSize: 12, marginBottom: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 입력…"
            disabled={sending}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: sending || !input.trim() ? '#ddd' : '#3182f6',
              color: '#fff',
              cursor: sending || !input.trim() ? 'default' : 'pointer',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            전송
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg, showPlan, onTogglePlan }) {
  if (msg.role === 'USER') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ background: '#3182f6', color: '#fff', padding: '8px 12px', borderRadius: 14, maxWidth: '72%', fontSize: 14, whiteSpace: 'pre-wrap' }}>
          {msg.content}
        </div>
      </div>
    )
  }
  const messages = Array.isArray(msg.content) ? msg.content : [msg.content]
  return (
    <div style={{ marginBottom: 12 }}>
      {messages.map((m, i) => (
        <div key={i} style={{ display: 'flex', marginBottom: 4 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e5e5', padding: '8px 12px', borderRadius: 14, maxWidth: '78%', fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {m}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#666', marginTop: 4 }}>
        {msg.emotion && <span style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>{msg.emotion}</span>}
        {msg.plan && (
          <button
            onClick={onTogglePlan}
            style={{ border: 'none', background: '#eef', color: '#36c', padding: '2px 6px', borderRadius: 4, fontSize: 11, cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {showPlan ? 'plan 숨기기' : 'plan 보기'}
          </button>
        )}
      </div>
      {showPlan && msg.plan && (
        <div style={{ marginTop: 6, padding: 8, background: '#f8f8fc', border: '1px solid #e0e0ee', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(msg.plan, null, 2)}
        </div>
      )}
    </div>
  )
}
