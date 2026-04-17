import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function MessageNotification() {
  const { t } = useTranslation()
  const { token } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [toast, setToast] = useState(null)
  const prevUnreadRef = useRef(new Set())
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
    if (!token) return

    const poll = async () => {
      try {
        const { unread } = await api.get('/conversations/unread')
        const currentUnreadIds = new Set(unread.map((u) => u.conversationId))

        // 현재 보고 있는 채팅방은 제외
        const currentChatId = location.pathname.match(/^\/chats\/(\d+)/)?.[1]

        const now = Date.now()
        // 15초 지난 항목 정리
        for (const [cid, at] of recentlyExitedRef.current) {
          if (now - at > 15000) recentlyExitedRef.current.delete(cid)
        }

        // 새로 추가된 unread만 알림 (이전에 없었던 것)
        const suppressedIds = new Set()
        for (const item of unread) {
          if (currentChatId && String(item.conversationId) === currentChatId) continue
          // 최근 나간 채팅방은 토스트 무시 (but prevUnreadRef에 추가 안 함)
          if (recentlyExitedRef.current.has(item.conversationId)) {
            suppressedIds.add(item.conversationId)
            continue
          }
          if (!prevUnreadRef.current.has(item.conversationId)) {
            break
          }
        }

        // 억제된 항목은 prevUnreadRef에서 제외 (15초 후 토스트 표시 가능하도록)
        for (const id of suppressedIds) {
          currentUnreadIds.delete(id)
        }
        prevUnreadRef.current = currentUnreadIds

        // ChatList 등 다른 컴포넌트에 갱신 알림
        window.dispatchEvent(new CustomEvent('conversations-updated'))
        // 탭바 unread 뱃지용 (현재 보고 있는 채팅방 + 억제된 항목 제외)
        const visibleUnreadCount = unread.filter((u) => {
          if (currentChatId && String(u.conversationId) === currentChatId) return false
          if (suppressedIds.has(u.conversationId)) return false
          return true
        }).length
        window.dispatchEvent(new CustomEvent('unread-count', { detail: visibleUnreadCount }))
      } catch {
        // 에러 무시
      }
    }

    poll()
    const interval = setInterval(poll, 10000) // 10초마다 폴링

    return () => {
      clearInterval(interval)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [token, location.pathname])

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
