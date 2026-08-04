import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 로컬 기준 'YYYY-MM-DD' 키
function dayKey(dateLike) {
  const d = new Date(dateLike)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sameDayKey(a, b) {
  return dayKey(a) === dayKey(b)
}

// 스타일 출시 예약 캘린더 — 예약 대기/공개 스타일을 월별 달력에 표시.
// 표정 이미지 화면의 '이미지 관리'와 '획득 통계' 사이 탭.
export default function StyleReleaseCalendar() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)
  // 표시 중인 연·월 (1일 기준)
  const now = new Date()
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selectedKey, setSelectedKey] = useState(dayKey(now))

  useEffect(() => {
    api
      .get('/admin/scheduled-styles')
      .then(({ items }) => setItems(items || []))
      .catch(() => setError(true))
  }, [])

  // 날짜키 → 그 날 출시(예약/공개)되는 스타일 목록
  const byDay = useMemo(() => {
    const map = new Map()
    for (const it of items || []) {
      const when = it.status === 'scheduled' ? it.scheduledPublishAt : it.publishedAt
      const key = dayKey(when)
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ ...it, when })
    }
    // 같은 날은 시간순 정렬
    for (const arr of map.values()) arr.sort((a, b) => new Date(a.when) - new Date(b.when))
    return map
  }, [items])

  // 이번 달 통계
  const monthStats = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    let scheduled = 0
    let published = 0
    for (const it of items || []) {
      const when = it.status === 'scheduled' ? it.scheduledPublishAt : it.publishedAt
      const d = new Date(when)
      if (isNaN(d.getTime())) continue
      if (d.getFullYear() === y && d.getMonth() === m) {
        if (it.status === 'scheduled') scheduled++
        else published++
      }
    }
    return { scheduled, published }
  }, [items, cursor])

  // 달력 격자 (앞뒤 달 패딩 포함, 6주 x 7일)
  const grid = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const startPad = first.getDay() // 0=일
    const start = new Date(y, m, 1 - startPad)
    const cells = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      cells.push(d)
    }
    return cells
  }, [cursor])

  const selectedItems = selectedKey ? byDay.get(selectedKey) || [] : []
  const todayKey = dayKey(now)
  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`

  const shiftMonth = (delta) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  const goToday = () => {
    const t = new Date()
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1))
    setSelectedKey(dayKey(t))
  }

  if (error) return <div className="text-center text-gray-500 py-16">캘린더를 불러오지 못했습니다.</div>
  if (!items) return <div className="text-gray-400 py-8">로딩 중...</div>

  return (
    <div>
      {/* 헤더: 월 네비 + 범례 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
            style={NO_OUTLINE}
          >
            ‹
          </button>
          <h3 className="text-base font-bold text-white min-w-[110px] text-center">{monthLabel}</h3>
          <button
            onClick={() => shiftMonth(1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
            style={NO_OUTLINE}
          >
            ›
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-3 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300"
            style={NO_OUTLINE}
          >
            오늘
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-sky-300">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500/80" />
            예약 대기 {monthStats.scheduled}
          </span>
          <span className="flex items-center gap-1.5 text-emerald-300">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />
            공개됨 {monthStats.published}
          </span>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-medium py-1 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-gray-500'}`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 격자 */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const key = dayKey(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const dayItems = byDay.get(key) || []
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const scheduledCount = dayItems.filter((x) => x.status === 'scheduled').length
          const publishedCount = dayItems.length - scheduledCount
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`min-h-[74px] rounded-lg border p-1.5 text-left transition-colors flex flex-col ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-950/40'
                  : 'border-gray-800 hover:border-gray-700 bg-gray-900/40'
              } ${inMonth ? '' : 'opacity-40'}`}
              style={NO_OUTLINE}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-medium ${
                    isToday
                      ? 'w-5 h-5 flex items-center justify-center rounded-full bg-indigo-600 text-white'
                      : d.getDay() === 0
                        ? 'text-rose-400'
                        : d.getDay() === 6
                          ? 'text-sky-400'
                          : 'text-gray-300'
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayItems.slice(0, 2).map((it) => (
                  <div
                    key={it.id}
                    className={`truncate text-[9px] leading-tight px-1 py-0.5 rounded ${
                      it.status === 'scheduled'
                        ? 'bg-sky-900/60 text-sky-200'
                        : 'bg-emerald-900/50 text-emerald-200'
                    }`}
                    title={`${it.characterName} · ${it.name}`}
                  >
                    {it.characterName} · {it.name}
                  </div>
                ))}
                {dayItems.length > 2 && (
                  <div className="text-[9px] text-gray-500 px-1">+{dayItems.length - 2}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 선택한 날짜 상세 */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-gray-200 mb-2">
          {selectedKey ? selectedKey.replace(/-/g, '. ') : '날짜 선택'}
          {selectedItems.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">{selectedItems.length}건</span>
          )}
        </h4>
        {selectedItems.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">이 날 예약/공개되는 스타일이 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {selectedItems.map((it) => {
              const overdue = it.status === 'scheduled' && new Date(it.when) < now
              return (
                <Link
                  key={it.id}
                  to={`/admin/expressions/${it.characterId}`}
                  className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 hover:border-gray-700"
                  style={NO_OUTLINE}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-800 shrink-0">
                    {it.profileImage ? (
                      <img src={it.profileImage} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-white truncate">{it.name}</span>
                      {it.unlockMode === 'GACHA' && (
                        <span className="text-[9px] bg-fuchsia-900/60 text-fuchsia-300 px-1 py-0.5 rounded font-semibold">GACHA</span>
                      )}
                      {it.unlockMode === 'SHOP' && (
                        <span className="text-[9px] bg-amber-900/60 text-amber-300 px-1 py-0.5 rounded font-semibold">상점</span>
                      )}
                      {it.adultOnly && (
                        <span className="text-[9px] bg-rose-900/60 text-rose-300 px-1 py-0.5 rounded font-semibold">19+</span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 truncate">{it.characterName}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-gray-300">
                      {new Date(it.when).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {it.status === 'scheduled' ? (
                      <span className={`text-[10px] font-semibold ${overdue ? 'text-amber-400' : 'text-sky-300'}`}>
                        {overdue ? '공개 대기(처리중)' : '예약'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-300">공개됨</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
