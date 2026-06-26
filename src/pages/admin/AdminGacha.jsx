import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'

const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']
const RARITY_COLORS = {
  COMMON: 'text-gray-300 bg-gray-800',
  RARE: 'text-sky-300 bg-sky-950/60',
  EPIC: 'text-violet-300 bg-violet-950/60',
  LEGENDARY: 'text-amber-300 bg-amber-950/60',
  MYTHIC: 'text-fuchsia-300 bg-fuchsia-950/60',
}

// 박스 추가 시 기본 — 3등급 (가장 단순). 편집에서 등급 추가/제거 가능.
const DEFAULT_RATES = { COMMON: 70, RARE: 25, EPIC: 5 }

// 등급 추가 시 후보 기본값 — 각 등급의 "흔히 쓰이는" 비율.
const RARITY_DEFAULT_HINT = { COMMON: 60, RARE: 25, EPIC: 12, LEGENDARY: 2.5, MYTHIC: 0.5 }

export default function AdminGacha() {
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBoxId, setSelectedBoxId] = useState(null)

  const loadBoxes = async () => {
    setLoading(true)
    try {
      const { boxes } = await api.get('/admin/gacha/boxes')
      setBoxes(boxes)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBoxes()
  }, [])

  if (loading) return <div className="p-6 text-gray-400">로딩 중...</div>

  if (selectedBoxId) {
    return (
      <BoxEditor
        boxId={selectedBoxId}
        onBack={() => {
          setSelectedBoxId(null)
          loadBoxes()
        }}
      />
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">가챠 박스 관리</h1>
        <Link
          to="/admin/gacha/special-voices"
          className="text-sm text-indigo-300 hover:text-indigo-200"
        >
          → 특별 보이스 관리
        </Link>
      </div>

      <NewBoxForm onCreated={loadBoxes} />

      <div className="mt-6 space-y-2">
        {boxes.length === 0 && (
          <p className="text-gray-500 text-sm">등록된 박스가 없습니다.</p>
        )}
        {boxes.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBoxId(b.id)}
            className="w-full text-left bg-gray-900 border border-gray-800 hover:border-indigo-600 rounded-lg p-4 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{b.name}</h3>
                  {!b.isActive ? (
                    <span className="px-1.5 py-0.5 text-[10px] rounded font-semibold bg-gray-800 text-gray-400">
                      비공개
                    </span>
                  ) : b.adminOnly ? (
                    <span className="px-1.5 py-0.5 text-[10px] rounded font-semibold bg-sky-900/60 text-sky-300">
                      어드민만
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[10px] rounded font-semibold bg-emerald-900/60 text-emerald-300">
                      공개
                    </span>
                  )}
                </div>
                {b.description && (
                  <p className="text-xs text-gray-400 mt-1">{b.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  비용 {b.cost} 마스크 · 천장 {b.pityCount}회 · 아이템{' '}
                  {b._count?.items ?? 0}개 · 누적 추첨 {b._count?.draws ?? 0}회
                </p>
              </div>
              <span className="text-gray-500 text-sm">편집 →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function NewBoxForm({ onCreated }) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState(10)
  const [pityCount, setPityCount] = useState(30)
  const [freeDrawCount, setFreeDrawCount] = useState(0)
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await api.post('/admin/gacha/boxes', {
        name,
        cost: Number(cost),
        pityCount: Number(pityCount),
        freeDrawCount: Number(freeDrawCount),
        rarityRates: DEFAULT_RATES,
      })
      setName('')
      setCost(10)
      setPityCount(30)
      setFreeDrawCount(0)
      onCreated()
    } catch (err) {
      alert('생성 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">새 박스 추가</h3>
      <div className="grid grid-cols-[1fr_110px_110px_110px_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="박스명"
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="회당 마스크"
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={pityCount}
          onChange={(e) => setPityCount(e.target.value)}
          placeholder="천장 회수"
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <input
          type="number"
          min="0"
          value={freeDrawCount}
          onChange={(e) => setFreeDrawCount(e.target.value)}
          placeholder="무료 횟수"
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button
          disabled={creating}
          onClick={submit}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          추가
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        기본 등급 확률 {Object.entries(DEFAULT_RATES).map(([k, v]) => `${k} ${v}%`).join(' · ')} 로 생성.
        무료 횟수는 유저당 평생 1회 제공(10회 묶음에는 적용 안 됨). 편집에서 변경 가능.
      </p>
    </div>
  )
}

function BoxEditor({ boxId, onBack }) {
  const [box, setBox] = useState(null)
  const [characters, setCharacters] = useState([])

  const load = async () => {
    const [{ box }, { characters }] = await Promise.all([
      api.get(`/admin/gacha/boxes/${boxId}`),
      api.get('/admin/characters'),
    ])
    setBox(box)
    setCharacters(characters)
  }

  useEffect(() => {
    load()
  }, [boxId])

  if (!box) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          ← 목록
        </button>
        <h1 className="text-xl font-bold">{box.name}</h1>
      </div>

      <BoxBasicForm box={box} onSaved={load} />
      <RarityRatesForm box={box} onSaved={load} />
      <ItemList box={box} characters={characters} onChanged={load} />
    </div>
  )
}

function BoxBasicForm({ box, onSaved }) {
  const [form, setForm] = useState({
    name: box.name,
    description: box.description || '',
    coverImage: box.coverImage || '',
    cost: box.cost,
    bulkCost: box.bulkCost ?? '',
    // 노출 모드: HIDDEN(비공개) / ADMIN(어드민만) / PUBLIC(모두 공개)
    visibility: !box.isActive ? 'HIDDEN' : box.adminOnly ? 'ADMIN' : 'PUBLIC',
    pityCount: box.pityCount,
    freeDrawCount: box.freeDrawCount ?? 0,
    startsAt: box.startsAt ? box.startsAt.slice(0, 16) : '',
    endsAt: box.endsAt ? box.endsAt.slice(0, 16) : '',
  })
  const [saving, setSaving] = useState(false)
  const [bgPickerOpen, setBgPickerOpen] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/gacha/boxes/${box.id}`, {
        name: form.name,
        description: form.description || null,
        coverImage: form.coverImage || null,
        cost: Number(form.cost),
        bulkCost: form.bulkCost === '' ? null : Number(form.bulkCost),
        isActive: form.visibility !== 'HIDDEN',
        adminOnly: form.visibility === 'ADMIN',
        pityCount: Number(form.pityCount),
        freeDrawCount: Number(form.freeDrawCount),
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      })
      onSaved()
    } catch (err) {
      alert('저장 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('이 박스를 삭제하시겠습니까? 안의 아이템도 같이 삭제됩니다.')) return
    await api.delete(`/admin/gacha/boxes/${box.id}`)
    window.location.reload()
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold mb-3">기본 설정</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-400">
          박스명
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <div className="text-xs text-gray-400">
          커버 이미지
          <div className="mt-1 flex gap-2 items-start">
            {form.coverImage ? (
              <div className="relative flex-shrink-0">
                <img
                  src={form.coverImage}
                  alt=""
                  className="w-16 h-16 object-cover rounded border border-gray-700"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, coverImage: '' })}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  title="제거"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="w-16 h-16 rounded border border-dashed border-gray-700 bg-gray-800/40 flex items-center justify-center text-[10px] text-gray-600">
                없음
              </div>
            )}
            <div className="flex-1 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setBgPickerOpen(true)}
                className="px-2 py-1.5 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                배경 라이브러리에서 선택
              </button>
              <input
                value={form.coverImage}
                onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                placeholder="또는 URL 직접 입력"
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white"
              />
            </div>
          </div>
        </div>
        <label className="text-xs text-gray-400 col-span-2">
          설명
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          회당 비용 (마스크)
          <input
            type="number"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          10회 묶음 비용 (선택)
          <input
            type="number"
            value={form.bulkCost}
            onChange={(e) => setForm({ ...form, bulkCost: e.target.value })}
            placeholder="비워두면 cost × 10"
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          천장 회수
          <input
            type="number"
            value={form.pityCount}
            onChange={(e) => setForm({ ...form, pityCount: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          무료 횟수 (유저당 평생)
          <input
            type="number"
            min="0"
            value={form.freeDrawCount}
            onChange={(e) => setForm({ ...form, freeDrawCount: e.target.value })}
            placeholder="0"
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          노출 모드
          <select
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <option value="HIDDEN">비공개 (숨김)</option>
            <option value="ADMIN">어드민만 (테스트용)</option>
            <option value="PUBLIC">모두 공개</option>
          </select>
        </label>
        <label className="text-xs text-gray-400">
          시작 (선택)
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          종료 (선택)
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          저장
        </button>
        <button
          onClick={remove}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded ml-auto"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          박스 삭제
        </button>
      </div>

      {bgPickerOpen && (
        <BackgroundLibraryPicker
          selectedUrl={form.coverImage}
          onClose={() => setBgPickerOpen(false)}
          onPick={(url) => {
            setForm({ ...form, coverImage: url })
            setBgPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

function BackgroundLibraryPicker({ selectedUrl, onClose, onPick }) {
  const [items, setItems] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState(null)

  useEffect(() => {
    api
      .get('/admin/background-library')
      .then(({ items }) => setItems(items || []))
      .catch(() => setItems([]))
  }, [])

  const allTags = useMemo(() => {
    if (!items) return []
    const set = new Set()
    for (const it of items) for (const t of it.tags || []) set.add(t)
    return [...set].sort()
  }, [items])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (activeTag && !(it.tags || []).includes(activeTag)) return false
      if (!q) return true
      const haystack = [it.description || '', ...(it.tags || [])].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [items, query, activeTag])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-base font-bold text-white">배경 라이브러리에서 선택</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            ×
          </button>
        </div>

        <div className="p-4 border-b border-gray-800 space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="태그·설명 검색"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              <button
                onClick={() => setActiveTag(null)}
                className={`px-2 py-0.5 text-[11px] rounded ${
                  activeTag === null
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                전체
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(t === activeTag ? null : t)}
                  className={`px-2 py-0.5 text-[11px] rounded ${
                    activeTag === t
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items === null ? (
            <p className="text-center text-sm text-gray-500">로딩 중...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-500">검색 결과 없음</p>
          ) : (
            <>
              <p className="text-[11px] text-gray-500 mb-2">{filtered.length}개</p>
              <div className="grid grid-cols-5 gap-2">
                {filtered.map((it) => {
                  const active = selectedUrl === it.filePath
                  return (
                    <button
                      key={it.id}
                      onClick={() => onPick(it.filePath)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        active
                          ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                          : 'border-transparent hover:border-gray-600'
                      }`}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <img src={it.filePath} alt="" className="w-full h-full object-cover" />
                      {(it.tags || []).length > 0 && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white px-1 py-0.5 truncate">
                          {(it.tags || []).slice(0, 3).join(' · ')}
                        </div>
                      )}
                      {active && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                          ✓
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RarityRatesForm({ box, onSaved }) {
  // 현재 박스가 사용하는 등급 키만 유지. RARITIES 순서대로 정렬해서 가독성 확보.
  const [rates, setRates] = useState(() => {
    const fromBox = box.rarityRates || {}
    const ordered = {}
    for (const r of RARITIES) {
      if (fromBox[r] != null) ordered[r] = fromBox[r]
    }
    return Object.keys(ordered).length ? ordered : { ...DEFAULT_RATES }
  })
  const [saving, setSaving] = useState(false)

  const usedRarities = Object.keys(rates)
  const unusedRarities = RARITIES.filter((r) => !usedRarities.includes(r))

  const itemsByRarity = useMemo(() => {
    const map = Object.fromEntries(RARITIES.map((r) => [r, 0]))
    for (const it of box.items || []) map[it.rarity] = (map[it.rarity] || 0) + 1
    return map
  }, [box.items])

  const sum = Object.values(rates).reduce((a, b) => a + Number(b || 0), 0)
  const isValid = Math.abs(sum - 100) < 0.01 && usedRarities.length >= 3 && usedRarities.length <= 5

  const addRarity = (r) => {
    if (usedRarities.length >= 5) return
    setRates({ ...rates, [r]: RARITY_DEFAULT_HINT[r] ?? 5 })
  }

  const removeRarity = (r) => {
    if (usedRarities.length <= 3) return
    if (itemsByRarity[r] > 0) {
      if (!confirm(`${r} 등급에 아이템 ${itemsByRarity[r]}개가 등록되어 있습니다. 제거하시겠습니까? (아이템은 그대로 유지되지만 추첨 풀에서 제외됩니다)`)) return
    }
    const next = { ...rates }
    delete next[r]
    setRates(next)
  }

  const save = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const payload = {}
      for (const r of RARITIES) {
        if (rates[r] != null) payload[r] = Number(rates[r])
      }
      await api.put(`/admin/gacha/boxes/${box.id}`, { rarityRates: payload })
      onSaved()
    } catch (err) {
      alert('저장 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  // 현재 입력된 비율을 비례 유지하며 합 100으로 정규화. 합 0이면 균등 분배.
  // 반올림 누적 오차는 마지막 등급에 흡수해 합이 정확히 100.
  const normalize = () => {
    const keys = usedRarities
    if (!keys.length) return
    const next = {}
    if (sum <= 0) {
      const each = Number((100 / keys.length).toFixed(1))
      let running = 0
      keys.forEach((r, i) => {
        if (i === keys.length - 1) next[r] = Number((100 - running).toFixed(1))
        else {
          next[r] = each
          running += each
        }
      })
    } else {
      let running = 0
      keys.forEach((r, i) => {
        if (i === keys.length - 1) {
          next[r] = Number((100 - running).toFixed(1))
        } else {
          const v = Number(((Number(rates[r] || 0) / sum) * 100).toFixed(1))
          next[r] = v
          running += v
        }
      })
    }
    setRates(next)
  }

  // 등급 카드 너비를 사용 개수에 맞춰 균등 분배 (최소 3 ~ 최대 5).
  const cardCount = usedRarities.length
  const gridColsCls =
    cardCount === 3 ? 'grid-cols-3' : cardCount === 4 ? 'grid-cols-4' : 'grid-cols-5'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">등급 확률 ({usedRarities.length}등급)</h3>
        {unusedRarities.length > 0 && usedRarities.length < 5 && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500">등급 추가:</span>
            {unusedRarities.map((r) => (
              <button
                key={r}
                onClick={() => addRarity(r)}
                className={`px-2 py-0.5 text-[10px] rounded font-semibold ${RARITY_COLORS[r]} hover:opacity-80`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                + {r}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`grid ${gridColsCls} gap-3`}>
        {usedRarities.map((r) => (
          <div key={r} className={`rounded p-3 ${RARITY_COLORS[r]}`}>
            <div className="flex items-start justify-between">
              <div className="text-xs font-semibold">{r}</div>
              {usedRarities.length > 3 && (
                <button
                  onClick={() => removeRarity(r)}
                  className="text-[10px] opacity-60 hover:opacity-100"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  title="이 등급 제거"
                >
                  ✕
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.1"
              value={rates[r]}
              onChange={(e) => setRates({ ...rates, [r]: e.target.value })}
              className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
            <div className="mt-1 text-[10px] opacity-70">
              아이템 {itemsByRarity[r]}개
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className={`text-xs ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
          합 {sum.toFixed(1)}%{' '}
          {isValid ? '✓' : usedRarities.length < 3 || usedRarities.length > 5
            ? '— 3~5등급이어야 합니다'
            : '— 100% 가 되어야 합니다'}
        </span>
        <button
          onClick={normalize}
          disabled={Math.abs(sum - 100) < 0.01}
          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-100 text-[11px] rounded disabled:opacity-40"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          title="현재 비율을 유지하며 합 100%로 자동 조정"
        >
          100%로 맞추기
        </button>
        <button
          disabled={!isValid || saving}
          onClick={save}
          className="ml-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          저장
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        박스마다 3~5등급으로 구성 가능. 등급에 아이템이 0개면 추첨에서 자동 제외됩니다 (가중치
        재정규화).
      </p>
    </div>
  )
}

function ItemList({ box, characters, onChanged }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">아이템 ({box.items.length})</h3>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 아이템 추가
        </button>
      </div>

      {adding && (
        <AddItemForm
          box={box}
          characters={characters}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}

      <div className="space-y-1.5 mt-3">
        {box.items.length === 0 && (
          <p className="text-gray-500 text-xs">아직 아이템이 없습니다.</p>
        )}
        {box.items.map((it) => (
          <ItemRow key={it.id} item={it} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

function ItemRow({ item, onChanged }) {
  const remove = async () => {
    if (!confirm('이 아이템을 삭제하시겠습니까?')) return
    await api.delete(`/admin/gacha/items/${item.id}`)
    onChanged()
  }
  const togglePreview = async () => {
    try {
      await api.put(`/admin/gacha/items/${item.id}`, { isPreview: !item.isPreview })
      onChanged()
    } catch (err) {
      if (err?.data?.error === 'PREVIEW_LIMIT_EXCEEDED') {
        alert('미리보기는 박스당 최대 4개까지 지정할 수 있습니다.')
      } else {
        alert('변경 실패: ' + (err?.data?.error || err?.message))
      }
    }
  }
  return (
    <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
      <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${RARITY_COLORS[item.rarity]}`}>
        {item.rarity}
      </span>
      <span className="text-xs text-gray-300 w-32">{item.rewardType}</span>
      <span className="text-sm text-gray-100 flex-1 truncate">
        {item.displayName || refDescriptor(item)}
      </span>
      {item.previewUrl && (
        <img src={item.previewUrl} alt="" className="w-8 h-8 rounded object-cover" />
      )}
      <button
        onClick={togglePreview}
        className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
          item.isPreview
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        title="박스 카드 미리보기에 노출"
      >
        {item.isPreview ? '✓ 미리보기' : '미리보기'}
      </button>
      <button
        onClick={remove}
        className="text-red-400 hover:text-red-300 text-xs"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        삭제
      </button>
    </div>
  )
}

function refDescriptor(item) {
  if (item.rewardType === 'EXPRESSION_IMAGE') {
    return '랜덤 표정 이미지 (공개 캐릭터 풀)'
  }
  if (item.rewardType === 'EXPRESSION_BUNDLE') {
    return '랜덤 표정+영상 세트 (공개 캐릭터 풀)'
  }
  if (item.rewardType === 'PROFILE_IMAGE') {
    return `프로필 variant #${item.variantId}`
  }
  if (item.rewardType === 'SPECIAL_VOICE') {
    return `특별 보이스 #${item.specialVoiceId}`
  }
  if (item.rewardType === 'STYLE_SET') {
    return `스타일 #${item.styleId} (통째)`
  }
  return item.rewardType
}

function AddItemForm({ box, characters, onClose, onCreated }) {
  // 박스가 사용하는 등급만 옵션으로 — 사용 안 한 등급에 아이템 박으면 추첨 풀에서 빠짐.
  const boxRarities = RARITIES.filter((r) => box.rarityRates?.[r] != null)
  const [rarity, setRarity] = useState(boxRarities[0] || 'COMMON')
  const [rewardType, setRewardType] = useState('EXPRESSION_IMAGE')
  const [characterId, setCharacterId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [specialVoiceId, setSpecialVoiceId] = useState('')
  const [stylePickId, setStylePickId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  // 보조 데이터
  const [characterDetail, setCharacterDetail] = useState(null)
  const [profileVariants, setProfileVariants] = useState([])
  const [specialVoices, setSpecialVoices] = useState([])

  // 동적 풀 타입은 캐릭터 선택이 무의미 — 정적 보상으로 변경 시에만 캐릭터 셀렉터 노출.
  const needsCharacter =
    rewardType === 'PROFILE_IMAGE' || rewardType === 'SPECIAL_VOICE'
  // STYLE_SET 은 그리드 캐릭터 피커로 별도 처리 (드롭다운 X).
  const usesStylePicker = rewardType === 'STYLE_SET'

  // 공개 + GACHA 스타일을 가진 캐릭터만 선택 후보로.
  const styleSetCandidates = useMemo(() => {
    if (!usesStylePicker) return []
    return characters.filter(
      (c) => c.isPublic && (c.styles || []).some((s) => s.unlockMode === 'GACHA'),
    )
  }, [characters, usesStylePicker])

  useEffect(() => {
    const needsDetail = needsCharacter || usesStylePicker
    if (!needsDetail || !characterId) {
      setCharacterDetail(null)
      setProfileVariants([])
      setSpecialVoices([])
      return
    }
    const c = characters.find((ch) => String(ch.id) === String(characterId))
    setCharacterDetail(c || null)
    if (!needsCharacter) return // STYLE_SET 은 추가 fetch 없음 — characters 응답에 styles 포함됨
    Promise.all([
      api.get(`/admin/characters/${characterId}/profile-variants`).catch(() => ({ variants: [] })),
      api.get(`/admin/gacha/special-voices?characterId=${characterId}`).catch(() => ({ voices: [] })),
    ]).then(([variants, voices]) => {
      setProfileVariants(variants?.variants || [])
      setSpecialVoices(voices?.voices || [])
    })
  }, [characterId, characters, needsCharacter, usesStylePicker])

  const submit = async () => {
    const payload = {
      rarity,
      rewardType,
      displayName: displayName || null,
      previewUrl: previewUrl || null,
    }
    if (rewardType === 'PROFILE_IMAGE') {
      if (!variantId) return alert('프로필 variant를 선택하세요.')
      payload.variantId = Number(variantId)
    } else if (rewardType === 'SPECIAL_VOICE') {
      if (!specialVoiceId) return alert('특별 보이스를 선택하세요.')
      payload.specialVoiceId = Number(specialVoiceId)
    } else if (rewardType === 'STYLE_SET') {
      if (!stylePickId) return alert('스타일을 선택하세요.')
      payload.styleId = Number(stylePickId)
    }
    // EXPRESSION_IMAGE / EXPRESSION_BUNDLE 은 동적 풀 — 추가 payload 없음
    try {
      await api.post(`/admin/gacha/boxes/${box.id}/items`, payload)
      onCreated()
    } catch (err) {
      alert('추가 실패: ' + (err?.data?.error || err?.message))
    }
  }

  const gachaStyles = characterDetail?.styles?.filter((s) => s.unlockMode === 'GACHA') || []

  return (
    <div className="bg-gray-950 border border-indigo-700/40 rounded-lg p-4 mb-3">
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs text-gray-400">
          등급
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          >
            {boxRarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-400">
          보상 타입
          <select
            value={rewardType}
            onChange={(e) => setRewardType(e.target.value)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="EXPRESSION_IMAGE">표정 이미지 (랜덤 단일)</option>
            <option value="EXPRESSION_BUNDLE">표정+영상 세트 (랜덤)</option>
            <option value="PROFILE_IMAGE">프로필 이미지 variant</option>
            <option value="SPECIAL_VOICE">특별 보이스</option>
            <option value="STYLE_SET">스타일 세트 (GACHA 스타일 통째)</option>
          </select>
        </label>
        {needsCharacter && (
          <label className="text-xs text-gray-400">
            캐릭터
            <select
              value={characterId}
              onChange={(e) => {
                setCharacterId(e.target.value)
                setVariantId('')
                setSpecialVoiceId('')
                setStylePickId('')
              }}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">— 선택 —</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rewardType === 'EXPRESSION_IMAGE' && (
        <div className="mt-3 p-3 rounded bg-indigo-950/40 border border-indigo-700/40">
          <p className="text-xs text-indigo-200">
            🎲 추첨 시 <strong>공개된 캐릭터 전체</strong>의 표정 이미지 중, 유저가 아직 보지 못한
            것 <strong>1장을 랜덤</strong>으로 지급합니다. 어드민이 별도로 선택할 항목은 없습니다.
          </p>
        </div>
      )}

      {rewardType === 'EXPRESSION_BUNDLE' && (
        <div className="mt-3 p-3 rounded bg-fuchsia-950/40 border border-fuchsia-700/40">
          <p className="text-xs text-fuchsia-200">
            🎬 추첨 시 <strong>공개된 캐릭터의 영상이 있는 표정</strong> 중, 유저가 영상을
            해금하지 않은 것을 <strong>1세트(표정 + 영상)</strong> 지급합니다. 표정만 보유한
            유저는 영상만 추가 해금됩니다.
          </p>
        </div>
      )}

      {needsCharacter && characterId && (
        <div className="mt-3">
          {rewardType === 'PROFILE_IMAGE' && (
            <div className="grid grid-cols-4 gap-1.5">
              {profileVariants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(String(v.id))}
                  className={`relative aspect-square rounded overflow-hidden border-2 ${
                    String(v.id) === variantId
                      ? 'border-indigo-500'
                      : 'border-transparent hover:border-gray-600'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <img src={v.imageUrl} alt="" className="w-full h-full object-cover" />
                  {v.title && (
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 py-0.5">
                      {v.title}
                    </span>
                  )}
                </button>
              ))}
              {profileVariants.length === 0 && (
                <p className="text-gray-500 text-xs col-span-4">
                  등록된 프로필 variant가 없습니다.
                </p>
              )}
            </div>
          )}
          {rewardType === 'SPECIAL_VOICE' && (
            <select
              value={specialVoiceId}
              onChange={(e) => setSpecialVoiceId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">— 선택 —</option>
              {specialVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title || `#${v.id}`} — {v.transcript.slice(0, 40)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {usesStylePicker && (
        <StyleSetPicker
          characters={styleSetCandidates}
          characterId={characterId}
          setCharacterId={(id) => {
            setCharacterId(id)
            setStylePickId('')
          }}
          gachaStyles={gachaStyles}
          stylePickId={stylePickId}
          setStylePickId={setStylePickId}
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="결과 표시명 (선택)"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <input
          value={previewUrl}
          onChange={(e) => setPreviewUrl(e.target.value)}
          placeholder="미리보기 이미지 URL (선택)"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          취소
        </button>
        <button
          onClick={submit}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          추가
        </button>
      </div>
    </div>
  )
}

function StyleSetPicker({ characters, characterId, setCharacterId, gachaStyles, stylePickId, setStylePickId }) {
  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="text-xs text-gray-400 mb-2">
          캐릭터 ({characters.length}개) — 공개 + GACHA 스타일 보유한 캐릭터만 표시
        </p>
        {characters.length === 0 ? (
          <p className="text-amber-400 text-xs">
            선택 가능한 캐릭터가 없습니다. 어떤 캐릭터의 스타일을 GACHA 모드로 먼저 설정하세요.
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto">
            {characters.map((c) => {
              const active = String(c.id) === String(characterId)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCharacterId(String(c.id))}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    active
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                      : 'border-transparent hover:border-gray-600'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {c.profileImage ? (
                    <img src={c.profileImage} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-300 text-center px-1">
                      {c.name}
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-white px-1 py-0.5 truncate">
                    {c.name}
                  </div>
                  {active && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                      ✓
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {characterId && (
        <div>
          <p className="text-xs text-gray-400 mb-2">GACHA 스타일 선택</p>
          {gachaStyles.length === 0 ? (
            <p className="text-amber-400 text-xs">
              이 캐릭터에 GACHA 스타일이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {gachaStyles.map((s) => {
                const preview =
                  (s.images || []).find((i) => i.emotion === 'NEUTRAL') || (s.images || [])[0]
                const active = String(s.id) === stylePickId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStylePickId(String(s.id))}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      active
                        ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/40'
                        : 'border-transparent hover:border-gray-600'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {preview ? (
                      <img
                        src={preview.filePath}
                        alt={s.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-300 px-1">
                        {s.name}
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-white px-1 py-0.5">
                      <div className="truncate font-semibold">{s.name}</div>
                      <div className="opacity-70">{s.images?.length || 0}장</div>
                    </div>
                    {active && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-fuchsia-500 text-white text-[10px] font-bold flex items-center justify-center">
                        ✓
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
