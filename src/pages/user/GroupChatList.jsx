import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'
import { resizedImageUrl, IMG_W } from '../../lib/imageUrl'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

// 상황극 컨셉 카드 — 한 줄에 하나, 16:9 가로형. 커버가 있으면 배경으로, 없으면 이모지 + 그라데이션.
// 하단 딤드 위에 제목·설명·배역 칩.
function ConceptCard({ concept, onClick }) {
  const cover = getImageUrl(concept.coverImage)
  const roles = Array.isArray(concept.roles) ? concept.roles : []
  return (
    <button
      onClick={onClick}
      className="block text-left w-full group"
      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-indigo-900/70 via-gray-900 to-fuchsia-900/50 flex items-center justify-center group-hover:ring-1 group-hover:ring-gray-700 transition-all">
        {cover ? (
          <img src={resizedImageUrl(cover, IMG_W.HERO)} alt={concept.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl -mt-12 drop-shadow-lg">{concept.emoji || '🎬'}</span>
        )}
        {concept.safety === 'NSFW' && (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/80 text-white">19</span>
        )}
        <div className="absolute inset-x-0 bottom-0 min-h-[50%] flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/55 to-transparent p-3 pt-10 pointer-events-none">
          <p className="text-[15px] font-bold text-white leading-snug drop-shadow break-keep break-words">
            {cover && concept.emoji ? `${concept.emoji} ` : ''}{concept.title}
          </p>
          {concept.summary && (
            <p className="text-[12px] text-gray-200 leading-snug line-clamp-1 mt-0.5 break-keep break-words">{concept.summary}</p>
          )}
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {roles.map((r) => (
                <span key={r.key} className="text-[9px] leading-none px-1.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function GroupChatList() {
  const { t } = useTranslation()
  const { token } = useStore()
  const navigate = useNavigate()
  const [concepts, setConcepts] = useState([])

  // 내 단톡방 목록은 대화 탭(/chats?tab=group)으로 옮겨졌다. 이 화면은 컨셉 카드 전용.
  useEffect(() => {
    if (!token) return
    api.get('/group-concepts').then(({ concepts }) => setConcepts(concepts || [])).catch(() => {})
  }, [token])

  return (
    <div className="pt-2 pb-2">
      <Helmet>
        <title>{t('groupChatList.title')}</title>
        <meta name="description" content={t('groupChatList.metaDescription')} />
      </Helmet>

      {/* 헤더 */}
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-xl font-bold">{t('groupChatList.heading')}</h1>
      </div>

      {!token ? (
        <div className="text-center py-20 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p className="text-gray-300 font-semibold mb-1">{t('groupChatList.heading')}</p>
          <p className="text-sm text-gray-500 mb-5">{t('groupChatList.loginPrompt')}</p>
          <button
            onClick={() => goToLogin(navigate)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.login')}
          </button>
        </div>
      ) : (
        // 상황극 컨셉 — 한 줄에 하나씩 16:9 가로 카드. 탭 → 캐스팅 화면
        <div className="px-4">
          <h2 className="text-lg font-bold text-white">{t('groupChatList.concepts')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">{t('groupChatList.conceptsHint')}</p>
          <div className="flex flex-col gap-3">
            {concepts.map((concept) => (
              <ConceptCard key={concept.id} concept={concept} onClick={() => navigate(`/group-chats/cast/${concept.id}`)} />
            ))}

            {/* 자유 조합 진입 — 카드 목록 끝의 점선 버튼 */}
            <button
              onClick={() => navigate('/group-chats/new')}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm px-3 text-center"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('groupChatList.freeCombo')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
