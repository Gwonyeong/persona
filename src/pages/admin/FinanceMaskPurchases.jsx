import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

const PRODUCT_LABELS = {
  masks_30: '30개 패키지',
  masks_100: '100개 패키지',
  masks_300: '300개 패키지',
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

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

// KST 기준 YYYY-MM-DD 추출. verifiedAt이 어느 timezone이든 한국 거주자 기준 날짜로 묶기 위함.
function getKstDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function currentKstMonthKey() {
  return getKstDateKey(new Date()).slice(0, 7)
}

// 지금 시점 기준 며칠 전인지 (KST 자정 경계). 0 = 오늘, 1 = 어제. null = 데이터 없음.
function daysSinceKst(value) {
  if (!value) return null
  const todayKey = getKstDateKey(new Date())
  const valueKey = getKstDateKey(value)
  const a = new Date(`${todayKey}T00:00:00+09:00`).getTime()
  const b = new Date(`${valueKey}T00:00:00+09:00`).getTime()
  return Math.max(0, Math.round((a - b) / 86400000))
}

function DateWithDelta({ value, redAfterDays = 3 }) {
  if (!value) return <span className="text-gray-500">-</span>
  const days = daysSinceKst(value)
  const isStale = days !== null && days > redAfterDays
  return (
    <div className="leading-tight">
      <div className={isStale ? 'text-red-400' : 'text-gray-400'}>{fmtDate(value)}</div>
      <div className={`text-[11px] ${isStale ? 'text-red-400/80' : 'text-gray-500'}`}>
        {days === 0 ? '오늘' : `${days}일 전`}
      </div>
    </div>
  )
}

function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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
    <FinanceMaskPurchasesView items={items} summary={summary} />
  )
}

