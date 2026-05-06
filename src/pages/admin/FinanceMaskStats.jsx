import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const USAGE_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-purple-500',
  'bg-gray-500',
]

const GRANT_COLORS = [
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-gray-500',
]

function fmtNum(value) {
  return (value || 0).toLocaleString('ko-KR')
}

function StackBar({ items, colors }) {
  const total = items.reduce((acc, it) => acc + (it.count || 0), 0)
  if (total === 0) return null
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-800">
      {items.map((it, i) => {
        const pct = (it.count / total) * 100
        if (pct === 0) return null
        return (
          <div
            key={it.key}
            className={colors[i % colors.length]}
            style={{ width: `${pct}%` }}
            title={`${it.label}: ${fmtNum(it.count)}건 (${it.percent}%)`}
          />
        )
      })}
    </div>
  )
}

function CategoryTable({ rows, colors, totalLabel, totalCount, totalAmount }) {
  if (rows.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">기록이 없습니다.</p>
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
          <th className="p-3 w-8"></th>
          <th className="p-3">카테고리</th>
          <th className="p-3 text-right">건수</th>
          <th className="p-3 text-right">비율 (건수)</th>
          <th className="p-3 text-right">마스크 합계</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.key} className="border-b border-gray-800/50 text-sm">
            <td className="p-3">
              <div className={`w-3 h-3 rounded-sm ${colors[i % colors.length]}`} />
            </td>
            <td className="p-3 text-gray-100">{row.label}</td>
            <td className="p-3 text-right text-gray-200 font-medium">{fmtNum(row.count)}</td>
            <td className="p-3 text-right text-indigo-300">{row.percent}%</td>
            <td className="p-3 text-right text-gray-400">{fmtNum(row.amount)}</td>
          </tr>
        ))}
        <tr className="text-sm">
          <td className="p-3" />
          <td className="p-3 text-gray-400">{totalLabel}</td>
          <td className="p-3 text-right text-gray-300 font-semibold">{fmtNum(totalCount)}</td>
          <td className="p-3" />
          <td className="p-3 text-right text-gray-300 font-semibold">{fmtNum(totalAmount)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function FinanceMaskStats() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    api
      .get('/admin/finance/mask-stats')
      .then(setData)
      .catch((err) => setError(err?.message || '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-gray-400">로딩 중...</div>
  if (error) return <div className="p-6 text-red-400">{error}</div>

  const { totals, usage, grants, rawByReason } = data

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">마스크 사용 통계</h2>
      <p className="text-xs text-gray-500 -mt-4">ADMIN 유저의 거래는 제외됩니다.</p>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">총 지급</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{fmtNum(totals.granted)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">총 사용</div>
          <div className="mt-1 text-2xl font-bold text-rose-400">{fmtNum(totals.used)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">환불</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{fmtNum(totals.refund)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">잔여 (지급+환불-사용)</div>
          <div
            className={`mt-1 text-2xl font-bold ${
              totals.net >= 0 ? 'text-indigo-300' : 'text-red-400'
            }`}
          >
            {fmtNum(totals.net)}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">사용 내역 — 어디에 썼는가</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
          <StackBar items={usage} colors={USAGE_COLORS} />
          <CategoryTable
            rows={usage}
            colors={USAGE_COLORS}
            totalLabel="총 사용"
            totalCount={totals.usedCount}
            totalAmount={totals.used}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">지급 내역 — 어디서 받았는가</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
          <StackBar items={grants} colors={GRANT_COLORS} />
          <CategoryTable
            rows={grants}
            colors={GRANT_COLORS}
            totalLabel="총 지급 (환불 제외)"
            totalCount={totals.grantedCount}
            totalAmount={totals.granted}
          />
        </div>
      </section>

      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-200 underline"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {showRaw ? '원본 데이터 숨기기' : '원본 데이터 (type/reason 단위) 보기'}
        </button>
        {showRaw && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="p-3">type</th>
                  <th className="p-3">reason</th>
                  <th className="p-3 text-right">건수</th>
                  <th className="p-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {rawByReason.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3 text-gray-300 font-mono text-xs">{row.type}</td>
                    <td className="p-3 text-gray-400 font-mono text-xs break-all">
                      {row.reason || <span className="text-gray-600">(null)</span>}
                    </td>
                    <td className="p-3 text-right text-gray-400">{fmtNum(row.count)}</td>
                    <td
                      className={`p-3 text-right font-medium ${
                        row.amount < 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {fmtNum(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
