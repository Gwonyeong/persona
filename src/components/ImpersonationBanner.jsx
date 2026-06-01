import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

const ADMIN_BACKUP_KEY = 'adminBackupSession'

export default function ImpersonationBanner() {
  const [hasBackup, setHasBackup] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { setToken, setUser, user } = useStore()

  useEffect(() => {
    const check = () => setHasBackup(!!sessionStorage.getItem(ADMIN_BACKUP_KEY))
    check()
    window.addEventListener('storage', check)
    window.addEventListener('admin-backup-changed', check)
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('admin-backup-changed', check)
    }
  }, [])

  if (!hasBackup) return null
  if (location.pathname.startsWith('/admin')) return null

  const restore = () => {
    try {
      const raw = sessionStorage.getItem(ADMIN_BACKUP_KEY)
      if (!raw) return
      const { token: adminToken, user: adminUser } = JSON.parse(raw)
      if (!adminToken) return
      setToken(adminToken)
      if (adminUser) setUser(adminUser)
      sessionStorage.removeItem(ADMIN_BACKUP_KEY)
      window.dispatchEvent(new Event('admin-backup-changed'))
      navigate('/admin/users')
    } catch (e) {
      console.error('Restore admin session failed:', e)
    }
  }

  return (
    <div
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] w-full max-w-[480px]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-500/95 text-black text-xs px-3 py-2 shadow-lg">
        <span className="truncate">
          테스트 계정({user?.name || user?.email || '...'})으로 둘러보는 중
        </span>
        <button
          type="button"
          onClick={restore}
          className="shrink-0 px-2 py-1 rounded bg-black/80 text-white text-[11px] font-medium hover:bg-black"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          어드민으로 복귀
        </button>
      </div>
    </div>
  )
}