function FinanceMaskPurchasesView({ items, summary }) {
  const { byDay, byMonth, sortedMonths, latestMonth } = useMemo(() => {
    const byDay = {}
    const byMonth = {}
    for (const item of items) {
      if (!item.verifiedAt) continue
      const dateKey = getKstDateKey(item.verifiedAt)
      const monthKey = dateKey.slice(0, 7)
      if (!byDay[dateKey]) byDay[dateKey] = { count: 0, revenue: 0, revenueNet: 0 }
      byDay[dateKey].count += 1
      byDay[dateKey].revenue += item.priceKrw
      byDay[dateKey].revenueNet += item.priceNetKrw
      if (!byMonth[monthKey]) byMonth[monthKey] = { count: 0, revenue: 0, revenueNet: 0 }
      byMonth[monthKey].count += 1
      byMonth[monthKey].revenue += item.priceKrw
      byMonth[monthKey].revenueNet += item.priceNetKrw
    }
    const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))
    const latestMonth = sortedMonths[0] || currentKstMonthKey()
    return { byDay, byMonth, sortedMonths, latestMonth }
  }, [items])

  const [selectedMonth, setSelectedMonth] = useState(latestMonth)
  const [buyerSortBy, setBuyerSortBy] = useState('lastActive') // 'lastActive' | 'revenue'

  const sortedBuyers = useMemo(() => {
    const list = [...(summary.buyers || [])]
    if (buyerSortBy === 'revenue') {
      list.sort((a, b) => (b.revenueKrw || 0) - (a.revenueKrw || 0))
    } else {
      list.sort((a, b) => {
        const at = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
        const bt = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
        return bt - at
      })
    }
    return list
  }, [summary.buyers, buyerSortBy])

  const calendarCells = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1)
    const lastDay = new Date(y, m, 0)
    const startWeekday = firstDay.getDay()
    const daysInMonth = lastDay.getDate()
    const todayKey = getKstDateKey(new Date())
    const cells = []
    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ empty: true, key: `pad-${i}` })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${selectedMonth}-${String(day).padStart(2, '0')}`
      const stat = byDay[dateKey]
      cells.push({
        empty: false,
        key: dateKey,
        day,
        dateKey,
        stat,
        isToday: dateKey === todayKey,
        weekday: (startWeekday + day - 1) % 7,
      })
    }
    return cells
  }, [selectedMonth, byDay])

  const monthStat = byMonth[selectedMonth] || { count: 0, revenue: 0, revenueNet: 0 }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">마스크 구매</h2>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">총 구매 건수</div>
          <div className="mt-1 text-2xl font-bold text-gray-100">
            {summary.totalCount.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-400">구매 유저 수</div>
          <div className="mt-1 text-2xl font-bold text-amber-300">
            {(summary.buyerCount ?? 0).toLocaleString('ko-KR')}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">1번 이상 결제한 유저</div>
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
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-300">월별 매출</h3>
          <span className="text-xs text-gray-500">한국 시간 기준</span>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          {sortedMonths.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">기록이 없습니다.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="p-3">월</th>
                  <th className="p-3">건수</th>
                  <th className="p-3">매출</th>
                  <th className="p-3">순수익</th>
                  <th className="p-3 w-px" />
                </tr>
              </thead>
              <tbody>
                {sortedMonths.map((monthKey) => {
                  const row = byMonth[monthKey]
                  const isSelected = monthKey === selectedMonth
                  return (
                    <tr
                      key={monthKey}
                      className={`border-b border-gray-800/50 text-sm cursor-pointer hover:bg-gray-800/40 ${
                        isSelected ? 'bg-indigo-500/10' : ''
                      }`}
                      onClick={() => setSelectedMonth(monthKey)}
                    >
                      <td className="p-3 text-gray-100 font-medium">{monthKey}</td>
                      <td className="p-3 text-gray-400">{row.count.toLocaleString('ko-KR')}</td>
                      <td className="p-3 text-gray-400">{fmtKrw(row.revenue)}</td>
                      <td className="p-3 text-indigo-300 font-medium">{fmtKrw(row.revenueNet)}</td>
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                        {isSelected ? '캘린더 표시 중' : '클릭'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-300">날짜별 매출</h3>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
              className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              ‹ 이전
            </button>
            <span className="text-sm font-semibold text-gray-100 min-w-[5.5rem] text-center">
              {selectedMonth}
            </span>
            <button
              type="button"
              onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
              className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              다음 ›
            </button>
            <button
              type="button"
              onClick={() => setSelectedMonth(currentKstMonthKey())}
              className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              이번달
            </button>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-400 mb-3">
            <span>
              건수 <span className="text-gray-200 font-medium">{monthStat.count.toLocaleString('ko-KR')}</span>
            </span>
            <span>
              매출 <span className="text-gray-200 font-medium">{fmtKrw(monthStat.revenue)}</span>
            </span>
            <span>
              순수익 <span className="text-indigo-300 font-medium">{fmtKrw(monthStat.revenueNet)}</span>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-500 mb-1">
            {WEEKDAY_LABELS.map((w, i) => (
              <div
                key={w}
                className={`text-center py-1 ${i === 0 ? 'text-red-300/70' : i === 6 ? 'text-blue-300/70' : ''}`}
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return <div key={cell.key} className="aspect-square rounded bg-transparent" />
              }
              const hasData = !!cell.stat
              const dayColor =
                cell.weekday === 0 ? 'text-red-300' : cell.weekday === 6 ? 'text-blue-300' : 'text-gray-300'
              return (
                <div
                  key={cell.key}
                  className={`aspect-square rounded border p-1.5 flex flex-col ${
                    hasData
                      ? 'bg-gray-800/70 border-gray-700'
                      : 'bg-gray-900 border-gray-800/60'
                  } ${cell.isToday ? 'ring-1 ring-indigo-400' : ''}`}
                >
                  <div className={`text-[11px] font-semibold ${dayColor}`}>{cell.day}</div>
                  {hasData ? (
                    <div className="mt-auto leading-tight">
                      <div className="text-[10px] text-indigo-300 font-semibold truncate">
                        {fmtKrw(cell.stat.revenueNet)}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">{cell.stat.count}건</div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </section>

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
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-300">구매 유저 ({(summary.buyerCount ?? 0).toLocaleString('ko-KR')}명)</h3>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-gray-500">정렬</label>
            <select
              value={buyerSortBy}
              onChange={(e) => setBuyerSortBy(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <option value="lastActive">최근 접속 내림차순</option>
              <option value="revenue">누적 매출 내림차순</option>
            </select>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          {sortedBuyers.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">구매한 유저가 없습니다.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="p-3">유저</th>
                  <th className="p-3">요금제</th>
                  <th className="p-3">보유 마스크</th>
                  <th className="p-3">구매 횟수</th>
                  <th className="p-3">누적 매출</th>
                  <th className="p-3">누적 순수익</th>
                  <th className="p-3">최근 구매</th>
                  <th className="p-3">최근 접속</th>
                </tr>
              </thead>
              <tbody>
                {sortedBuyers.map((b) => (
                  <tr key={b.id} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {b.avatarUrl ? (
                          <img
                            src={b.avatarUrl}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-800" />
                        )}
                        <div className="leading-tight">
                          <div className="text-gray-100">{b.name || '-'}</div>
                          <div className="text-xs text-gray-500">{b.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      {b.isFree ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-gray-800 text-gray-400 border border-gray-700">
                          무료
                        </span>
                      ) : (
                        <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {b.tier || 'LIGHT'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-amber-300 font-medium">
                      {(b.masks ?? 0).toLocaleString('ko-KR')}
                    </td>
                    <td className="p-3 text-gray-300">{b.purchaseCount.toLocaleString('ko-KR')}</td>
                    <td className="p-3 text-gray-400">{fmtKrw(b.revenueKrw)}</td>
                    <td className="p-3 text-indigo-300 font-medium">{fmtKrw(b.revenueNetKrw)}</td>
                    <td className="p-3">
                      <DateWithDelta value={b.lastPurchasedAt} />
                    </td>
                    <td className="p-3">
                      <DateWithDelta value={b.lastActiveAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
