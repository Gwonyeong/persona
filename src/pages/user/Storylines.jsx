import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import StoryGridCard from '../../components/StoryGridCard'

// 스토리 전체보기 — 홈 "최근 공개된 스토리 › 전체보기". 완료한 것 포함, 공개(어드민은 TEST 포함) 전부.
const PAGE = 30

export default function Storylines() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [stories, setStories] = useState(null) // null = 로딩
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const load = async (offset) => {
    const { storylines, total } = await api.get(`/storylines?limit=${PAGE}&offset=${offset}`)
    setTotal(total || 0)
    return storylines || []
  }

  useEffect(() => {
    let alive = true
    setStories(null)
    setError(false)
    load(0)
      .then((items) => { if (alive) setStories(items) })
      .catch(() => { if (alive) { setStories([]); setError(true) } })
    return () => { alive = false }
  }, [i18n.language])

  const loadMore = async () => {
    if (loadingMore || !stories) return
    setLoadingMore(true)
    try {
      const more = await load(stories.length)
      setStories((prev) => [...(prev || []), ...more])
    } catch {
      /* 더 보기 실패는 조용히 — 다시 누르면 재시도 */
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = stories && stories.length < total

  return (
    <>
      <Helmet>
        <title>{t('storyline.allTitle')} · Pesona</title>
      </Helmet>
      <div className="min-h-dvh bg-black text-white relative">
        {/* 헤더 */}
        <div
          className="sticky top-0 z-30 flex items-center gap-2 px-3 bg-black/80 backdrop-blur-sm border-b border-gray-800"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('scenario.back')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-sm font-bold flex-1 truncate">{t('storyline.allTitle')}</h1>
          {total > 0 && <span className="text-[11px] text-gray-500">{t('storyline.count', { count: total })}</span>}
        </div>

        <div className="px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          {stories === null ? (
            <p className="text-center text-gray-500 py-16 text-sm">{t('storyline.loading')}</p>
          ) : stories.length === 0 ? (
            <p className="text-center text-gray-500 py-16 text-sm">{error ? t('storyline.loadFailed') : t('storyline.empty')}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {stories.map((s) => <StoryGridCard key={s.id} story={s} />)}
              </div>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 w-full py-3 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-200 active:bg-gray-800 disabled:opacity-50"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {loadingMore ? t('storyline.loading') : t('common.seeMore')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
