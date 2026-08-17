import { api } from './api'
import useStore from '../store/useStore'
import { isNativeBillingAvailable, initBilling, getPendingPurchases, consumePurchase } from './billing'

// ============================================================================
// 결제 지급 누락 복구
// ----------------------------------------------------------------------------
// 구글 결제는 성공했는데 /verify-purchase 가 서버에 닿지 못하면 마스크가 지급되지
// 않는다. 결제는 구글 인프라와 직접 이루어지므로 통신이 끊겨도 돈은 빠져나간다.
//
// 복구 소스는 두 가지다.
//  1) getPendingPurchases() — 아직 consume 하지 않은 구글 측 미소비 구매
//  2) localStorage 큐 — 검증에 실패한 purchaseToken 을 직접 적어둔 것
//
// (1)만으로 충분해 보이지만, consume 이 먼저 일어나면 구글 목록에서 사라지므로
// 큐를 함께 둔다. 반대로 앱 재설치 등으로 localStorage 가 날아가면 (1)이 받쳐준다.
//
// !! 중요 !!
// 검증 실패 시 절대로 consume 하지 않는다. consume 된 토큰은 (1)에 다시 잡히지
// 않아 복구 수단이 영구히 사라진다. 서버가 4xx 로 "이 구매는 무효"라고 명시적으로
// 판정한 경우에만 정리한다. 네트워크 실패·5xx 는 나중에 다시 시도한다.
// ============================================================================

const QUEUE_KEY = 'pesona.pendingPurchases'
const QUEUE_MAX = 20

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((e) => e?.productId && e?.purchaseToken) : []
  } catch {
    return []
  }
}

function writeQueue(entries) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-QUEUE_MAX)))
  } catch {}
}

// 검증에 실패한 구매를 큐에 적어둔다 — 다음 앱 실행 때 다시 시도한다.
export function queueFailedPurchase(productId, purchaseToken) {
  if (!productId || !purchaseToken) return
  const queue = readQueue()
  if (queue.some((e) => e.purchaseToken === purchaseToken)) return
  queue.push({ productId, purchaseToken, queuedAt: Date.now() })
  writeQueue(queue)
}

function dequeue(purchaseToken) {
  writeQueue(readQueue().filter((e) => e.purchaseToken !== purchaseToken))
}

// 서버가 "이 구매는 무효"라고 확정한 경우에만 true.
// 네트워크 실패(status 없음)와 5xx 는 일시적 장애로 보고 토큰을 보존한다.
function isDefinitiveRejection(err) {
  const status = err?.status
  return typeof status === 'number' && status >= 400 && status < 500
}

let running = null

// 미지급 구매 복구. 앱 시작 시점과 결제 화면 진입 시점에 호출한다.
export async function recoverPendingPurchases() {
  if (running) return running

  running = (async () => {
    if (!isNativeBillingAvailable()) return { skipped: true }
    if (!useStore.getState().token) return { skipped: true }

    const ready = await initBilling()
    if (!ready) return { skipped: true }

    // 두 소스를 purchaseToken 기준으로 합친다.
    const candidates = new Map()
    for (const entry of readQueue()) {
      candidates.set(entry.purchaseToken, entry.productId)
    }
    for (const purchase of await getPendingPurchases()) {
      const productId = purchase.productIdentifier || purchase.productId
      const purchaseToken = purchase.purchaseToken
      if (productId && purchaseToken) candidates.set(purchaseToken, productId)
    }
    if (candidates.size === 0) return { recovered: 0, retained: 0 }

    let recovered = 0
    let retained = 0

    for (const [purchaseToken, productId] of candidates) {
      try {
        const result = await api.post('/masks/verify-purchase', { productId, purchaseToken })
        useStore.getState().setMasks(result.masks)
        dequeue(purchaseToken)
        await consumePurchase(purchaseToken)
        // 이미 처리된 건은 지급이 아니라 정리다 — 복구 건수에 세지 않는다.
        if (!result.alreadyProcessed) recovered++
      } catch (err) {
        if (isDefinitiveRejection(err)) {
          // 서버가 무효로 판정 — 토큰을 정리해 목록이 무한히 쌓이지 않게 한다.
          dequeue(purchaseToken)
          try {
            await api.post('/masks/consume-purchase', { productId, purchaseToken })
          } catch {}
          await consumePurchase(purchaseToken)
        } else {
          // 통신 실패 — 토큰을 반드시 살려둔다. 여기서 consume 하면 복구 불가가 된다.
          queueFailedPurchase(productId, purchaseToken)
          retained++
        }
      }
    }

    if (recovered > 0) {
      console.log(`[purchaseRecovery] 미지급 구매 ${recovered}건 복구 완료`)
    }
    return { recovered, retained }
  })()

  try {
    return await running
  } finally {
    running = null
  }
}
