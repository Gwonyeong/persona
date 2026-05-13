import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import StoryTabsHeader from './StoryTabsHeader'

const SORT_OPTIONS = [
  { key: 'masks', label: '마스크 수익 많은 순' },
  { key: 'avgMasks', label: '평균 마스크 소모 높은 순' },
  { key: 'choiceSelections', label: '프리미엄 선택 많은 순' },
  { key: 'mediaUnlocks', label: '미디어 해금 많은 순' },
  { key: 'players', label: '플레이어 많은 순' },
  { key: 'title', label: '제목 가나다순' },
]

const STATUS_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'PUBLISHED', label: '게시됨' },
  { key: 'DRAFT', label: '초안' },
  { key: 'TEST', label: '테스트' },
]

const CHAR_SORT_OPTIONS = [
  { key: 'masks', label: '캐릭터 마스크 수익순' },
  { key: 'players', label: '캐릭터 플레이어순' },
  { key: 'name', label: '캐릭터 이름순' },
]

export default function StoryAnalyticsPremium() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('masks')
  const [charSortKey, setCharSortKey] = useState('masks')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedStory, setExpandedStory] = useState(new Set())
  const [collapsedChar, setCollapsedChar] = useState(new Set())

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get('/admin/storylines/analytics/premium')
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
    return list
  }, [data, statusFilter, search])

  const characterGroups = useMemo(() => {
    const groups = new Map()
    for (const s of filtered) {
      const cid = s.character?.id ?? -1
      if (!groups.has(cid)) {
        groups.set(cid, {
          character: s.character || { id: -1, name: '(미지정)', profileImage: null },
          stories: [],
          totals: {
            uniquePlayers: 0,
            premiumSelections: 0,
            choiceMasks: 0,
            mediaUnlocks: 0,
            mediaMasks: 0,
            totalMasks: 0,
          },
        })
      }
      const g = groups.get(cid)
      g.stories.push(s)
      g.totals.uniquePlayers += s.uniquePlayers || 0
      g.totals.premiumSelections += s.premium?.totalSelections || 0
      g.totals.choiceMasks += s.premium?.totalMasks || 0
      g.totals.mediaUnlocks += s.media?.totalUnlocks || 0
      g.totals.mediaMasks += s.media?.totalMasks || 0
      g.totals.totalMasks += s.totalMasksFromStory || 0
    }

    for (const g of groups.values()) {
      g.totals.avgMasksPerPlayer =
        g.totals.uniquePlayers > 0
          ? +(g.totals.totalMasks / g.totals.uniquePlayers).toFixed(1)
          : 0
      g.stories.sort((a, b) => sortStories(a, b, sortKey))
    }

    const arr = Array.from(groups.values())
    arr.sort((a, b) => sortGroups(a, b, charSortKey))
    return arr
  }, [filtered, sortKey, charSortKey])

  const grandTotals = useMemo(() => {
    return characterGroups.reduce(
      (acc, g) => {
        acc.choiceSelections += g.totals.premiumSelections
        acc.choiceMasks += g.totals.choiceMasks
        acc.mediaUnlocks += g.totals.mediaUnlocks
        acc.mediaMasks += g.totals.mediaMasks
        acc.totalMasks += g.totals.totalMasks
        acc.players += g.totals.uniquePlayers
        return acc
      },
      {
        choiceSelections: 0,
        choiceMasks: 0,
        mediaUnlocks: 0,
        mediaMasks: 0,
        totalMasks: 0,
        players: 0,
      },
    )
  }, [characterGroups])

  const totalStories = characterGroups.reduce((n, g) => n + g.stories.length, 0)

  const toggleStory = (id) => {
    setExpandedStory((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleChar = (cid) => {
    setCollapsedChar((prev) => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  if (loading)
    return (
      <div>
        <StoryTabsHeader />
        <div className="p-6 text-gray-400">로딩 중...</div>
      </div>
    )
  if (error)
    return (
      <div>
        <StoryTabsHeader />
        <div className="p-6 text-red-400">에러: {error}</div>
      </div>
    )

  return (
    <div>
      <StoryTabsHeader />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">스토리 프리미엄 통계</h1>
          <p className="text-sm text-gray-400 mt-1">
            캐릭터별 묶음 — 프리미엄 선택지 채택 비율 + 마스크 해금 미디어 통계
          </p>
        </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <SummaryCard
          label="프리미엄 선택 누적"
          value={grandTotals.choiceSelections.toLocaleString()}
          sub={`${grandTotals.choiceMasks.toLocaleString()} 🎭`}
        />
        <SummaryCard
          label="미디어 해금 누적"
          value={grandTotals.mediaUnlocks.toLocaleString()}
          sub={`${grandTotals.mediaMasks.toLocaleString()} 🎭`}
        />
        <SummaryCard
          label="총 마스크 수익"
          value={grandTotals.totalMasks.toLocaleString() + ' 🎭'}
          sub={
            grandTotals.players > 0
              ? `평균 ${(grandTotals.totalMasks / grandTotals.players).toFixed(1)} 🎭/유저`
              : '—'
          }
        />
        <SummaryCard
          label="캐릭터 / 스토리"
          value={`${characterGroups.length} / ${totalStories}`}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
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
          value={charSortKey}
          onChange={(e) => setCharSortKey(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          {CHAR_SORT_OPTIONS.map((s) => (
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
        <button
          onClick={() => setCollapsedChar(new Set())}
          className="px-3 py-2 text-xs text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          모두 펼치기
        </button>
        <button
          onClick={() => setCollapsedChar(new Set(characterGroups.map((g) => g.character.id)))}
          className="px-3 py-2 text-xs text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          모두 접기
        </button>
      </div>

      {characterGroups.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl py-12 text-center text-gray-500">
          데이터가 없습니다
        </div>
      ) : (
        <div className="space-y-4">
          {characterGroups.map((group) => (
            <CharacterSection
              key={group.character.id}
              group={group}
              collapsed={collapsedChar.has(group.character.id)}
              onToggle={() => toggleChar(group.character.id)}
              expandedStory={expandedStory}
              onToggleStory={toggleStory}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

function CharacterSection({ group, collapsed, onToggle, expandedStory, onToggleStory }) {
  const { character, stories, totals } = group
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <span
          className={`text-gray-500 text-xs transition-transform ${
            collapsed ? '' : 'rotate-90'
          }`}
        >
          ▶
        </span>
        {character.profileImage ? (
          <img
            src={character.profileImage}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-gray-800"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-800" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium">
            {character.name}
            <span className="text-xs text-gray-500 ml-2">{stories.length}개 스토리</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            플레이어 {totals.uniquePlayers.toLocaleString()} · 프리미엄 선택{' '}
            {totals.premiumSelections.toLocaleString()} · 미디어 해금{' '}
            {totals.mediaUnlocks.toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <Stat label="평균/유저" value={`${totals.avgMasksPerPlayer} 🎭`} />
          <Stat label="총 수익" value={`${totals.totalMasks.toLocaleString()} 🎭`} highlight />
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/40 text-gray-400 text-xs">
              <tr>
                <Th>스토리</Th>
                <Th align="right">고유 플레이어</Th>
                <Th align="right">프리미엄 선택지</Th>
                <Th align="right">프리미엄 채택</Th>
                <Th align="right">선택 마스크</Th>
                <Th align="right">미디어 정의</Th>
                <Th align="right">미디어 해금</Th>
                <Th align="right">해금 유저 비율</Th>
                <Th align="right">미디어 마스크</Th>
                <Th align="right">평균 마스크/유저</Th>
                <Th align="right">총 수익</Th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => (
                <StoryRow
                  key={s.id}
                  s={s}
                  isOpen={expandedStory.has(s.id)}
                  onToggle={() => onToggleStory(s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StoryRow({ s, isOpen, onToggle }) {
  const premium = s.premium || {
    choices: [],
    definedCount: 0,
    totalSelections: 0,
    totalMasks: 0,
  }
  const media = s.media || {
    items: [],
    definedCount: 0,
    totalUnlocks: 0,
    totalMasks: 0,
    uniqueUsers: 0,
    unlockRatioOfPlayers: 0,
  }

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
                <StatusBadge status={s.status} />
              </div>
            </div>
          </div>
        </Td>
        <Td align="right">{(s.uniquePlayers || 0).toLocaleString()}</Td>
        <Td align="right">{premium.definedCount}</Td>
        <Td align="right">{premium.totalSelections.toLocaleString()}</Td>
        <Td align="right">{premium.totalMasks.toLocaleString()} 🎭</Td>
        <Td align="right">{media.definedCount}</Td>
        <Td align="right">{media.totalUnlocks.toLocaleString()}</Td>
        <Td align="right">
          <span className={pctClass(media.unlockRatioOfPlayers)}>
            {media.unlockRatioOfPlayers}%
          </span>
          <div className="text-[10px] text-gray-500">
            {media.uniqueUsers}/{s.uniquePlayers || 0}명
          </div>
        </Td>
        <Td align="right">{media.totalMasks.toLocaleString()} 🎭</Td>
        <Td align="right" className="font-medium text-indigo-300">
          {(s.avgMasksPerPlayer || 0).toLocaleString()} 🎭
        </Td>
        <Td align="right" className="font-medium">
          {(s.totalMasksFromStory || 0).toLocaleString()} 🎭
        </Td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-950/60 border-t border-gray-800">
          <td colSpan={11} className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PremiumChoiceBreakdown premium={premium} />
              <MediaBreakdown media={media} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function PremiumChoiceBreakdown({ premium }) {
  if (!premium.choices || premium.choices.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium text-white mb-2">프리미엄 선택지</p>
        <p className="text-xs text-gray-500">정의된 프리미엄 선택지가 없습니다.</p>
      </div>
    )
  }
  const sorted = [...premium.choices].sort(
    (a, b) => (b.selectionCount || 0) - (a.selectionCount || 0),
  )
  return (
    <div>
      <p className="text-sm font-medium text-white mb-2">
        프리미엄 선택지 ({premium.choices.length}개)
      </p>
      <div className="space-y-2">
        {sorted.map((c) => (
          <div key={c.choiceId} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-300 truncate flex-1">
                #{c.nodeSortOrder + 1} · {c.label}
                <span className="text-gray-500 ml-1">({c.maskCost}🎭)</span>
              </span>
              <span className="text-gray-400 w-32 text-right">
                {c.selectionCount.toLocaleString()}회 · {c.ratioOfNode}% (노드 내)
              </span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded mt-1 overflow-hidden">
              <div
                className="h-full bg-indigo-500"
                style={{ width: `${Math.min(100, c.ratioOfNode)}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              전체 플레이어 대비 {c.ratioOfPlayers}% · 총{' '}
              {(c.selectionCount * c.maskCost).toLocaleString()}🎭
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MediaBreakdown({ media }) {
  if (!media.items || media.items.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium text-white mb-2">마스크 해금 미디어</p>
        <p className="text-xs text-gray-500">정의된 프리미엄 미디어가 없습니다.</p>
      </div>
    )
  }
  const sorted = [...media.items].sort(
    (a, b) => (b.unlockCount || 0) - (a.unlockCount || 0),
  )
  return (
    <div>
      <p className="text-sm font-medium text-white mb-2">
        마스크 해금 미디어 ({media.items.length}개)
      </p>
      <div className="space-y-2">
        {sorted.map((m) => (
          <div key={m.mediaUrl} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-300 truncate flex-1">
                #{m.nodeSortOrder + 1} ·{' '}
                <a
                  href={m.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline truncate inline-block max-w-[180px] align-bottom"
                >
                  {m.mediaUrl.split('/').pop()}
                </a>
                <span className="text-gray-500 ml-1">({m.maskCost}🎭)</span>
              </span>
              <span className="text-gray-400 w-32 text-right">
                {m.unlockCount.toLocaleString()}회 · {m.ratioOfPlayers}% (플레이어)
              </span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded mt-1 overflow-hidden">
              <div
                className="h-full bg-amber-500"
                style={{ width: `${Math.min(100, m.ratioOfPlayers)}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              총 {m.totalMasks.toLocaleString()}🎭
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div
        className={`text-sm font-medium ${highlight ? 'text-white' : 'text-gray-300'}`}
      >
        {value}
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-2.5 font-normal whitespace-nowrap text-${align}`}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left', className = '' }) {
  return (
    <td className={`px-4 py-3 text-gray-200 whitespace-nowrap text-${align} ${className}`}>
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

function sortStories(a, b, key) {
  switch (key) {
    case 'avgMasks':
      return (b.avgMasksPerPlayer || 0) - (a.avgMasksPerPlayer || 0)
    case 'choiceSelections':
      return (b.premium?.totalSelections || 0) - (a.premium?.totalSelections || 0)
    case 'mediaUnlocks':
      return (b.media?.totalUnlocks || 0) - (a.media?.totalUnlocks || 0)
    case 'players':
      return (b.uniquePlayers || 0) - (a.uniquePlayers || 0)
    case 'title':
      return (a.title || '').localeCompare(b.title || '')
    case 'masks':
    default:
      return (b.totalMasksFromStory || 0) - (a.totalMasksFromStory || 0)
  }
}

function sortGroups(a, b, key) {
  switch (key) {
    case 'players':
      return b.totals.uniquePlayers - a.totals.uniquePlayers
    case 'name':
      return (a.character.name || '').localeCompare(b.character.name || '')
    case 'masks':
    default:
      return b.totals.totalMasks - a.totals.totalMasks
  }
}
