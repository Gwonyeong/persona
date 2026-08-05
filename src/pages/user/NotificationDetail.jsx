import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

// 알림 상세 — 제목/본문/이미지 출력. 경로: /notifications/:id
export default function NotificationDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [notification, setNotification] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get(`/notifications/${id}`)
      .then(async ({ notification }) => {
        if (cancelled) return
        setNotification(notification)
        // 상세를 열면 읽음 처리 (목록에서 이미 처리됐어도 idempotent). 직접 진입(딥링크) 대비.
        if (!notification.isRead) {
          try {
            await api.post(`/notifications/${id}/read`, {})
          } catch {}
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString()
  }

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/notifications', { replace: true })
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <Helmet>
        <title>{notification?.title || t('notifications.title')}</title>
      </Helmet>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={goBack}
          className="w-8 h-8 flex items-center justify-center text-gray-400"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">{t('notifications.title')}</h1>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-20">...</div>
      ) : error || !notification ? (
        <div className="text-center text-gray-500 py-20">{t('notifications.detailNotFound', { defaultValue: '알림을 불러오지 못했어요' })}</div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-white leading-snug">{notification.title}</h2>
          <p className="text-xs text-gray-500 mt-2">{formatDate(notification.createdAt)}</p>

          {notification.imageUrl && (
            <img
              src={notification.imageUrl}
              alt=""
              className="w-full rounded-xl object-cover mt-4"
            />
          )}

          <p className="text-sm text-gray-200 whitespace-pre-line leading-relaxed mt-4">
            {notification.body}
          </p>

          {notification.linkPath && (
            <button
              onClick={() => navigate(notification.linkPath)}
              className="mt-6 w-full py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('notifications.goToPage')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
