import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

const SPRITE_MODES = ['BUBBLE', 'FULL', 'BACKGROUND', 'OFF']
const CHAT_MODES = ['ROLEPLAY', 'NORMAL']

export default function ChatSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()
  const { t } = useTranslation()

  const [spriteMode, setSpriteMode] = useState('BUBBLE')
  const [chatMode, setChatMode] = useState('ROLEPLAY')
  // V2 채팅 — 배경 이미지를 AI가 자동 갱신하므로 spriteMode 'BACKGROUND' 옵션 비활성화.
  // 판별: conversation.dataV2 또는 conversation.character.promptDataV2 존재 여부.
  const [isV2, setIsV2] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingChatMode, setSavingChatMode] = useState(false)
  // 추천 답변 on/off (per conversation, 기본 ON)
  const [suggestedRepliesEnabled, setSuggestedRepliesEnabled] = useState(true)
  const [savingSuggested, setSavingSuggested] = useState(false)

  // 채팅 스타일 토글 — 캐릭터별 disabledStyleIds 관리
  const [characterId, setCharacterId] = useState(null)
  const [styleData, setStyleData] = useState(null) // { styles, hasNewStyle, seenAt }
  const [savingStyles, setSavingStyles] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    api.get(`/conversations/${id}/messages`)
      .then(({ conversation }) => {
        setSpriteMode(conversation?.spriteMode || 'BUBBLE')
        setChatMode(conversation?.chatMode === 'NORMAL' ? 'NORMAL' : 'ROLEPLAY')
        setSuggestedRepliesEnabled(conversation?.suggestedRepliesEnabled !== false)
        setIsV2(!!(conversation?.dataV2 || conversation?.character?.promptDataV2))
        const charId = conversation?.characterId
        if (charId) {
          setCharacterId(charId)
          api.get(`/chat-styles/${charId}`).then(setStyleData).catch(() => {})
          // 페이지 진입 = 새 스타일 인디케이터 해제
          api.post(`/chat-styles/${charId}/mark-seen`).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, token, navigate])

  const toggleStyle = async (styleId) => {
    if (!styleData || savingStyles) return
    const next = styleData.styles.map((s) =>
      s.id === styleId ? { ...s, disabled: !s.disabled } : s,
    )
    setStyleData({ ...styleData, styles: next })
    const disabledStyleIds = next.filter((s) => s.disabled).map((s) => s.id)
    setSavingStyles(true)
    try {
      await api.put(`/chat-styles/${characterId}`, { disabledStyleIds })
    } catch (err) {
      // 실패 시 롤백
      setStyleData(styleData)
      alert('저장 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSavingStyles(false)
    }
  }

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

  const handleToggleSuggested = async () => {
    if (savingSuggested) return
    const next = !suggestedRepliesEnabled
    setSuggestedRepliesEnabled(next)
    setSavingSuggested(true)
    try {
      await api.patch(`/conversations/${id}/suggested-replies`, { enabled: next })
    } catch (err) {
      console.error('Update suggested replies error:', err)
      setSuggestedRepliesEnabled(!next) // 롤백
    } finally {
      setSavingSuggested(false)
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

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {/* V2 채팅에서는 채팅모드 설정 미노출 — 스토리 모드는 항상 ROLEPLAY 형식 (narration/행동 표시) */}
        {!isV2 && (
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
        )}

        {/* 추천 답변 on/off — V1 채팅 전용 (V2는 추천답변 미생성) */}
        {!isV2 && (
        <section>
          <h2 className="text-sm font-semibold text-white mb-1">{t('chatSettings.suggestedReplies.heading', { defaultValue: '추천 답변' })}</h2>
          <p className="text-xs text-gray-500 mb-4">{t('chatSettings.suggestedReplies.description', { defaultValue: '대화마다 보낼 만한 답변을 입력창 위에 추천해줍니다. 끄면 추천이 표시되지 않습니다.' })}</p>
          <button
            onClick={handleToggleSuggested}
            disabled={savingSuggested}
            className={`w-full flex items-center justify-between gap-3 text-left p-4 rounded-xl border bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors ${savingSuggested ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={NO_OUTLINE}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{t('chatSettings.suggestedReplies.toggleLabel', { defaultValue: '추천 답변 표시' })}</p>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{suggestedRepliesEnabled ? t('chatSettings.suggestedReplies.on', { defaultValue: '켜짐 — 매 대화마다 추천 표시' }) : t('chatSettings.suggestedReplies.off', { defaultValue: '꺼짐 — 추천 미표시' })}</p>
            </div>
            <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${suggestedRepliesEnabled ? 'bg-indigo-500' : 'bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${suggestedRepliesEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </section>
        )}

        {/* 채팅 스타일 토글 — 캐릭터의 스타일 중 어떤 것을 표정 매칭 풀에 포함할지 */}
        {styleData?.styles?.length > 1 && (
          <section>
            <h2 className="text-sm font-semibold text-white mb-1">스타일 선택</h2>
            <p className="text-xs text-gray-500 mb-4">
              채팅 표정에 사용할 스타일을 켜고 끌 수 있어요. 여러 스타일을 켜두면 매번 그 중에서
              랜덤으로 표정 이미지가 나와요.
            </p>
            <div className="flex flex-wrap gap-3">
              {styleData.styles.map((s) => {
                const off = s.disabled
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStyle(s.id)}
                    disabled={savingStyles}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16"
                    style={NO_OUTLINE}
                  >
                    <div
                      className={`relative w-14 h-14 rounded-full p-[2px] ${
                        off
                          ? 'bg-gray-700/60'
                          : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400'
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                        <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-800">
                          {s.thumb ? (
                            <img
                              src={s.thumb}
                              alt={s.name}
                              draggable={false}
                              className="absolute inset-0 w-full h-full object-cover"
                              style={off ? { filter: 'grayscale(1) brightness(0.5)' } : undefined}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                              ?
                            </div>
                          )}
                          {s.isNew && (
                            <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-950" />
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] w-full text-center truncate leading-tight ${
                        off ? 'text-gray-500' : 'text-white font-semibold'
                      }`}
                    >
                      {s.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-white mb-1">{t('chatSettings.spriteMode.heading')}</h2>
          <p className="text-xs text-gray-500 mb-4">{t('chatSettings.spriteMode.description')}</p>

          <div className="space-y-2">
            {SPRITE_MODES.filter((mode) => !(isV2 && mode === 'BACKGROUND')).map((mode) => {
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
