import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

export default function FeedbackWrite() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!title.trim()) { setError(t('feedback.titleRequired')); return }
    if (!content.trim()) { setError(t('feedback.contentRequired')); return }
    if (submitting) return

    setSubmitting(true)
    setError('')
    try {
      const data = await api.post('/feedbacks', { title: title.trim(), content: content.trim() })
      navigate(`/feedback/${data.feedback.id}`, { replace: true })
    } catch (err) {
      setError(err.message || 'Error')
      setSubmitting(false)
    }
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Helmet>
        <title>{t('feedback.writeTitle')} - Pesona</title>
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
          <h1 className="text-xl font-bold">{t('feedback.writeTitle')}</h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('feedback.submit')}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}

      {/* 제목 */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('feedback.titlePlaceholder')}
        maxLength={100}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none mb-3"
      />

      {/* 본문 */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('feedback.contentPlaceholder')}
        maxLength={2000}
        rows={12}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
      />
      <p className="text-xs text-gray-600 text-right mt-1">{content.length}/2000</p>
    </div>
  )
}
