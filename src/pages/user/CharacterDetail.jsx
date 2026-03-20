import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function CharacterDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()
  const [character, setCharacter] = useState(null)
  const [existingConv, setExistingConv] = useState(null) // { conversationId, affinity }
  const [starting, setStarting] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)

  useEffect(() => {
    api.get(`/characters/${id}`).then(({ character }) => setCharacter(character))
  }, [id])

  useEffect(() => {
    if (!token) return
    api.get(`/conversations/check/${id}`)
      .then((data) => {
        if (data.exists) setExistingConv(data)
        else setExistingConv(null)
      })
      .catch(() => setExistingConv(null))
  }, [id, token])

  const startChat = async () => {
    setStarting(true)
    try {
      const { conversation } = await api.post('/conversations', { characterId: parseInt(id) })
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  const resumeChat = () => {
    if (existingConv) navigate(`/chats/${existingConv.conversationId}`)
  }

  const resetChat = async () => {
    setShowResetModal(false)
    setStarting(true)
    try {
      const { conversation } = await api.post(`/conversations/${existingConv.conversationId}/reset`)
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  if (!character) {
    return <div className="flex items-center justify-center h-screen text-gray-400">로딩 중...</div>
  }

  const mainImage = character.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
  const mainImageUrl = getImageUrl(mainImage?.filePath)

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Helmet>
        <title>{character.name} - Pesona</title>
        <meta name="description" content={character.description} />
        <meta property="og:title" content={`${character.name} - Pesona`} />
        <meta property="og:description" content={character.description} />
      </Helmet>
      {/* 헤더 */}
      <div className="flex items-center p-4">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white mr-3"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-auto px-4">
        {/* 캐릭터 이미지 */}
        <div className="w-full aspect-[9/16] rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden mx-auto mb-5">
          {mainImageUrl ? (
            <img src={mainImageUrl} alt={character.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-gray-700">?</div>
          )}
        </div>

        {/* 이름 */}
        <h1 className="text-2xl font-bold">{character.name}</h1>

        {/* 소개 */}
        <p className="text-sm text-gray-300 leading-relaxed mt-2">
          {character.description}
        </p>

        {/* 태그 */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {character.tags.map((tag) => (
            <span key={tag} className="px-2 py-1 bg-gray-800 rounded-full text-xs text-gray-300">
              #{tag}
            </span>
          ))}
        </div>

        {/* 컨셉 */}
        {character.concept && (
          <p className="text-sm text-gray-400 italic mt-1">{character.concept}</p>
        )}

        {/* 대화 미리보기 */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 mr-2 mt-1">
              {mainImageUrl ? (
                <img src={mainImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>
              )}
            </div>
            <div className="max-w-[75%]">
              <p className="text-xs text-gray-400 mb-1 font-medium">{character.name}</p>
              <div className="rounded-2xl rounded-bl-md text-sm leading-relaxed overflow-hidden bg-gray-800/80 text-gray-100">
              {mainImageUrl && (
                <div className="w-full aspect-[9/16] bg-gray-900">
                  <img src={mainImageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="px-3.5 py-2.5">
                {character.firstMessage.split(/(\*[^*]+\*)/).map((part, i) => {
                  if (part.startsWith('*') && part.endsWith('*')) {
                    return (
                      <em key={i} className="text-gray-400 not-italic text-xs block mt-1">
                        {part.slice(1, -1)}
                      </em>
                    )
                  }
                  return <span key={i}>{part}</span>
                })}
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* 스타일 목록 */}
        {character.styles.length > 0 && (
          <div className="mt-4 mb-6">
            <p className="text-xs text-gray-500 mb-2">스타일 {character.styles.length}종</p>
            <div className="flex gap-2 overflow-x-auto">
              {character.styles.map((style) => {
                const img = style.images.find((i) => i.emotion === 'NEUTRAL')
                const url = getImageUrl(img?.filePath)
                return (
                  <div key={style.id} className="flex-shrink-0 w-16 text-center">
                    <div className="w-16 h-16 rounded-lg bg-gray-800 overflow-hidden border border-gray-700">
                      {url ? (
                        <img src={url} alt={style.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 truncate">{style.name}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 광고 */}
      <div className="px-4 mb-2">
        <AdBanner slot="3193498609" />
      </div>

      {/* 하단 CTA */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/95">
        {existingConv ? (
          <div className="flex gap-2">
            <button
              onClick={() => setShowResetModal(true)}
              disabled={starting}
              className="flex-1 py-3.5 bg-gray-800 text-gray-200 font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors border border-gray-700"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              새로하기
            </button>
            <button
              onClick={resumeChat}
              disabled={starting}
              className="flex-1 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              이어하기
            </button>
          </div>
        ) : (
          <button
            onClick={startChat}
            disabled={starting}
            className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {starting ? '시작 중...' : '대화 시작'}
          </button>
        )}
      </div>

      {/* 리셋 경고 모달 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">대화를 새로 시작할까요?</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              기존 대화 내역과 호감도가 모두 초기화됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={resetChat}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                새로 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
