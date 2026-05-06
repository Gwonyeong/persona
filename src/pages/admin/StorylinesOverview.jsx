import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

function formatTimeSince(dateString) {
  if (!dateString) return null
  const then = new Date(dateString).getTime()
  if (Number.isNaN(then)) return null
  const diff = Date.now() - then
  if (diff < 0) return '방금'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day

  if (diff < minute) return '방금'
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`
  if (diff < week) return `${Math.floor(diff / day)}일 전`
  if (diff < month) return `${Math.floor(diff / week)}주 전`
  if (diff < year) return `${Math.floor(diff / month)}개월 전`
  return `${Math.floor(diff / year)}년 전`
}

function staleColor(dateString) {
  if (!dateString) return 'text-gray-500'
  const diff = Date.now() - new Date(dateString).getTime()
  const day = 24 * 60 * 60 * 1000
  if (diff < 7 * day) return 'text-green-400'
  if (diff < 30 * day) return 'text-yellow-400'
  return 'text-red-400'
}

export default function StorylinesOverview() {
  const navigate = useNavigate()
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('public') // 'public' | 'private'
  const [sortBy, setSortBy] = useState('latest') // 'latest' | 'name' | 'count'

  useEffect(() => {
    setLoading(true)
    api
      .get('/admin/storylines-overview')
      .then(({ characters }) => setCharacters(characters || []))
      .catch(() => setCharacters([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return characters
      .filter((c) => (tab === 'public' ? c.isPublic : !c.isPublic))
      .slice()
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name)
        if (sortBy === 'count') return (b.publishedCount || 0) - (a.publishedCount || 0)
        // 'latest' — null은 가장 뒤로
        const at = a.latestPublishedAt ? new Date(a.latestPublishedAt).getTime() : -Infinity
        const bt = b.latestPublishedAt ? new Date(b.latestPublishedAt).getTime() : -Infinity
        return bt - at
      })
  }, [characters, tab, sortBy])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">스토리 관리</h2>
      </div>

      {/* 정렬 */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-400">정렬</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <option value="latest">최근 게시순</option>
          <option value="count">게시 스토리 수</option>
          <option value="name">이름순</option>
        </select>
      </div>

      {/* 공개/비공개 탭 */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {[
          { key: 'public', label: '공개' },
          { key: 'private', label: '비공개' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t.label} ({characters.filter((c) => (t.key === 'public' ? c.isPublic : !c.isPublic)).length})
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {loading ? (
          <p className="p-4 text-gray-500">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-gray-500">캐릭터가 없습니다.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">캐릭터</th>
                <th className="p-3">최근 게시</th>
                <th className="p-3">경과 시간</th>
                <th className="p-3">게시 / 전체</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const since = formatTimeSince(c.latestPublishedAt)
                return (
                  <tr
                    key={c.id}
                    className="border-b border-gray-800/50 text-sm hover:bg-gray-800/40 cursor-pointer"
                    onClick={() => navigate(`/admin/characters/${c.id}/storylines`)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                          {c.profileImage ? (
                            <img src={c.profileImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
                          )}
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-gray-400">
                      {c.latestPublishedAt
                        ? new Date(c.latestPublishedAt).toLocaleString('ko-KR', {
                            year: '2-digit',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className={`p-3 ${staleColor(c.latestPublishedAt)}`}>
                      {since ?? <span className="text-gray-600">게시 안됨</span>}
                    </td>
                    <td className="p-3 text-gray-400">
                      <span className="text-white">{c.publishedCount}</span>
                      <span className="text-gray-500"> / {c.totalCount}</span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/admin/characters/${c.id}/storylines`)
                        }}
                        className="text-amber-400 hover:text-amber-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        스토리 관리 →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
