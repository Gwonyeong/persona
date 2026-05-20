import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

const SPRITE_MODES = ['BUBBLE', 'FULL', 'OFF']

export default function ChatSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()
  const { t } = useTranslation()

  const [spriteMode, setSpriteMode] = useState('BUBBLE')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    api.get(`/conversations/${id}/messages`)
      .then(({ conversation }) => {
        setSpriteMode(conversation?.spriteMode || 'BUBBLE')
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

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">{t('common.loading')}</div>
  }

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

      <div className="flex-1 overflow-y-auto px-4 py-6">
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
      </div>
    </div>
  )
}
