import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const PRODUCT_LABELS = {
  masks_30: '30개 패키지',
  masks_100: '100개 패키지',
  masks_300: '300개 패키지',
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

export default function FinanceMaskPurchases() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .get('/admin/finance/mask-purchases')
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        setError(err?.message || '불러오기 실패')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="p-6 text-gray-400">로딩 중...</div>
  }
  if (error) {
    return <div className="p-6 text-red-400">{error}</div>
  }

  const { items, summary } = data

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">마스크 구매</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">총 구매 건수</div>
          <div className="mt-1 text-2xl font-bold text-gray-100">
            {summary.totalCount.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">총 매출 (수수료 포함)</div>
          <div className="mt-1 text-2xl font-bold text-gray-300">
            {fmtKrw(summary.totalRevenueKrw)}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">
            순수익 (수수료 {Math.round(summary.playStoreFeeRate * 100)}% 제외)
          </div>
          <div className="mt-1 text-2xl font-bold text-indigo-300">
            {fmtKrw(summary.totalRevenueNetKrw)}
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">상품별 집계</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">상품</th>
                <th className="p-3">단가</th>
                <th className="p-3">판매 건수</th>
                <th className="p-3">지급된 마스크</th>
                <th className="p-3">매출</th>
                <th className="p-3">순수익</th>
              </tr>
            </thead>
            <tbody>
              {summary.byProduct.length === 0 ? (
                <tr>
                  <td className="p-4 text-gray-500 text-sm" colSpan={6}>
                    기록이 없습니다.
                  </td>
                </tr>
              ) : (
                summary.byProduct.map((row) => (
                  <tr key={row.productId} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3 text-gray-100">
                      {PRODUCT_LABELS[row.productId] || row.productId}
                    </td>
                    <td className="p-3 text-gray-400">{fmtKrw(row.priceKrw)}</td>
                    <td className="p-3 text-gray-400">{row.count.toLocaleString('ko-KR')}</td>
                    <td className="p-3 text-gray-400">
                      {row.masksGranted.toLocaleString('ko-KR')}
                    </td>
                    <td className="p-3 text-gray-400">{fmtKrw(row.revenueKrw)}</td>
                    <td className="p-3 text-indigo-300 font-medium">
                      {fmtKrw(row.revenueNetKrw)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">전체 구매 기록</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          {items.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">기록이 없습니다.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="p-3">유저</th>
                  <th className="p-3">상품</th>
                  <th className="p-3">마스크</th>
                  <th className="p-3">매출</th>
                  <th className="p-3">순수익</th>
                  <th className="p-3">주문ID</th>
                  <th className="p-3">검증일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {item.user.avatarUrl ? (
                          <img
                            src={item.user.avatarUrl}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-800" />
                        )}
                        <div className="leading-tight">
                          <div className="text-gray-100">{item.user.name || '-'}</div>
                          <div className="text-xs text-gray-500">{item.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-gray-300">
                      {PRODUCT_LABELS[item.productId] || item.productId}
                    </td>
                    <td className="p-3 text-gray-400">
                      {item.masksGranted.toLocaleString('ko-KR')}
                    </td>
                    <td className="p-3 text-gray-400">{fmtKrw(item.priceKrw)}</td>
                    <td className="p-3 text-indigo-300 font-medium">
                      {fmtKrw(item.priceNetKrw)}
                    </td>
                    <td className="p-3 text-xs text-gray-500 font-mono break-all">
                      {item.orderId}
                    </td>
                    <td className="p-3 text-gray-400">{fmtDate(item.verifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
