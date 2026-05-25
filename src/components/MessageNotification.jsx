import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function MessageNotification() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [toast, setToast] = useState(null)
  const recentlyExitedRef = useRef(new Map()) // conversationId → exitTimestamp
  const timerRef = useRef(null)

  // 최근 나간 채팅방 추적
  useEffect(() => {
    const handler = (e) => {
      recentlyExitedRef.current.set(e.detail.conversationId, e.detail.at)
    }
    window.addEventListener('chat-exited', handler)
    return () => window.removeEventListener('chat-exited', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!toast) return null

  const thumbUrl = getImageUrl(toast.characterImage)

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down"
      style={{ animation: 'slideDown 0.3s ease-out' }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -100%); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <button
        onClick={() => {
          setToast(null)
          if (timerRef.current) clearTimeout(timerRef.current)
          navigate(`/chats/${toast.conversationId}`)
        }}
        className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 shadow-lg shadow-black/30 hover:bg-gray-700 transition-colors max-w-[90vw]"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">?</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{toast.characterName}</p>
          <p className="text-xs text-gray-400">{t('notification.newMessage')}</p>
        </div>
      </button>
    </div>
  )
}
