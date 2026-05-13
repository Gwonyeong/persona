import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

const SORT_OPTIONS = [
  { key: 'players', label: '플레이어 많은 순' },
  { key: 'recent7', label: '최근 7일 신규 많은 순' },
  { key: 'completionRate', label: '완료율 높은 순' },
  { key: 'attempts', label: '총 시도 많은 순' },
  { key: 'title', label: '제목 가나다순' },
]

const STATUS_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'PUBLISHED', label: '게시됨' },
  { key: 'DRAFT', label: '초안' },
  { key: 'TEST', label: '테스트' },
]

export default function StoryAnalyticsProgress() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('players')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(new Set())

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get('/admin/storylines/analytics/progress')
      .then(({ storylines }) => {
        if (alive) setData(storylines || [])
      })
      .catch((e) => {
        if (alive) setError(e?.message || '로드 실패')
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = data
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter)
    if (q) {
      list = list.filter(
        (s) =>
          s.title?.toLowerCase().includes(q) ||
          s.character?.name?.toLowerCase().includes(q),
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'recent7':
          return (b.startedLast7d || 0) - (a.startedLast7d || 0)
        case 'completionRate':
          return (b.completionRateByUser || 0) - (a.completionRateByUser || 0)
        case 'attempts':
          return (b.totalAttempts || 0) - (a.totalAttempts || 0)
        case 'title':
          return (a.title || '').localeCompare(b.title || '')
        case 'players':
        default:
          return (b.uniquePlayers || 0) - (a.uniquePlayers || 0)
      }
    })
    return sorted
  }, [data, sortKey, statusFilter, search])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => {
        acc.players += s.uniquePlayers || 0
        acc.attempts += s.totalAttempts || 0
        acc.completions += s.completedAttempts || 0
        return acc
      },
      { players: 0, attempts: 0, completions: 0 },
    )
  }, [filtered])

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <div className="p-6 text-gray-400">로딩 중...</div>
  if (error) return <div className="p-6 text-red-400">에러: {error}</div>

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">스토리 진행 통계</h1>
        <p className="text-sm text-gray-400 mt-1">
          StoryProgress 기반 — 스토리별 유저 수, 시도/완료율, 엔딩 분포
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryCard label="총 고유 플레이어 (합산)" value={totals.players.toLocaleString()} />
        <SummaryCard label="총 시도 (attempts)" value={totals.attempts.toLocaleString()} />
        <SummaryCard label="총 완료" value={totals.completions.toLocaleString()} />
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목/캐릭터 검색"
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 w-56 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500 ml-auto">총 {filtered.length}개</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60 text-gray-400 text-xs">
              <tr>
                <Th>스토리</Th>
                <Th align="right">고유 플레이어</Th>
                <Th align="right">총 시도</Th>
                <Th align="right">평균 시도/유저</Th>
                <Th align="right">완료 시도</Th>
                <Th align="right">완료율 (유저 기준)</Th>
                <Th align="right">7일</Th>
                <Th align="right">30일</Th>
                <Th align="right">엔딩</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-gray-500 py-12">
                    데이터가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isOpen = expanded.has(s.id)
                  return (
                    <FragmentRow
                      key={s.id}
                      s={s}
                      isOpen={isOpen}
                      onToggle={() => toggle(s.id)}
                    />
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FragmentRow({ s, isOpen, onToggle }) {
  return (
    <>
      <tr
        className={`border-t border-gray-800 cursor-pointer hover:bg-gray-800/40 ${
          isOpen ? 'bg-gray-800/30' : ''
        }`}
        onClick={onToggle}
      >
        <Td>
          <div className="flex items-center gap-2">
            <span
              className={`text-gray-500 text-xs transition-transform ${
                isOpen ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <div>
              <div className="text-white">{s.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {s.character?.name} · <StatusBadge status={s.status} />
              </div>
            </div>
          </div>
        </Td>
        <Td align="right">{(s.uniquePlayers || 0).toLocaleString()}</Td>
        <Td align="right">{(s.totalAttempts || 0).toLocaleString()}</Td>
        <Td align="right">{s.avgAttemptsPerUser || 0}</Td>
        <Td align="right">{(s.completedAttempts || 0).toLocaleString()}</Td>
        <Td align="right">
          <span className={pctClass(s.completionRateByUser)}>
            {s.completionRateByUser}%
          </span>
          <div className="text-[10px] text-gray-500">
            시도 기준 {s.completionRateByAttempt}%
          </div>
        </Td>
        <Td align="right">{s.startedLast7d || 0}</Td>
        <Td align="right">{s.startedLast30d || 0}</Td>
        <Td align="right">{s.endings?.length || 0}</Td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-950/60 border-t border-gray-800">
          <td colSpan={9} className="px-6 py-4">
            <EndingBreakdown endings={s.endings} completedAttempts={s.completedAttempts} />
          </td>
        </tr>
      )}
    </>
  )
}

function EndingBreakdown({ endings, completedAttempts }) {
  if (!endings || endings.length === 0) {
    return <p className="text-xs text-gray-500">RESULT 노드가 없는 스토리입니다.</p>
  }
  const sorted = [...endings].sort((a, b) => b.reachedCount - a.reachedCount)
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        엔딩 도달 분포 (완료 {completedAttempts}건 기준)
      </p>
      <div className="space-y-1.5">
        {sorted.map((e) => (
          <div key={e.nodeId} className="flex items-center gap-3">
            <div className="text-xs text-gray-300 w-48 truncate">
              #{e.sortOrder + 1} · {e.title}
            </div>
            <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-indigo-500"
                style={{ width: `${Math.min(100, e.ratioOfCompletions)}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 w-24 text-right">
              {e.reachedCount.toLocaleString()} ({e.ratioOfCompletions}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-xl font-bold text-white mt-1">{value}</div>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th
      className={`px-4 py-2.5 font-normal whitespace-nowrap text-${align}`}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }) {
  return (
    <td className={`px-4 py-3 text-gray-200 whitespace-nowrap text-${align}`}>
      {children}
    </td>
  )
}

function StatusBadge({ status }) {
  const map = {
    PUBLISHED: 'bg-emerald-900/60 text-emerald-300',
    DRAFT: 'bg-gray-800 text-gray-400',
    TEST: 'bg-amber-900/60 text-amber-300',
  }
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
        map[status] || 'bg-gray-800 text-gray-400'
      }`}
    >
      {status}
    </span>
  )
}

function pctClass(v) {
  if (v >= 70) return 'text-emerald-300'
  if (v >= 40) return 'text-amber-300'
  return 'text-gray-300'
}
