import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'

export default function InquiryList() {
  const { t } = useTranslation()
  const { token } = useStore()
  const navigate = useNavigate()
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    api.get('/inquiries').then((data) => {
      setInquiries(data.inquiries)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [token])

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString()
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Helmet>
        <title>{t('inquiry.metaTitle')}</title>
      </Helmet>

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
          <h1 className="text-xl font-bold">{t('inquiry.title')}</h1>
        </div>
        <button
          onClick={() => {
            if (!token) { goToLogin(navigate); return }
            navigate('/inquiry/write')
          }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('inquiry.write')}
        </button>
      </div>

      {!token ? (
        <div className="text-center py-20">
          <p className="text-gray-300 font-semibold mb-2">{t('inquiry.loginRequired')}</p>
          <button
            onClick={() => goToLogin(navigate)}
            className="mt-4 px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.login')}
          </button>
        </div>
      ) : loading ? (
        <div className="text-center text-gray-500 py-20">...</div>
      ) : inquiries.length === 0 ? (
        <div className="text-center text-gray-500 py-20 whitespace-pre-line">
          {t('inquiry.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {inquiries.map((q) => (
            <button
              key={q.id}
              onClick={() => navigate(`/inquiry/${q.id}`)}
              className="text-left p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    q.status === 'ANSWERED'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {q.status === 'ANSWERED' ? t('inquiry.statusAnswered') : t('inquiry.statusPending')}
                </span>
                <span className="text-xs text-gray-600">{formatDate(q.createdAt)}</span>
              </div>
              <p className="font-semibold text-sm text-gray-100 line-clamp-1">{q.title}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
