import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// 그룹 채팅 표정 이미지 출력 방식 — 서버(GroupChat.spriteMode)에서 관리.
const SPRITE_MODES = ['BUBBLE', 'OFF']

export default function GroupChatSettings() {
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
    api.get(`/group-chats/${id}`)
      .then(({ groupChat }) => {
        setSpriteMode(groupChat?.spriteMode || 'BUBBLE')
      })
      .catch((err) => {
        if (err.status === 404) navigate(`/group-chats/${id}`, { replace: true })
      })
      .finally(() => setLoading(false))
  }, [id, token, navigate])

  const handleSelect = async (mode) => {
    if (saving || mode === spriteMode) return
    const prev = spriteMode
    setSpriteMode(mode)
    setSaving(true)
    try {
      await api.patch(`/group-chats/${id}/sprite-mode`, { mode })
    } catch (err) {
      console.error('Update group sprite mode error:', err)
      setSpriteMode(prev) // 롤백
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
            // navigate(-1)로 settings를 히스토리에서 pop → 채팅에서 뒤로가기 시 settings로 안 돌아옴.
            if (window.history.state?.idx > 0) {
              navigate(-1)
            } else {
              navigate(`/group-chats/${id}`, { replace: true })
            }
          }}
          className="text-gray-400 hover:text-white"
          style={NO_OUTLINE}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-semibold text-sm text-white">{t('groupChatSettings.title', { defaultValue: '채팅 설정' })}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-white mb-1">
            {t('groupChatSettings.spriteMode.heading', { defaultValue: '표정 이미지 표시' })}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {t('groupChatSettings.spriteMode.description', { defaultValue: '입력창 위에 참여 캐릭터의 표정 이미지를 어떻게 보여줄지 선택합니다.' })}
          </p>

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
                    <p className="text-sm font-medium text-white">
                      {t(`groupChatSettings.spriteMode.options.${mode}.title`, {
                        defaultValue: mode === 'BUBBLE' ? '기본' : '없음',
                      })}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      {t(`groupChatSettings.spriteMode.options.${mode}.desc`, {
                        defaultValue:
                          mode === 'BUBBLE'
                            ? '입력창 위에 표정을 작은 카드로 표시합니다.'
                            : '표정 이미지를 표시하지 않습니다.',
                      })}
                    </p>
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
