import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

export default function InquiryDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [inquiry, setInquiry] = useState(null)

  useEffect(() => {
    api.get(`/inquiries/${id}`).then((data) => setInquiry(data.inquiry)).catch(() => {})
  }, [id])

  const handleDelete = async () => {
    if (!confirm(t('inquiry.deleteConfirm'))) return
    await api.delete(`/inquiries/${id}`)
    navigate('/inquiry', { replace: true })
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (!inquiry) {
    return <div className="text-center text-gray-500 py-20">...</div>
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Helmet>
        <title>{inquiry.title} - Pesona</title>
      </Helmet>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => navigate('/inquiry')}
          className="w-8 h-8 flex items-center justify-center text-gray-400"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold flex-1 truncate">{t('inquiry.title')}</h1>
        {inquiry.status === 'PENDING' && (
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 px-2 py-1"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
            </svg>
          </button>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              inquiry.status === 'ANSWERED'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            {inquiry.status === 'ANSWERED' ? t('inquiry.statusAnswered') : t('inquiry.statusPending')}
          </span>
          <span className="text-xs text-gray-600">{formatDate(inquiry.createdAt)}</span>
        </div>
        <h2 className="text-base font-bold text-gray-100 mb-3">{inquiry.title}</h2>
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{inquiry.content}</p>
      </div>

      {inquiry.reply ? (
        <>
          <div className="bg-indigo-600/5 rounded-xl border border-indigo-500/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-indigo-300">{t('inquiry.replyLabel')}</span>
              {inquiry.repliedAt && (
                <span className="text-xs text-gray-600">{formatDate(inquiry.repliedAt)}</span>
              )}
            </div>
            <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{inquiry.reply}</p>
          </div>
          {inquiry.grantedMasks > 0 && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-sm text-amber-200 leading-snug">
                {t('inquiry.maskGrantThanks', { count: inquiry.grantedMasks })}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 text-center">
          <p className="text-sm text-gray-500">{t('inquiry.waitingReply')}</p>
        </div>
      )}
    </div>
  )
}
