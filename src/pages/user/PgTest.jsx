import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import MaskIcon from '../../components/MaskIcon'
import {
  isNativeApp,
  isPortOneConfigured,
  loadPortOne,
  createMerchantUid,
  PORTONE_CHANNEL_KEY,
  PORTONE_IMP_CODE,
} from '../../lib/webPayment'

// PG 입점 심사(검수요청서)용 웹 전용 테스트 결제 페이지.
//
// - 다날은 포트원 V2 결제를 지원하지 않아 V1 SDK(IMP.request_pay)로 연동한다.
// - 웹에서만 동작한다. Capacitor 앱/WebView 에서는 결제 UI 자체를 렌더하지 않는다.
// - 어떤 네비게이션에도 링크하지 않는다. 직접 URL 진입 전용.
// - 금액은 고정가 상품만 노출한다 (심사 요건: 금액 임의 입력 불가).

const btnBase = {
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 700,
}

function formatKRW(n) {
  return `${n.toLocaleString('ko-KR')}원`
}

export default function PgTest() {
  const [searchParams] = useSearchParams()
  const { user, token } = useStore()
  const [catalog, setCatalog] = useState({ products: [], plans: [] })
  const [allowed, setAllowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])

  const native = isNativeApp()
  const configured = isPortOneConfigured()

  const pushLog = (type, message, detail) => {
    setLog((prev) => [
      { type, message, detail, at: new Date().toLocaleTimeString('ko-KR') },
      ...prev,
    ])
  }

  // 포트원/다날이 돌려준 원문을 그대로 남긴다. 원인 추적이 목적이라 가공하지 않는다.
  const pushRaw = (type, message, obj) => {
    console.log(`[PgTest] ${message}`, obj)
    let text
    try {
      text = JSON.stringify(obj, null, 2)
    } catch {
      text = String(obj)
    }
    pushLog(type, message, text)
  }

  useEffect(() => {
    if (native || !token) return
    api
      .get('/payments/products')
      .then((res) => {
        setCatalog(res)
        setAllowed(Boolean(res.allowed))
      })
      .catch((err) => pushLog('error', '상품 목록을 불러오지 못했습니다', err.message))
  }, [native, token])

  // 모바일 결제창은 m_redirect_url 로 복귀한다. 복귀 시 서버에서 승인 결과를 검증한다.
  useEffect(() => {
    if (native || !token) return
    const impUid = searchParams.get('imp_uid')
    const merchantUid = searchParams.get('merchant_uid')
    const productId = searchParams.get('productId')
    if (!impUid || !merchantUid || !productId) return

    api
      .post('/payments/complete', { impUid, merchantUid, productId })
      .then((res) => pushLog('success', `결제 검증 완료 · ${formatKRW(res.amount)}`, res.note))
      .catch((err) => pushLog('error', '결제 검증 실패', err.data?.error || err.message))
  }, [native, token, searchParams])

  // 앱에서는 어떤 결제 UI도 보여주지 않는다 (Google Play 결제 정책).
  if (native) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 14 }}>
        이 페이지는 웹 브라우저에서만 이용할 수 있습니다.
      </div>
    )
  }

  const buyerInfo = {
    buyer_name: user?.name || '테스트',
    buyer_email: user?.email || 'test@pesona.app',
    // 다날은 buyer_tel 미설정 시 결제창에서 오류가 날 수 있어 항상 채운다.
    buyer_tel: '010-0000-0000',
  }

  const handlePayment = async (product) => {
    if (busy) return
    setBusy(true)
    try {
      const IMP = await loadPortOne()
      const merchantUid = createMerchantUid()
      const redirectBase = `${window.location.origin}/pg-test?productId=${product.id}`

      const params = {
        channelKey: PORTONE_CHANNEL_KEY,
        pay_method: 'card',
        merchant_uid: merchantUid,
        name: product.name,
        amount: product.amount,
        m_redirect_url: redirectBase,
        ...buyerInfo,
      }
      pushRaw('info', '① 결제 요청 파라미터', { impCode: PORTONE_IMP_CODE, ...params })

      IMP.request_pay(params, async (rsp) => {
        pushRaw(rsp.imp_uid ? 'info' : 'error', '② 포트원/다날 응답 원문', rsp)

        // success/error_code 는 결제 성공 여부가 아니다. 반드시 서버에서 조회해 확인한다.
        if (!rsp.imp_uid) {
          pushLog(
            'error',
            '결제가 완료되지 않았습니다',
            `${rsp.error_code || 'NO_CODE'} · ${rsp.error_msg || '결제창이 닫혔습니다'}`
          )
          setBusy(false)
          return
        }
        try {
          const result = await api.post('/payments/complete', {
            impUid: rsp.imp_uid,
            merchantUid: rsp.merchant_uid,
            productId: product.id,
          })
          pushRaw('success', '③ 서버 검증 결과', result)
        } catch (err) {
          pushRaw('error', '③ 서버 검증 실패', err.data || { message: err.message })
        } finally {
          setBusy(false)
        }
      })
    } catch (err) {
      pushLog('error', '결제 요청 실패', err.message)
      setBusy(false)
    }
  }

  const handleBilling = async (plan) => {
    if (busy) return
    setBusy(true)
    try {
      const IMP = await loadPortOne()
      const merchantUid = createMerchantUid('pesona-sub')
      // 빌링키를 식별할 고객 고유 ID. 사용자당 하나로 관리한다.
      const customerUid = `pesona-customer-${user?.id || 'test'}`

      const params = {
        channelKey: PORTONE_CHANNEL_KEY,
        pay_method: 'card', // 다날 비인증 결제는 card 만 지원
        merchant_uid: merchantUid,
        name: plan.name,
        // amount 0 = 빌링키 발급만 수행하고 결제 승인은 하지 않는다.
        // (다날은 최초 10원 테스트 결제 후 30분쯤 뒤 자동 취소한다.)
        amount: 0,
        customer_uid: customerUid,
        m_redirect_url: `${window.location.origin}/pg-test`,
        ...buyerInfo,
      }
      pushRaw('info', '① 빌링키 요청 파라미터', { impCode: PORTONE_IMP_CODE, ...params })

      IMP.request_pay(params, async (rsp) => {
        pushRaw(rsp.imp_uid ? 'info' : 'error', '② 포트원/다날 응답 원문', rsp)

        if (!rsp.success && !rsp.imp_uid) {
          pushLog(
            'error',
            '빌링키 발급 실패',
            `${rsp.error_code || 'NO_CODE'} · ${rsp.error_msg || '결제창이 닫혔습니다'}`
          )
          setBusy(false)
          return
        }
        try {
          const result = await api.post('/payments/billing/pay', {
            customerUid,
            planId: plan.id,
          })
          pushRaw('success', '③ 정기결제 승인 결과', result)
        } catch (err) {
          pushRaw('error', '③ 정기결제 승인 실패', err.data || { message: err.message })
        } finally {
          setBusy(false)
        }
      })
    } catch (err) {
      pushLog('error', '정기결제 요청 실패', err.message)
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f0f12',
        color: '#fff',
        paddingTop: 'calc(env(safe-area-inset-top) + 20px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>결제 테스트</h1>
      <p style={{ fontSize: 13, color: '#9a9aa6', marginBottom: 20 }}>
        PG 연동 검수용 페이지입니다. 웹 브라우저 전용이며 마스크는 지급되지 않습니다.
      </p>

      {!token && (
        <div
          style={{
            background: '#1a1a20',
            borderRadius: 12,
            padding: 14,
            fontSize: 13,
            color: '#9a9aa6',
            marginBottom: 20,
          }}
        >
          결제를 진행하려면 먼저{' '}
          <a href="/login" style={{ color: '#8f7cff', fontWeight: 700 }}>
            로그인
          </a>
          해 주세요.
        </div>
      )}

      {token && configured && !allowed && (
        <div
          style={{
            background: '#3a2a1a',
            border: '1px solid #6b4a1f',
            borderRadius: 12,
            padding: 14,
            fontSize: 13,
            color: '#f0c992',
            marginBottom: 20,
          }}
        >
          이 계정은 웹 결제 허용 대상이 아닙니다. 서버의 PAYMENT_ALLOWED_EMAILS 를 확인해 주세요.
        </div>
      )}

      {!configured && (
        <div
          style={{
            background: '#3a2a1a',
            border: '1px solid #6b4a1f',
            borderRadius: 12,
            padding: 14,
            fontSize: 13,
            color: '#f0c992',
            marginBottom: 20,
          }}
        >
          VITE_PORTONE_IMP_CODE / VITE_PORTONE_CHANNEL_KEY 가 설정되지 않았습니다.
        </div>
      )}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>일반결제</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {catalog.products.map((product) => (
            <div
              key={product.id}
              style={{
                background: '#1a1a20',
                borderRadius: 14,
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <MaskIcon style={{ width: '1.1em', height: '1.1em' }} />
                  {product.masks}개
                </div>
                <div style={{ fontSize: 13, color: '#9a9aa6', marginTop: 2 }}>
                  {formatKRW(product.amount)}
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !configured || !token || !allowed}
                onClick={() => handlePayment(product)}
                style={{
                  ...btnBase,
                  padding: '10px 18px',
                  background: busy || !configured || !token || !allowed ? '#33333d' : '#6c5ce7',
                  color: '#fff',
                  opacity: busy || !configured || !token || !allowed ? 0.6 : 1,
                }}
              >
                결제하기
              </button>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>정기결제</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {catalog.plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: '#1a1a20',
                borderRadius: 14,
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{plan.name}</div>
                <div style={{ fontSize: 13, color: '#9a9aa6', marginTop: 2 }}>
                  {formatKRW(plan.amount)} / 월
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !configured || !token || !allowed}
                onClick={() => handleBilling(plan)}
                style={{
                  ...btnBase,
                  padding: '10px 18px',
                  background: busy || !configured || !token || !allowed ? '#33333d' : '#00b894',
                  color: '#fff',
                  opacity: busy || !configured || !token || !allowed ? 0.6 : 1,
                }}
              >
                구독하기
              </button>
            </div>
          ))}
        </div>
      </section>

      {log.length > 0 && (
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>진행 로그</h2>
            <button
              type="button"
              onClick={() => {
                const text = log
                  .slice()
                  .reverse()
                  .map((e) => `[${e.at}] ${e.message}\n${e.detail || ''}`)
                  .join('\n\n')
                navigator.clipboard?.writeText(text)
              }}
              style={{
                ...btnBase,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                background: '#2a2a33',
                color: '#c9c9d4',
              }}
            >
              전체 복사
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {log.map((entry, i) => (
              <div
                key={i}
                style={{
                  background: '#1a1a20',
                  borderLeft: `3px solid ${
                    entry.type === 'success'
                      ? '#00b894'
                      : entry.type === 'error'
                        ? '#e17055'
                        : '#6c5ce7'
                  }`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{entry.message}</span>
                  <span style={{ color: '#6b6b78', fontSize: 11, flexShrink: 0 }}>{entry.at}</span>
                </div>
                {entry.detail && (
                  <pre
                    style={{
                      color: '#9a9aa6',
                      marginTop: 6,
                      marginBottom: 0,
                      fontSize: 11,
                      lineHeight: 1.5,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: 260,
                      overflow: 'auto',
                    }}
                  >
                    {entry.detail}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
