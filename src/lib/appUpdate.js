import { Capacitor } from '@capacitor/core'

// Google Play In-App Updates를 IMMEDIATE 모드로 트리거.
// 새 버전이 Play Store에 있으면 풀스크린 업데이트 UI가 뜨고, 유저가 진행하면 앱이 재시작되며 함수는 반환되지 않는다.
// 유저가 취소했거나 업데이트 자체가 불가(non-Play 설치, 네트워크 오류 등)하면 throw 'UPDATE_REQUIRED' 또는 silent 통과.
//
// 동작:
// - 네이티브 아닌 경우(웹/PWA): 그냥 통과
// - getAppUpdateInfo로 updateAvailability 확인
//   - UPDATE_AVAILABLE(2): performImmediateUpdate 호출 → 성공 시 재시작(미반환) / 실패·취소 시 'UPDATE_REQUIRED' throw
//   - 그 외 상태(NOT_AVAILABLE, UNKNOWN, IN_PROGRESS): 통과
// - 플러그인 자체 호출이 실패하면(예: Play Store 외 설치) silent 통과 — 기존 유저를 차단하지 않기 위함
export async function ensureAppUpToDate() {
  if (!Capacitor.isNativePlatform()) return

  let AppUpdate
  try {
    const mod = await import('@capawesome/capacitor-app-update')
    AppUpdate = mod.AppUpdate
  } catch (e) {
    console.warn('[AppUpdate] plugin import failed:', e)
    return
  }

  let info
  try {
    info = await AppUpdate.getAppUpdateInfo()
  } catch (e) {
    // non-Play 설치, 네트워크 이슈 등 → 차단하지 않음
    console.warn('[AppUpdate] getAppUpdateInfo failed:', e)
    return
  }

  // 2 = UPDATE_AVAILABLE
  if (info?.updateAvailability !== 2) return
  if (!info?.immediateUpdateAllowed) return // IMMEDIATE 미지원이면 통과

  try {
    await AppUpdate.performImmediateUpdate()
    // 성공 시 앱 재시작 → 여기까지 도달하지 않음.
    // 도달한다면 즉시 업데이트가 어떤 이유로 끝났지만 진행되지 않은 상태이므로 보수적으로 차단.
    const err = new Error('UPDATE_REQUIRED')
    err.code = 'UPDATE_REQUIRED'
    throw err
  } catch (e) {
    if (e?.code === 'UPDATE_REQUIRED') throw e
    // 유저 취소 / 시스템 거부 등 → 통화 진입 차단
    const err = new Error('UPDATE_REQUIRED')
    err.code = 'UPDATE_REQUIRED'
    err.cause = e
    throw err
  }
}
