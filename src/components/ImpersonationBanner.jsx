import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

const ADMIN_BACKUP_KEY = 'adminBackupSession'

export default function ImpersonationBanner() {
  const [hasBackup, setHasBackup] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { setToken, setUser } = useStore()

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
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] w-full max-w-[480px] pointer-events-none"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex justify-end pr-2 pt-2">
        <button
          type="button"
          onClick={restore}
          className="pointer-events-auto px-2 py-1 rounded bg-black/70 text-white text-[11px] font-medium hover:bg-black shadow-lg"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          어드민으로 복귀
        </button>
      </div>
    </div>
  )
}
