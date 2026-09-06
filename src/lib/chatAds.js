/**
 * 무료 요금제 채팅 전면 광고.
 *
 * 채팅 전송을 누적해 CHAT_TURNS_PER_AD 번째 **전송 시점**에 전면 광고를 띄운다.
 * 전송 직후에 띄우는 이유는 그 시간이 어차피 대기 시간이기 때문이다 —
 * 광고가 떠 있는 동안 LLM 응답과 음성이 만들어지고, 광고를 닫으면 결과가 준비돼 있다.
 * (응답이 끝난 뒤에 띄우면 대화 몰입을 끊는 순수 손실이 된다.)
 *
 * 1:1(V1/V2)·단톡방이 같은 카운터를 쓴다 — 유저 입장에선 전부 "채팅 한 번"이다.
 * 카운터는 localStorage 에 둔다. 방을 옮기거나 앱을 재시작해도 이어져야
 * 방을 갈아타는 것만으로 광고를 피할 수 없다.
 */
import useStore from '../store/useStore'
import { isInterstitialConfigured, prepareInterstitialAd, showInterstitialAd } from './admob'

// 기본 10턴. VITE_CHAT_AD_EVERY 로 덮어쓸 수 있다 (에뮬레이터 테스트·노출 빈도 튜닝용).
export const CHAT_TURNS_PER_AD =
  parseInt(import.meta.env.VITE_CHAT_AD_EVERY, 10) > 0
    ? parseInt(import.meta.env.VITE_CHAT_AD_EVERY, 10)
    : 10

const COUNT_KEY = 'chatAdTurnCount'
const PENDING_KEY = 'chatAdPending'
// 광고를 띄울 차례인데 못 띄운 경우(로드 실패·no-fill)를 기억해 다음 전송에 재시도한다.

function readInt(key) {
  try {
    return parseInt(localStorage.getItem(key) || '0', 10) || 0
  } catch {
    return 0
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // 사파리 프라이빗 등 — 광고 카운터는 없어도 되는 정보라 무시한다.
  }
}

function isFreeTier() {
  const { subscription } = useStore.getState()
  return (subscription?.tier || 'FREE') === 'FREE'
}

/**
 * 광고 대상인지. 무료 유저 + 안드로이드 네이티브 + 광고 ID 설정됨.
 */
export function isChatAdEnabled() {
  return isInterstitialConfigured() && isFreeTier()
}

/**
 * 광고가 떠 있는 동안 이미 재생 중이던 <audio> 를 멈췄다가, 닫힌 뒤 되돌린다.
 * DOM 에 심어둔 오디오(단톡방의 음성 재생 컨트롤)용 — 1:1 채팅처럼 `new Audio()` 로
 * 만든 재생기는 DOM 에 없으므로 각 페이지가 자기 ref 로 직접 처리한다.
 * 스프라이트 영상은 음소거 루프라 대상에서 제외한다.
 */
export function holdPlayingAudioDuring(adClosed) {
  const playing = Array.from(document.querySelectorAll('audio')).filter((el) => !el.paused && !el.ended)
  if (playing.length === 0) return
  playing.forEach((el) => el.pause())
  adClosed.finally(() => {
    playing.forEach((el) => { el.play().catch(() => {}) })
  })
}

/**
 * 채팅 메시지를 전송할 때 호출한다. 광고 차례면 즉시 전면 광고를 띄운다.
 *
 * 호출자는 반환값이 있으면 그 프로미스가 resolve 될 때까지
 * 음성 재생처럼 "유저가 보고 있어야 의미 있는" 동작을 미뤄야 한다.
 * 응답 생성 자체는 광고와 무관하게 계속 진행시킨다 — 그게 이 배치의 목적이다.
 *
 * @returns {Promise<boolean>|null} 광고를 띄웠으면 닫힐 때 resolve 되는 프로미스, 아니면 null
 */
export function noteChatSend() {
  if (!isChatAdEnabled()) return null

  // 마스크가 없으면 이 전송은 서버에서 거절된다 — 실패할 턴에 광고를 태우지 않는다.
  const { masks } = useStore.getState()
  if (typeof masks === 'number' && masks < 1) return null

  const count = readInt(COUNT_KEY) + 1
  write(COUNT_KEY, count)

  const due = count % CHAT_TURNS_PER_AD === 0 || readInt(PENDING_KEY) === 1

  if (!due) {
    // 다음 전송이 광고 차례면 지금 미리 받아둔다. 전송 시점에 로드를 시작하면
    // 광고가 뜨기까지 몇 초가 비어 오히려 대기만 길어진다.
    if (count % CHAT_TURNS_PER_AD === CHAT_TURNS_PER_AD - 1) prepareInterstitialAd()
    return null
  }

  const shown = showInterstitialAd().then((ok) => {
    // 못 띄웠으면(로드 실패·no-fill) 다음 전송에서 다시 시도한다.
    write(PENDING_KEY, ok ? 0 : 1)
    return ok
  })
  return shown
}
