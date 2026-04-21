import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'

export default function FeedbackDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { token, user } = useStore()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    api.get(`/feedbacks/${id}`).then((data) => setFeedback(data.feedback))
  }, [id])

  const handleLike = async () => {
    if (!token) { setShowLoginModal(true); return }
    const data = await api.post(`/feedbacks/${id}/like`)
    setFeedback((prev) => ({ ...prev, liked: data.liked, likeCount: data.likeCount }))
  }

  const handleComment = async () => {
    if (!token) { setShowLoginModal(true); return }
    if (!comment.trim() || submitting) return
    setSubmitting(true)
    const data = await api.post(`/feedbacks/${id}/comments`, { content: comment.trim() })
    setFeedback((prev) => ({ ...prev, comments: [...prev.comments, data.comment] }))
    setComment('')
    setSubmitting(false)
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm(t('feedback.deleteConfirm'))) return
    await api.delete(`/feedbacks/${id}/comments/${commentId}`)
    setFeedback((prev) => ({
      ...prev,
      comments: prev.comments.filter((c) => c.id !== commentId),
    }))
  }

  const handleDeleteFeedback = async () => {
    if (!confirm(t('feedback.deleteConfirm'))) return
    await api.delete(`/feedbacks/${id}`)
    navigate('/feedback', { replace: true })
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (!feedback) {
    return <div className="text-center text-gray-500 py-20">...</div>
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Helmet>
        <title>{feedback.title} - Pesona</title>
      </Helmet>

      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => navigate('/feedback')}
          className="w-8 h-8 flex items-center justify-center text-gray-400"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold flex-1 truncate">{t('feedback.title')}</h1>
        {user?.id === feedback.userId && (
          <button
            onClick={handleDeleteFeedback}
            className="text-xs text-red-400 px-2 py-1"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
            </svg>
          </button>
        )}
      </div>

      {/* 본문 */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">{t('feedback.userLabel', { id: feedback.userId })}</span>
          <span className="text-xs text-gray-600">{formatDate(feedback.createdAt)}</span>
        </div>
        <h2 className="text-base font-bold text-gray-100 mb-3">{feedback.title}</h2>
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{feedback.content}</p>

        {/* 따봉 버튼 */}
        <div className="mt-4 pt-3 border-t border-gray-800">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              feedback.liked
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/50'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={feedback.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
            {t('feedback.like')} {feedback.likeCount > 0 && feedback.likeCount}
          </button>
        </div>
      </div>

      {/* 댓글 */}
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-200 mb-3">
          {t('feedback.comments')} {feedback.comments.length > 0 && `(${feedback.comments.length})`}
        </h3>
        {feedback.comments.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-6">-</p>
        ) : (
          <div className="flex flex-col gap-2">
            {feedback.comments.map((c) => (
              <div key={c.id} className="p-3 bg-gray-900 rounded-xl border border-gray-800">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{t('feedback.userLabel', { id: c.userId })}</span>
                    <span className="text-xs text-gray-600">{formatDate(c.createdAt)}</span>
                  </div>
                  {user?.id === c.userId && (
                    <button
                      onClick={() => handleDeleteComment(c.id)}
                      className="text-xs text-gray-600 hover:text-red-400"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-300">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 댓글 입력 */}
      <div className="flex gap-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('feedback.commentPlaceholder')}
          maxLength={500}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
        />
        <button
          onClick={handleComment}
          disabled={!comment.trim() || submitting}
          className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 disabled:opacity-40 transition-colors flex-shrink-0"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('feedback.commentSubmit')}
        </button>
      </div>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </div>
  )
}
