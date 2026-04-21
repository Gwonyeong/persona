import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'

export default function FeedbackList() {
  const { t } = useTranslation()
  const { token } = useStore()
  const navigate = useNavigate()
  const [feedbacks, setFeedbacks] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sort, setSort] = useState('latest')
  const [loading, setLoading] = useState(true)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/feedbacks?page=${page}&sort=${sort}`).then((data) => {
      setFeedbacks(data.feedbacks)
      setTotalPages(data.totalPages)
      setLoading(false)
    })
  }, [page, sort])

  const handleWrite = () => {
    if (!token) {
      setShowLoginModal(true)
      return
    }
    navigate('/feedback/write')
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString()
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Helmet>
        <title>{t('feedback.metaTitle')}</title>
      </Helmet>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center text-gray-400"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">{t('feedback.title')}</h1>
        </div>
        <button
          onClick={handleWrite}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('feedback.write')}
        </button>
      </div>

      {/* 안내 문구 */}
      <div className="mb-4 px-3 py-2.5 bg-indigo-600/10 border border-indigo-500/20 rounded-xl">
        <p className="text-xs text-indigo-300 text-center">{t('feedback.notice')}</p>
      </div>

      {/* 정렬 */}
      <div className="flex gap-2 mb-4">
        {['latest', 'popular'].map((s) => (
          <button
            key={s}
            onClick={() => { setSort(s); setPage(1) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              sort === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t(`feedback.sort${s.charAt(0).toUpperCase() + s.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="text-center text-gray-500 py-20">...</div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center text-gray-500 py-20 whitespace-pre-line">
          {t('feedback.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {feedbacks.map((f) => (
            <button
              key={f.id}
              onClick={() => navigate(`/feedback/${f.id}`)}
              className="text-left p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500">{t('feedback.userLabel', { id: f.userId })}</span>
                <span className="text-xs text-gray-600">{formatDate(f.createdAt)}</span>
              </div>
              <p className="font-semibold text-sm text-gray-100 mb-1 line-clamp-1">{f.title}</p>
              <p className="text-xs text-gray-400 line-clamp-2">{f.content}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  {f.likeCount}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {f.commentCount}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                page === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </div>
  )
}
