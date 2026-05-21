import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

export default function Notifications() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    api
      .get('/notifications')
      .then(({ notifications }) => setNotifications(notifications))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hasUnread = notifications.some((n) => !n.isRead)

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return t('notifications.justNow')
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString()
  }

  const handleToggle = async (n) => {
    const isExpanding = expandedId !== n.id
    setExpandedId(isExpanding ? n.id : null)
    if (isExpanding && !n.isRead) {
      try {
        await api.post(`/notifications/${n.id}/read`, {})
      } catch {}
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
      )
    }
  }

  const handleNavigate = (e, n) => {
    e.stopPropagation()
    if (n.linkPath) navigate(n.linkPath)
  }

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all', {})
      setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })))
    } catch {}
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Helmet>
        <title>{t('notifications.title')}</title>
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
          <h1 className="text-xl font-bold">{t('notifications.title')}</h1>
        </div>
        {hasUnread && (
          <button
            onClick={handleReadAll}
            className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-20">...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center text-gray-500 py-20">{t('notifications.empty')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => {
            const isExpanded = expandedId === n.id
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleToggle(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleToggle(n)
                  }
                }}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  n.isRead
                    ? 'bg-gray-900 border-gray-800'
                    : 'bg-indigo-600/10 border-indigo-500/30'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-start gap-3">
                  {n.imageUrl && !isExpanded && (
                    <img
                      src={n.imageUrl}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!n.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      )}
                      <p
                        className={`font-semibold text-sm ${
                          isExpanded ? '' : 'truncate'
                        } ${n.isRead ? 'text-gray-200' : 'text-white'}`}
                      >
                        {n.title}
                      </p>
                    </div>
                    {isExpanded && n.imageUrl && (
                      <img
                        src={n.imageUrl}
                        alt=""
                        className="w-full max-h-64 rounded-lg object-cover my-2"
                      />
                    )}
                    <p
                      className={`text-xs text-gray-300 whitespace-pre-line ${
                        isExpanded ? '' : 'line-clamp-3 text-gray-400'
                      }`}
                    >
                      {n.body}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-2">{formatDate(n.createdAt)}</p>
                    {isExpanded && n.linkPath && (
                      <button
                        onClick={(e) => handleNavigate(e, n)}
                        className="mt-3 w-full py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {t('notifications.goToPage')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
