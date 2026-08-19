import { useEffect, useRef } from 'react'
import { api } from './api'

// 대화 읽음 동기화.
//
// 목적은 "채팅방에 머무는 동안 unread 뱃지가 잘못 뜨지 않게 하는 것"인데, 실제로 읽음
// 상태가 바뀌는 순간은 캐릭터 응답과 후속 메시지가 도착하는 전송 직후 구간뿐이다.
// 그래서 상시 heartbeat 대신 전송 시점을 기준으로 짧게 훑는다.
//
// 왜 바꿨나 (2026-08-19 usage 계측):
//   POST /conversations/:id/read 가 전체 invocations의 29.3%로 단일 최대 항목이었다.
//   - V1: 전송 후 60초 동안 5초 고정 간격 = 전송당 12회
//   - V2: 채팅방에 있는 내내 5초마다 무조건 = 10분 체류 시 120회
//   응답은 대개 3~10초 안에 오므로 앞을 촘촘히, 뒤를 성기게 잡으면 5회로 충분하다.
//
// 진입 1회 + 전송당 5회 + 퇴장 1회(keepalive)로 정리된다.
const BURST_DELAYS_MS = [3000, 8000, 18000, 35000, 60000]

export function useReadSync(conversationId) {
  const timersRef = useRef([])

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }

  useEffect(() => {
    if (!conversationId) return
    // 진입 시 즉시 1회
    api.post(`/conversations/${conversationId}/read`).catch(() => {})

    return () => {
      clearTimers()
      // 퇴장 시 keepalive fetch로 확실하게 읽음 처리 (탭 종료에도 전송 보장)
      api.post(`/conversations/${conversationId}/read`, {}, { keepalive: true }).catch(() => {})
      window.dispatchEvent(
        new CustomEvent('chat-exited', {
          detail: { conversationId: parseInt(conversationId), at: Date.now() },
        }),
      )
    }
  }, [conversationId])

  /** 메시지 전송 직후 호출 — 응답이 도착하는 구간만 좁게 훑는다. 연속 전송 시 이전 예약은 취소. */
  const pingBurst = () => {
    if (!conversationId) return
    clearTimers()
    timersRef.current = BURST_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        api.post(`/conversations/${conversationId}/read`).catch(() => {})
      }, delay),
    )
  }

  return { pingBurst }
}
