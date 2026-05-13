// 비디오에서 첫 프레임을 jpeg Blob으로 추출. 입력은 File/Blob 또는 URL 문자열.
// URL인 경우 crossOrigin='anonymous'로 로드 — Supabase Storage 등 CORS 허용 origin에서만 동작.
// 실패 시 null 반환 — 호출자는 fallback 처리.
export async function extractVideoPoster(source) {
  return new Promise((resolve) => {
    let settled = false
    let objectUrl = null
    const finish = (blob) => {
      if (settled) return
      settled = true
      if (objectUrl) try { URL.revokeObjectURL(objectUrl) } catch (_) {}
      resolve(blob)
    }
    const isUrl = typeof source === 'string'
    if (!isUrl) {
      try { objectUrl = URL.createObjectURL(source) } catch (_) { return resolve(null) }
    }
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    if (isUrl) video.crossOrigin = 'anonymous'
    const captureFrame = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return finish(null)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.85)
      } catch (_) {
        // tainted canvas (CORS 거부) 등 — null로 신호
        finish(null)
      }
    }
    video.addEventListener('loadeddata', () => {
      const target = Math.min(0.1, Math.max(0, (video.duration || 1) - 0.01))
      try { video.currentTime = target }
      catch (_) { captureFrame() }
    })
    video.addEventListener('seeked', captureFrame, { once: true })
    video.addEventListener('error', () => finish(null))
    setTimeout(() => finish(null), 8000)
    video.src = isUrl ? source : objectUrl
  })
}
