import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

const SPRITE_MODES = ['BUBBLE', 'FULL', 'BACKGROUND', 'OFF']
const CHAT_MODES = ['ROLEPLAY', 'NORMAL']
const NICKNAME_MODES = ['NAME', 'OPPA', 'CUSTOM']
const OPPA_VALUE = '오빠'
const NICKNAME_MAX = 20

function resolveNicknameMode(value) {
  const v = (value || '').trim()
  if (!v) return 'NAME'
  if (v === OPPA_VALUE) return 'OPPA'
  return 'CUSTOM'
}

export default function ChatSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, user } = useStore()
  const { t } = useTranslation()

  const [spriteMode, setSpriteMode] = useState('BUBBLE')
  const [chatMode, setChatMode] = useState('ROLEPLAY')
  const [nicknameMode, setNicknameMode] = useState('NAME')
  const [customNickname, setCustomNickname] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingChatMode, setSavingChatMode] = useState(false)
  const [savingNickname, setSavingNickname] = useState(false)
  const customInputRef = useRef(null)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    api.get(`/conversations/${id}/messages`)
      .then(({ conversation }) => {
        setSpriteMode(conversation?.spriteMode || 'BUBBLE')
        setChatMode(conversation?.chatMode === 'NORMAL' ? 'NORMAL' : 'ROLEPLAY')
        const stored = conversation?.userNickname || ''
        const mode = resolveNicknameMode(stored)
        setNicknameMode(mode)
        setCustomNickname(mode === 'CUSTOM' ? stored : '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, token, navigate])

  const handleSelect = async (mode) => {
    if (saving || mode === spriteMode) return
    setSaving(true)
    setSpriteMode(mode)
    try {
      await api.patch(`/conversations/${id}/sprite-mode`, { mode })
    } catch (err) {
      console.error('Update sprite mode error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleChatModeSelect = async (mode) => {
    if (savingChatMode || mode === chatMode) return
    setSavingChatMode(true)
    setChatMode(mode)
    try {
      await api.patch(`/conversations/${id}/chat-mode`, { mode })
    } catch (err) {
      console.error('Update chat mode error:', err)
    } finally {
      setSavingChatMode(false)
    }
  }

  const persistNickname = async (value) => {
    setSavingNickname(true)
    try {
      await api.patch(`/conversations/${id}/user-nickname`, { nickname: value })
    } catch (err) {
      console.error('Update user nickname error:', err)
    } finally {
      setSavingNickname(false)
    }
  }

  const handleNicknameMode = async (mode) => {
    if (savingNickname) return
    if (mode === nicknameMode) {
      // 이미 CUSTOM 상태에서 영역을 다시 클릭하면 input에 포커스
      if (mode === 'CUSTOM') customInputRef.current?.focus()
      return
    }
    setNicknameMode(mode)
    if (mode === 'NAME') {
      setCustomNickname('')
      await persistNickname(null)
    } else if (mode === 'OPPA') {
      setCustomNickname('')
      await persistNickname(OPPA_VALUE)
    } else if (mode === 'CUSTOM') {
      // 마운트 직후 포커스 (next tick)
      setTimeout(() => customInputRef.current?.focus(), 0)
    }
  }

  const handleCustomBlur = async () => {
    if (nicknameMode !== 'CUSTOM') return
    const trimmed = customNickname.trim().slice(0, NICKNAME_MAX)
    if (!trimmed) {
      // 빈값이면 NAME으로 폴백
      setNicknameMode('NAME')
      setCustomNickname('')
      await persistNickname(null)
      return
    }
    if (trimmed === OPPA_VALUE) {
      setNicknameMode('OPPA')
      setCustomNickname('')
      await persistNickname(OPPA_VALUE)
      return
    }
    await persistNickname(trimmed)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('common.loading')}</div>
  }

  const userName = user?.name || ''

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
      >
        <button
          onClick={() => {
            // navigate(-1)로 settings를 히스토리에서 pop → 채팅 페이지에서 뒤로가기 시 settings로 돌아오지 않음.
            // 직접 URL 진입(히스토리 없음)일 경우만 replace로 채팅 페이지로 이동.
            if (window.history.state?.idx > 0) {
              navigate(-1)
            } else {
              navigate(`/chats/${id}`, { replace: true })
            }
          }}
          className="text-gray-400 hover:text-white"
          style={NO_OUTLINE}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-semibold text-sm text-white">{t('chatSettings.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-white mb-1">{t('chatSettings.chatMode.heading')}</h2>
          <p className="text-xs text-gray-500 mb-4">{t('chatSettings.chatMode.description')}</p>

          <div className="space-y-2">
            {CHAT_MODES.map((mode) => {
              const selected = chatMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => handleChatModeSelect(mode)}
                  disabled={savingChatMode}
                  className={`w-full flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
                    selected
                      ? 'bg-indigo-600/15 border-indigo-500/60'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                  } ${savingChatMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={NO_OUTLINE}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? 'border-indigo-400' : 'border-gray-600'
                  }`}>
                    {selected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{t(`chatSettings.chatMode.options.${mode}.title`)}</p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{t(`chatSettings.chatMode.options.${mode}.desc`)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-1">{t('chatSettings.spriteMode.heading')}</h2>
          <p className="text-xs text-gray-500 mb-4">{t('chatSettings.spriteMode.description')}</p>

          <div className="space-y-2">
            {SPRITE_MODES.map((mode) => {
              const selected = spriteMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => handleSelect(mode)}
                  disabled={saving}
                  className={`w-full flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
                    selected
                      ? 'bg-indigo-600/15 border-indigo-500/60'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                  } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={NO_OUTLINE}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? 'border-indigo-400' : 'border-gray-600'
                  }`}>
                    {selected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{t(`chatSettings.spriteMode.options.${mode}.title`)}</p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{t(`chatSettings.spriteMode.options.${mode}.desc`)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-1">{t('chatSettings.nickname.heading')}</h2>
          <p className="text-xs text-gray-500 mb-4">{t('chatSettings.nickname.description')}</p>

          <div className="space-y-2">
            {NICKNAME_MODES.map((mode) => {
              const selected = nicknameMode === mode
              const title = mode === 'NAME'
                ? t('chatSettings.nickname.options.NAME.title', { name: userName || t('chatSettings.nickname.fallbackName') })
                : t(`chatSettings.nickname.options.${mode}.title`)
              return (
                <div key={mode}>
                  <button
                    onClick={() => handleNicknameMode(mode)}
                    disabled={savingNickname}
                    className={`w-full flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-indigo-600/15 border-indigo-500/60'
                        : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    } ${selected && mode === 'CUSTOM' ? 'rounded-b-none border-b-0' : ''} ${savingNickname ? 'opacity-60 cursor-not-allowed' : ''}`}
                    style={NO_OUTLINE}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      selected ? 'border-indigo-400' : 'border-gray-600'
                    }`}>
                      {selected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{title}</p>
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{t(`chatSettings.nickname.options.${mode}.desc`)}</p>
                    </div>
                  </button>
                  {mode === 'CUSTOM' && selected && (
                    <div className="px-4 pb-4 pt-3 rounded-b-xl border border-t-0 border-indigo-500/60 bg-indigo-600/15">
                      <input
                        ref={customInputRef}
                        type="text"
                        value={customNickname}
                        onChange={(e) => setCustomNickname(e.target.value.slice(0, NICKNAME_MAX))}
                        onBlur={handleCustomBlur}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.currentTarget.blur()
                          }
                        }}
                        placeholder={t('chatSettings.nickname.customPlaceholder')}
                        maxLength={NICKNAME_MAX}
                        className="w-full px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-600 focus:border-indigo-500"
                        style={NO_OUTLINE}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
