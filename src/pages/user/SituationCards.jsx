import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// 상황극(VN) 카드 선택 페이지. V1 채팅 헤더의 카드 아이콘에서 진입.
// 경로: /chats/:id/situations?c=<characterId>  (id=conversationId, c=characterId)
export default function SituationCards() {
  const { id } = useParams() // 진입 시점 conversationId (뒤로가기 복귀용)
  const [searchParams] = useSearchParams()
  const characterId = searchParams.get('c')
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [cards, setCards] = useState([])
  const [sessions, setSessions] = useState([]) // 진행 중인 상황극 (이어하기)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null) // 시작 중인 cardId
  const [error, setError] = useState(null)
  const [confirmCard, setConfirmCard] = useState(null) // 새로 시작 경고 대상 카드

  useEffect(() => {
    if (!characterId) {
      setError(t('situationCards.empty', { defaultValue: '아직 상황극이 없어요' }))
      setLoading(false)
      return
    }
    api
      .get(`/characters/${characterId}/situation-cards`)
      .then(({ cards, sessions }) => {
        setCards(Array.isArray(cards) ? cards : [])
        setSessions(Array.isArray(sessions) ? sessions : [])
      })
      .catch(() => setError(t('situationCards.loadFailed', { defaultValue: '불러오지 못했어요' })))
      .finally(() => setLoading(false))
  }, [characterId, t])

  // 실제 시작 — 서버가 같은 카드 기존 세션을 소프트 삭제 후 새 세션 생성.
  const startCard = async (card) => {
    if (starting) return
    setStarting(card.id)
    setError(null)
    try {
      const { conversationId } = await api.post(
        `/characters/${characterId}/situation-cards/${card.id}/start`,
        {},
      )
      navigate(`/vn/${conversationId}`)
    } catch {
      setError(t('situationCards.startFailed', { defaultValue: '상황극을 시작하지 못했어요' }))
      setStarting(null)
    }
  }

  const onCardTap = (card) => {
    if (card.locked) { navigate('/adult-verify'); return }
    if (starting) return
    // 같은 카드에 진행 중 세션이 있으면 → 새로 시작 시 기존 삭제 경고 모달.
    if (sessions.some((s) => s.cardId === card.id)) { setConfirmCard(card); return }
    startCard(card)
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 8px)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white"
          style={NO_OUTLINE}
          aria-label={t('common.back', { defaultValue: '뒤로' })}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-white font-semibold text-base">{t('situationCards.title', { defaultValue: '상황극' })}</h1>
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 16px)' }}
      >
        {loading ? (
          <p className="text-gray-500 text-sm text-center mt-10">{t('common.loading', { defaultValue: '불러오는 중...' })}</p>
        ) : error && cards.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-10">{error}</p>
        ) : cards.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-10">{t('situationCards.empty', { defaultValue: '아직 상황극이 없어요' })}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {error && <p className="text-rose-400 text-[12px] text-center">{error}</p>}
            {sessions.length > 0 && (
              <>
                <p className="text-gray-400 text-[11px] font-semibold px-1 mt-1">{t('situationCards.continue', { defaultValue: '이어하기' })}</p>
                {sessions.map((s) => (
                  <button
                    key={s.conversationId}
                    onClick={() => navigate(`/vn/${s.conversationId}`)}
                    className="relative w-full text-left p-4 rounded-2xl border bg-indigo-950/30 border-indigo-800/40 hover:border-indigo-500/60 transition-colors"
                    style={NO_OUTLINE}
                  >
                    <div className="flex items-center gap-2">
                      {s.emoji && <span className="text-lg">{s.emoji}</span>}
                      <span className="text-white font-medium text-sm">{s.title}</span>
                      {s.safety === 'NSFW' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">19</span>
                      )}
                      <span className="ml-auto text-[10px] text-indigo-300 whitespace-nowrap">{t('situationCards.continue', { defaultValue: '이어하기' })} ▸</span>
                    </div>
                    {s.lastLine && <p className="text-gray-400 text-[12px] mt-1.5 leading-relaxed line-clamp-1">…{s.lastLine}</p>}
                  </button>
                ))}
                <p className="text-gray-400 text-[11px] font-semibold px-1 mt-3">{t('situationCards.startNew', { defaultValue: '새 상황극' })}</p>
              </>
            )}
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => onCardTap(card)}
                disabled={!!starting}
                className={`relative w-full text-left p-4 rounded-2xl border transition-colors ${
                  card.locked ? 'bg-gray-900/60 border-gray-800' : 'bg-gray-900 border-gray-800 hover:border-indigo-500/60'
                } ${starting && starting !== card.id ? 'opacity-50' : ''}`}
                style={NO_OUTLINE}
              >
                <div className={card.locked ? 'blur-[3px] select-none' : ''}>
                  <div className="flex items-center gap-2">
                    {card.emoji && <span className="text-lg">{card.emoji}</span>}
                    <span className="text-white font-medium text-sm">{card.title}</span>
                    {card.safety === 'NSFW' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">19</span>
                    )}
                  </div>
                  {card.summary && <p className="text-gray-400 text-[12px] mt-1.5 leading-relaxed">{card.summary}</p>}
                </div>
                {card.locked && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-950/40">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f9a8d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span className="text-[11px] text-rose-200 font-medium">{t('situationCards.lockedHint', { defaultValue: '성인 인증하면 열려요' })}</span>
                  </div>
                )}
                {starting === card.id && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gray-950/50">
                    <span className="text-[12px] text-indigo-300">{t('situationCards.starting', { defaultValue: '시작하는 중...' })}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 새로 시작 경고 — 기존 진행 데이터 소프트 삭제 안내 */}
      {confirmCard && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setConfirmCard(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-semibold text-base mb-2">{t('situationCards.restartTitle', { defaultValue: '새로 시작할까요?' })}</p>
            <p className="text-gray-300 text-[13px] leading-relaxed mb-4">
              {t('situationCards.restartDesc', { defaultValue: '이 상황극의 기존 진행 데이터가 삭제되고 처음부터 새로 시작됩니다.' })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmCard(null)} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-200 text-sm" style={NO_OUTLINE}>
                {t('common.cancel', { defaultValue: '취소' })}
              </button>
              <button
                onClick={() => { const c = confirmCard; setConfirmCard(null); startCard(c) }}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium"
                style={NO_OUTLINE}
              >
                {t('situationCards.restartConfirm', { defaultValue: '새로 시작' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
