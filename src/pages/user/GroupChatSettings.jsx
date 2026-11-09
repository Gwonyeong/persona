import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// 그룹 채팅 표정 이미지 출력 방식 — 서버(GroupChat.spriteMode)에서 관리.
const SPRITE_MODES = ['BUBBLE', 'OFF']
// 텍스트 스트리밍(타자기) 속도 — 서버(GroupChat.streamSpeed)에서 관리.
const STREAM_SPEEDS = ['SLOW', 'DEFAULT', 'FAST']
// 이 방에서 쓸 내 이름 — 서버(GroupChat.userNickname). 서버 검증과 같은 길이 제한.
const NICKNAME_MAX = 20
// 서버가 제거하는 문자(프롬프트 태그를 깨는 문자)를 입력 단계에서 미리 걸러 저장값과 화면값을 일치시킨다.
const sanitizeNickname = (v) => v.replace(/[\[\]《》{}"\r\n\t]/g, '')

export default function GroupChatSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, user } = useStore()
  const { t } = useTranslation()

  const [spriteMode, setSpriteMode] = useState('BUBBLE')
  const [streamSpeed, setStreamSpeed] = useState('DEFAULT')
  const [suggestEnabled, setSuggestEnabled] = useState(true)
  const [savedNickname, setSavedNickname] = useState('') // 서버에 저장된 값 ('' = 계정 이름 사용)
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [nicknameStatus, setNicknameStatus] = useState(null) // 'saved' | 'error' | null
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
        setStreamSpeed(groupChat?.streamSpeed || 'DEFAULT')
        setSuggestEnabled(groupChat?.suggestedRepliesEnabled !== false)
        setSavedNickname(groupChat?.userNickname || '')
        setNicknameInput(groupChat?.userNickname || '')
      })
      .catch((err) => {
        if (err.status === 404) navigate(`/group-chats/${id}`, { replace: true })
      })
      .finally(() => setLoading(false))
  }, [id, token, navigate])

  const saveNickname = async (value) => {
    if (nicknameSaving) return
    setNicknameSaving(true)
    setNicknameStatus(null)
    try {
      const res = await api.patch(`/group-chats/${id}/user-nickname`, { nickname: value })
      const next = res?.userNickname || ''
      setSavedNickname(next)
      setNicknameInput(next)
      setNicknameStatus('saved')
    } catch (err) {
      console.error('Update group user nickname error:', err)
      setNicknameStatus('error')
    } finally {
      setNicknameSaving(false)
    }
  }

  const nicknameDirty = nicknameInput.trim() !== savedNickname

  const handleToggleSuggest = async () => {
    if (saving) return
    const next = !suggestEnabled
    setSuggestEnabled(next)
    setSaving(true)
    try {
      await api.patch(`/group-chats/${id}/suggested-replies`, { enabled: next })
    } catch (err) {
      console.error('Update group suggested replies error:', err)
      setSuggestEnabled(!next) // 롤백
    } finally {
      setSaving(false)
    }
  }

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

  const handleSelectSpeed = async (speed) => {
    if (saving || speed === streamSpeed) return
    const prev = streamSpeed
    setStreamSpeed(speed)
    setSaving(true)
    try {
      await api.patch(`/group-chats/${id}/stream-speed`, { speed })
    } catch (err) {
      console.error('Update group stream speed error:', err)
      setStreamSpeed(prev) // 롤백
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

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <section>
          <h2 className="text-sm font-semibold text-white mb-1">
            {t('groupChatSettings.userNickname.heading', { defaultValue: '이 방에서 내 이름' })}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {t('groupChatSettings.userNickname.description', { defaultValue: '캐릭터들이 이 방에서 나를 부를 이름이에요. 비워두면 프로필 이름으로 불러요.' })}
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nicknameInput}
              maxLength={NICKNAME_MAX}
              onChange={(e) => {
                setNicknameInput(sanitizeNickname(e.target.value))
                setNicknameStatus(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nicknameDirty && !nicknameSaving) saveNickname(nicknameInput.trim())
              }}
              placeholder={user?.name || t('groupChatSettings.userNickname.placeholder', { defaultValue: '이름 입력' })}
              disabled={nicknameSaving}
              className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-600 focus:border-indigo-500/60"
              style={NO_OUTLINE}
            />
            <button
              onClick={() => saveNickname(nicknameInput.trim())}
              disabled={!nicknameDirty || nicknameSaving}
              className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                nicknameDirty && !nicknameSaving ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
              style={NO_OUTLINE}
            >
              {t('groupChatSettings.userNickname.save', { defaultValue: '저장' })}
            </button>
          </div>

          <div className="flex items-center justify-between mt-2 min-h-[20px]">
            <p className={`text-[11px] ${nicknameStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
              {nicknameStatus === 'saved'
                ? t('groupChatSettings.userNickname.saved', { defaultValue: '저장했어요. 다음 대화부터 적용돼요.' })
                : nicknameStatus === 'error'
                  ? t('groupChatSettings.userNickname.error', { defaultValue: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' })
                  : `${nicknameInput.length}/${NICKNAME_MAX}`}
            </p>
            {savedNickname && (
              <button
                onClick={() => saveNickname('')}
                disabled={nicknameSaving}
                className="text-[11px] text-gray-400 hover:text-white underline underline-offset-2"
                style={NO_OUTLINE}
              >
                {t('groupChatSettings.userNickname.reset', { defaultValue: '프로필 이름으로 되돌리기' })}
              </button>
            )}
          </div>
        </section>

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

        <section>
          <h2 className="text-sm font-semibold text-white mb-1">
            {t('groupChatSettings.streamSpeed.heading', { defaultValue: '텍스트 출력 속도' })}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {t('groupChatSettings.streamSpeed.description', { defaultValue: '메시지가 화면에 타이핑되는 속도를 선택합니다.' })}
          </p>

          <div className="space-y-2">
            {STREAM_SPEEDS.map((speed) => {
              const selected = streamSpeed === speed
              const defTitle = speed === 'SLOW' ? '느림' : speed === 'FAST' ? '빠름' : '기본'
              const defDesc =
                speed === 'SLOW'
                  ? '천천히 한 글자씩 출력됩니다.'
                  : speed === 'FAST'
                    ? '속도 제한 없이 가장 빠르게 출력됩니다.'
                    : '적당한 속도로 출력됩니다.'
              return (
                <button
                  key={speed}
                  onClick={() => handleSelectSpeed(speed)}
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
                      {t(`groupChatSettings.streamSpeed.options.${speed}.title`, { defaultValue: defTitle })}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      {t(`groupChatSettings.streamSpeed.options.${speed}.desc`, { defaultValue: defDesc })}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-1">
            {t('groupChatSettings.suggestedReplies.heading', { defaultValue: '추천 답변' })}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {t('groupChatSettings.suggestedReplies.description', { defaultValue: '내 차례에 보낼 만한 답변 후보를 버블 아래에 보여줍니다.' })}
          </p>

          <button
            onClick={handleToggleSuggest}
            disabled={saving}
            className={`w-full flex items-center justify-between gap-3 text-left p-4 rounded-xl border transition-colors bg-gray-900 border-gray-800 ${saving ? 'opacity-60 cursor-not-allowed' : 'hover:border-gray-700'}`}
            style={NO_OUTLINE}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {t('groupChatSettings.suggestedReplies.toggleLabel', { defaultValue: '추천 답변 표시' })}
              </p>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                {suggestEnabled
                  ? t('groupChatSettings.suggestedReplies.on', { defaultValue: '켜짐 — 답변 후보를 보여줍니다.' })
                  : t('groupChatSettings.suggestedReplies.off', { defaultValue: '꺼짐 — 답변 후보를 숨깁니다.' })}
              </p>
            </div>
            <div className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${suggestEnabled ? 'bg-indigo-500' : 'bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${suggestEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </section>
      </div>
    </div>
  )
}
