// 통화 시작 전에 마이크 권한을 확보한다.
// 동작:
// 1) navigator.mediaDevices.getUserMedia 미지원이면 즉시 UNSUPPORTED 에러
// 2) Permissions API로 'granted'면 즉시 통과 (다이얼로그 안 띄움)
// 3) 그 외에는 getUserMedia({audio:true}) 호출로 OS/브라우저 권한 다이얼로그를 트리거하고
//    얻은 스트림은 즉시 stop()으로 해제 (실제 통화 시작 시 useCall이 다시 획득)
//
// Capacitor Android WebView는 MicPermissionWebChromeClient를 통해 onPermissionRequest를 받아
// ActivityCompat.requestPermissions로 시스템 다이얼로그를 띄운다.
// 호출은 사용자 탭 핸들러 안에서 해야 user activation이 살아있어서 다이얼로그가 안전하게 뜬다.
export async function ensureMicPermission() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('UNSUPPORTED')
    err.code = 'UNSUPPORTED'
    throw err
  }

  // 빠른 경로: 이미 granted면 다이얼로그 없이 통과
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' })
      if (status.state === 'granted') return
      // 'denied'여도 (Don't ask again 케이스) 일단 getUserMedia를 시도하면
      // 브라우저/WebView에 따라 다시 묻거나 즉시 NotAllowedError를 던진다.
      // → catch에서 PERMISSION_DENIED로 통일 처리.
    } catch {
      // 일부 WebView는 'microphone' name을 미지원 → fall through
    }
  }

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    const e = new Error('PERMISSION_DENIED')
    e.code = 'PERMISSION_DENIED'
    e.cause = err
    throw e
  }

  // 권한만 확보하고 트랙은 즉시 해제 — useCall.connect()가 통화 본 세션용 스트림을 새로 잡는다
  try {
    stream.getTracks().forEach((t) => t.stop())
  } catch {}
}
