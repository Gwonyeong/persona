import { useEffect, useState } from 'react'

// 데이터 절약 모드 감지
// - CSS: prefers-reduced-data (Chromium 계열 일부)
// - Network Information API: navigator.connection.saveData (Android Chrome 등)
// 둘 중 하나라도 true면 데이터 절약 모드로 간주
export default function usePrefersReducedData() {
  const [reduced, setReduced] = useState(() => detect())

  useEffect(() => {
    const mql = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-data: reduce)')
      : null
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection

    const update = () => setReduced(detect())

    mql?.addEventListener?.('change', update)
    conn?.addEventListener?.('change', update)

    return () => {
      mql?.removeEventListener?.('change', update)
      conn?.removeEventListener?.('change', update)
    }
  }, [])

  return reduced
}

function detect() {
  if (typeof window === 'undefined') return false
  const mql = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-data: reduce)')
    : null
  if (mql?.matches) return true
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (conn?.saveData) return true
  return false
}
