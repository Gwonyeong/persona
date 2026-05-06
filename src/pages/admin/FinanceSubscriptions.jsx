import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const STATUS_LABELS = {
  ACTIVE: '활성',
  CANCELED: '해지 예약',
  EXPIRED: '종료',
  GRACE_PERIOD: '결제 유예',
  ON_HOLD: '결제 보류',
  PAUSED: '일시정지',
}

const STATUS_COLORS = {
  ACTIVE: 'text-emerald-400',
  CANCELED: 'text-amber-400',
  EXPIRED: 'text-gray-500',
  GRACE_PERIOD: 'text-amber-400',
  ON_HOLD: 'text-red-400',
  PAUSED: 'text-gray-400',
}

function fmtDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtKrw(value) {
  return `₩${(value || 0).toLocaleString('ko-KR')}`
}

function SubscriptionTable({ rows }) {
  if (rows.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">기록이 없습니다.</p>
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
          <th className="p-3">유저</th>
          <th className="p-3">상태</th>
          <th className="p-3">결제</th>
          <th className="p-3">자동갱신</th>
          <th className="p-3">시작일</th>
          <th className="p-3">만료일</th>
          <th className="p-3">최근 검증</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((sub) => (
          <tr key={sub.id} className="border-b border-gray-800/50 text-sm">
            <td className="p-3">
              <div className="flex items-center gap-2">
                {sub.user.avatarUrl ? (
                  <img
                    src={sub.user.avatarUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-800" />
                )}
                <div className="leading-tight">
                  <div className="text-gray-100">{sub.user.name || '-'}</div>
                  <div className="text-xs text-gray-500">{sub.user.email}</div>
                </div>
              </div>
            </td>
            <td className={`p-3 font-medium ${STATUS_COLORS[sub.status] || 'text-gray-400'}`}>
              {STATUS_LABELS[sub.status] || sub.status}
            </td>
            <td className="p-3">
              {sub.inTrial ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-amber-900/40 text-amber-300 border border-amber-800">
                  무료 체험
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-800">
                  유료
                </span>
              )}
            </td>
            <td className="p-3 text-gray-400">{sub.autoRenewing ? 'ON' : 'OFF'}</td>
            <td className="p-3 text-gray-400">{fmtDate(sub.startedAt)}</td>
            <td className="p-3 text-gray-400">{fmtDate(sub.expiresAt)}</td>
            <td className="p-3 text-gray-500">{fmtDate(sub.lastVerifiedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function FinanceSubscriptions() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resyncing, setResyncing] = useState(false)
  const [resyncResult, setResyncResult] = useState(null)

  const fetchData = () => {
    setLoading(true)
    return api
      .get('/admin/finance/subscriptions')
      .then((res) => {
        setData(res)
        setError(null)
      })
      .catch((err) => {
        setError(err?.message || '불러오기 실패')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleResyncAll = async () => {
    if (resyncing) return
    if (
      !window.confirm(
        '모든 LIGHT 구독을 Google에 강제 재검증합니다. 구독 수에 따라 시간이 걸릴 수 있습니다. 진행할까요?'
      )
    ) {
      return
    }
    setResyncing(true)
    setResyncResult(null)
    try {
      const result = await api.post('/admin/finance/subscriptions/resync-all')
      setResyncResult(result)
      await fetchData()
    } catch (err) {
      setResyncResult({ error: err?.message || '재검증 실패' })
    } finally {
      setResyncing(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-400">로딩 중...</div>
  }
  if (error) {
    return <div className="p-6 text-red-400">{error}</div>
  }

  const summary = data.summary

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">구독 (라이트 요금제)</h2>
        <button
          type="button"
          onClick={handleResyncAll}
          disabled={resyncing}
          className="px-3 py-2 text-sm font-medium rounded-md bg-indigo-500 text-white hover:bg-indigo-400 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {resyncing ? 'Google에 재검증 중...' : 'Google에 모두 강제 재검증'}
        </button>
      </div>

      {resyncResult && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            resyncResult.error
              ? 'border-red-800 bg-red-950/40 text-red-300'
              : 'border-emerald-800 bg-emerald-950/30 text-emerald-200'
          }`}
        >
          {resyncResult.error ? (
            <span>재검증 실패: {resyncResult.error}</span>
          ) : (
            <div className="space-y-1">
              <div>
                재검증 완료 — 총 {resyncResult.total}건 중 성공 {resyncResult.synced}건, 실패{' '}
                {resyncResult.failed}건
              </div>
              {resyncResult.failed > 0 && resyncResult.errors?.length > 0 && (
                <ul className="text-xs text-red-300 list-disc pl-5">
                  {resyncResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      user {e.userId}: {e.message}
                    </li>
                  ))}
                  {resyncResult.errors.length > 5 && (
                    <li>외 {resyncResult.errors.length - 5}건</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">활성 구독자</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">
            {summary.activeCount.toLocaleString('ko-KR')}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            유료 {summary.payingCount.toLocaleString('ko-KR')} · 체험{' '}
            {summary.trialCount.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">취소 (만료 대기)</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">
            {summary.pendingCancelCount.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">종료된 구독</div>
          <div className="mt-1 text-2xl font-bold text-gray-300">
            {summary.endedCount.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">무료 체험 중</div>
          <div className="mt-1 text-2xl font-bold text-amber-300">
            {summary.trialCount.toLocaleString('ko-KR')}
          </div>
          <div className="mt-1 text-xs text-gray-500">매출에서 제외됨</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">
            월 예상 순수익 (수수료 {Math.round(summary.playStoreFeeRate * 100)}% 제외)
          </div>
          <div className="mt-1 text-2xl font-bold text-indigo-300">
            {fmtKrw(summary.monthlyRevenueNetKrw)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            총액 {fmtKrw(summary.monthlyRevenueKrw)} · 유료 {summary.payingCount}건 ×{' '}
            {fmtKrw(summary.lightPlanPriceKrw)}
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">활성 구독자</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <SubscriptionTable rows={data.active} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">
          취소 예약 — 만료일까지는 유효
        </h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <SubscriptionTable rows={data.pendingCancel} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">종료된 구독</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <SubscriptionTable rows={data.ended} />
        </div>
      </section>
    </div>
  )
}
