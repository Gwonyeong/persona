import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

// 노드/선택지/분기 구조를 JSON으로 보기 좋게 직렬화 — Prisma 메타필드 제외
function serializeNodesForEditor(allNodes) {
  // allNodes: 응답에서 받은 평면 배열 (메인 + 분기 모두 섞여 있음)
  const branchMap = new Map() // choiceId → 분기 노드 배열
  const mainNodes = []
  for (const n of allNodes) {
    if (n.branchFromChoiceId == null) mainNodes.push(n)
    else {
      if (!branchMap.has(n.branchFromChoiceId)) branchMap.set(n.branchFromChoiceId, [])
      branchMap.get(n.branchFromChoiceId).push(n)
    }
  }
  mainNodes.sort((a, b) => a.sortOrder - b.sortOrder)
  for (const arr of branchMap.values()) arr.sort((a, b) => a.branchSortOrder - b.branchSortOrder)

  function clean(n) {
    const out = {
      nodeType: n.nodeType,
      ...(n.characterId ? { characterId: n.characterId } : {}),
      ...(n.script ? { script: n.script } : {}),
      ...(n.resultTitle ? { resultTitle: n.resultTitle } : {}),
      ...(n.resultBody ? { resultBody: n.resultBody } : {}),
      ...(n.translations ? { translations: n.translations } : {}),
    }
    if (Array.isArray(n.choices) && n.choices.length > 0) {
      out.choices = n.choices.map((c) => ({
        label: c.label,
        ...(c.description ? { description: c.description } : {}),
        ...(c.choiceType && c.choiceType !== 'REGULAR' ? { choiceType: c.choiceType } : {}),
        ...(c.maskCost ? { maskCost: c.maskCost } : {}),
        ...(c.affinityDelta ? { affinityDelta: c.affinityDelta } : {}),
        ...(c.translations ? { translations: c.translations } : {}),
        // imageUnlocks → unlockStoryImageIds (admin GET response 형식 → POST/PUT body 형식)
        ...(Array.isArray(c.imageUnlocks) && c.imageUnlocks.length > 0
          ? { unlockStoryImageIds: c.imageUnlocks.map((u) => u.storyImageId) }
          : {}),
        ...(branchMap.has(c.id) ? { branchNodes: branchMap.get(c.id).map(clean) } : {}),
      }))
    }
    return out
  }

  return mainNodes.map(clean)
}

export default function StorylineEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [storyline, setStoryline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('tree') // 'tree' | 'meta' | 'json'
  const [selectedChapter, setSelectedChapter] = useState(null)
  const [meta, setMeta] = useState({})
  const [jsonText, setJsonText] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  useEffect(() => {
    load()
  }, [id])

  const load = async () => {
    setLoading(true)
    try {
      const { storyline } = await api.get(`/admin/storylines/${id}`)
      setStoryline(storyline)
      setMeta({
        title: storyline.title || '',
        description: storyline.description || '',
        thumbnailImage: storyline.thumbnailImage || '',
        coverImage: storyline.coverImage || '',
        defaultBgm: storyline.defaultBgm || '',
        status: storyline.status || 'DRAFT',
        sortOrder: storyline.sortOrder ?? 0,
      })
      const editorJson = {
        title: storyline.title,
        description: storyline.description,
        thumbnailImage: storyline.thumbnailImage,
        coverImage: storyline.coverImage,
        defaultBgm: storyline.defaultBgm,
        status: storyline.status,
        sortOrder: storyline.sortOrder,
        guestCharacterIds: (storyline.characters || []).map((sc) => sc.characterId),
        // 컬렉터블 이미지 — DB id를 tempId로도 같이 보내서 노드 안에서 참조 가능하게
        images: (storyline.images || []).map((img) => ({
          tempId: img.id,
          url: img.url,
          ...(img.title ? { title: img.title } : {}),
          ...(img.description ? { description: img.description } : {}),
          unlockType: img.unlockType,
          sortOrder: img.sortOrder,
        })),
        nodes: serializeNodesForEditor(storyline.nodes || []),
      }
      setJsonText(JSON.stringify(editorJson, null, 2))
    } catch (e) {
      console.error('Load storyline failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const saveMeta = async () => {
    setSaving(true)
    setStatusMsg(null)
    try {
      const payload = {
        title: meta.title,
        description: meta.description || null,
        thumbnailImage: meta.thumbnailImage || null,
        coverImage: meta.coverImage || null,
        defaultBgm: meta.defaultBgm || null,
        status: meta.status,
        sortOrder: parseInt(meta.sortOrder) || 0,
      }
      const { storyline: updated } = await api.put(`/admin/storylines/${id}`, payload)
      setStoryline((prev) => ({ ...prev, ...updated }))
      setStatusMsg({ type: 'success', text: '저장 완료' })
    } catch (e) {
      console.error(e)
      setStatusMsg({ type: 'error', text: e?.response?.data?.error || '저장 실패' })
    } finally {
      setSaving(false)
      setTimeout(() => setStatusMsg(null), 2500)
    }
  }

  const saveFullJson = async () => {
    if (!confirm('JSON 전체 교체는 기존 노드/선택지/유저 진행 기록을 삭제합니다. 계속할까요?')) return
    setSaving(true)
    setStatusMsg(null)
    try {
      let body
      try {
        body = JSON.parse(jsonText)
      } catch (e) {
        throw new Error('JSON 파싱 실패: ' + e.message)
      }
      await api.put(`/admin/storylines/${id}/replace`, body)
      setStatusMsg({ type: 'success', text: '전체 교체 완료. 다시 불러오는 중...' })
      await load()
    } catch (e) {
      console.error(e)
      setStatusMsg({ type: 'error', text: e?.response?.data?.error || e?.message || '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('이 스토리를 삭제하시겠습니까? 모든 노드/유저 진행 기록이 함께 삭제됩니다.')) return
    try {
      await api.delete(`/admin/storylines/${id}`)
      navigate(`/admin/characters/${storyline.characterId}/storylines`)
    } catch (e) {
      alert('삭제 실패: ' + (e?.response?.data?.error || e?.message))
    }
  }

  if (loading) {
    return <p className="p-6 text-gray-500 text-sm">로딩 중...</p>
  }
  if (!storyline) {
    return <p className="p-6 text-gray-500 text-sm">스토리를 찾을 수 없습니다.</p>
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(`/admin/characters/${storyline.characterId}/storylines`)}
          className="text-gray-400 hover:text-white text-sm"
          style={{ outline: 'none' }}
        >
          ←
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{storyline.title}</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {storyline.character?.name} · 노드 {(storyline.nodes || []).length}개 · {storyline.status}
          </p>
        </div>
        <button
          onClick={() => window.open(`/storylines/${storyline.id}`, '_blank')}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded transition-colors"
          style={{ outline: 'none' }}
        >
          ▶ 미리보기
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs rounded transition-colors"
          style={{ outline: 'none' }}
        >
          삭제
        </button>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-800 mb-4">
        {[
          { key: 'tree', label: '트리' },
          { key: 'meta', label: '메타데이터' },
          { key: 'json', label: 'JSON 편집 (전체 교체)' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'text-white border-b-2 border-indigo-500 font-medium'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            style={{ outline: 'none' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 상태 메시지 */}
      {statusMsg && (
        <div
          className={`mb-3 p-2.5 rounded text-xs ${
            statusMsg.type === 'success' ? 'bg-emerald-900/30 text-emerald-300' : 'bg-red-900/30 text-red-300'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* 트리 탭 */}
      {tab === 'tree' && (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <StorylineTreeView
              storyline={storyline}
              selectedChapterId={selectedChapter?.id ?? null}
              onChapterClick={setSelectedChapter}
            />
          </div>
          {selectedChapter && (
            <div
              className="w-[460px] flex-shrink-0 sticky top-4 self-start"
              style={{ height: 'calc(100vh - 2rem)' }}
            >
              <ChapterDetailPanel
                chapter={selectedChapter}
                storyline={storyline}
                onClose={() => setSelectedChapter(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* 메타 탭 */}
      {tab === 'meta' && (
        <div className="space-y-4">
          <Field label="제목 *">
            <input
              value={meta.title}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </Field>
          <Field label="설명">
            <textarea
              value={meta.description}
              onChange={(e) => setMeta({ ...meta, description: e.target.value })}
              rows={3}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="상태">
              <select
                value={meta.status}
                onChange={(e) => setMeta({ ...meta, status: e.target.value })}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="DRAFT">DRAFT (비공개)</option>
                <option value="PUBLISHED">PUBLISHED (공개)</option>
              </select>
            </Field>
            <Field label="정렬 순서">
              <input
                type="number"
                value={meta.sortOrder}
                onChange={(e) => setMeta({ ...meta, sortOrder: e.target.value })}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
              />
            </Field>
          </div>
          <Field label="썸네일 URL (9:16 카드용)">
            <input
              value={meta.thumbnailImage}
              onChange={(e) => setMeta({ ...meta, thumbnailImage: e.target.value })}
              placeholder="https://..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none font-mono text-xs"
            />
            {meta.thumbnailImage && (
              <img src={meta.thumbnailImage} alt="" className="mt-2 w-24 aspect-[9/16] object-cover rounded border border-gray-800" />
            )}
          </Field>
          <Field label="커버 URL (풀사이즈)">
            <input
              value={meta.coverImage}
              onChange={(e) => setMeta({ ...meta, coverImage: e.target.value })}
              placeholder="https://..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none font-mono text-xs"
            />
          </Field>
          <Field label="기본 BGM URL">
            <input
              value={meta.defaultBgm}
              onChange={(e) => setMeta({ ...meta, defaultBgm: e.target.value })}
              placeholder="https://....mp3"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none font-mono text-xs"
            />
          </Field>

          <div className="pt-3 border-t border-gray-800">
            <button
              onClick={saveMeta}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ outline: 'none' }}
            >
              {saving ? '저장 중...' : '메타데이터 저장'}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              ※ 메타데이터 저장은 노드/선택지/유저 진행에 영향이 없습니다.
            </p>
          </div>
        </div>
      )}

      {/* JSON 탭 */}
      {tab === 'json' && (
        <div className="space-y-3">
          <div className="bg-amber-900/30 border border-amber-800/50 rounded-lg p-3">
            <p className="text-xs text-amber-300">
              ⚠️ JSON 전체 교체는 <strong>기존 노드/선택지/유저 진행 기록을 모두 삭제</strong>하고 새로 생성합니다.
              메타데이터만 수정하려면 위 "메타데이터" 탭을 사용하세요.
            </p>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={28}
            spellCheck={false}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-200 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={saveFullJson}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ outline: 'none' }}
            >
              {saving ? '교체 중...' : '⚠️ 전체 교체 저장'}
            </button>
            <button
              onClick={load}
              disabled={saving}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
              style={{ outline: 'none' }}
            >
              초기화 (DB에서 다시 불러오기)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 트리 뷰 — 메인 챕터 세로 + 분기 챕터 가로 들여쓰기
// ───────────────────────────────────────────────────────────

function buildTree(nodes) {
  const main = []
  const branchMap = new Map()
  for (const n of nodes || []) {
    if (n.branchFromChoiceId == null) main.push(n)
    else {
      if (!branchMap.has(n.branchFromChoiceId)) branchMap.set(n.branchFromChoiceId, [])
      branchMap.get(n.branchFromChoiceId).push(n)
    }
  }
  main.sort((a, b) => a.sortOrder - b.sortOrder)
  for (const arr of branchMap.values()) arr.sort((a, b) => a.branchSortOrder - b.branchSortOrder)
  return { mainChapters: main, branchMap }
}

function getChapterPreview(chapter) {
  if (chapter.nodeType === 'RESULT') return chapter.resultTitle || '(제목 없음)'
  const script = Array.isArray(chapter.script) ? chapter.script : []
  const first = script[0]
  if (!first) return '(빈 챕터)'
  return first.text || first.content || (first.mode === 'cg' ? '🖼️ CG' : '...')
}

function StorylineTreeView({ storyline, selectedChapterId, onChapterClick }) {
  const { mainChapters, branchMap } = buildTree(storyline?.nodes)

  if (mainChapters.length === 0) {
    return <p className="text-gray-500 text-sm">노드가 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {mainChapters.map((ch, i) => (
        <div key={ch.id}>
          <ChapterCard
            chapter={ch}
            index={i}
            branchMap={branchMap}
            selectedChapterId={selectedChapterId}
            onChapterClick={onChapterClick}
            isMain
            storyline={storyline}
          />
          {i < mainChapters.length - 1 && (
            <div className="flex justify-center py-1.5 text-gray-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// 챕터의 첫 효과를 추출 (썸네일용)
function getChapterVisuals(chapter, storyline) {
  if (chapter.nodeType === 'RESULT') return { isResult: true }
  const script = Array.isArray(chapter.script) ? chapter.script : []
  const firstBg = script.find((it) => it.backgroundImage)?.backgroundImage || null
  const firstChar = script.find((it) => it.characterImage)?.characterImage || null
  // 첫 CG (bg/character 없을 때 fallback)
  const firstCg = script.find((it) => it.mode === 'cg')
  const cgImg = firstCg
    ? (storyline?.images || []).find((i) => i.id === firstCg.storyImageId || i.tempId === firstCg.storyImageId)
    : null
  return { isResult: false, firstBg, firstChar, cgUrl: cgImg?.url || null }
}

function ChapterThumb({ chapter, storyline, size = 'normal' }) {
  const v = getChapterVisuals(chapter, storyline)
  const widthClass = size === 'small' ? 'w-10' : 'w-14'
  const isChat = chapter.nodeType === 'CHAT'

  if (v.isResult) {
    return (
      <div className={`relative flex-shrink-0 ${widthClass} aspect-[9/16] rounded overflow-hidden bg-gradient-to-br from-indigo-700 to-purple-800 flex items-center justify-center border border-indigo-600`}>
        <span className="text-[9px] font-bold text-white tracking-widest">FIN</span>
      </div>
    )
  }

  // CHAT 노드: 채팅 UI를 미리보기 — 다크 그레이 + 버블 실루엣
  if (isChat) {
    return (
      <div className={`relative flex-shrink-0 ${widthClass} aspect-[9/16] rounded overflow-hidden bg-gray-950 border border-sky-700/60 flex flex-col justify-end p-1 gap-0.5`}>
        <div className="flex justify-start"><div className="w-[60%] h-1.5 rounded-full bg-sky-500/60" /></div>
        <div className="flex justify-start"><div className="w-[45%] h-1.5 rounded-full bg-sky-500/40" /></div>
        <div className="flex justify-end"><div className="w-[55%] h-1.5 rounded-full bg-emerald-500/60" /></div>
        <div className="flex justify-start"><div className="w-[50%] h-1.5 rounded-full bg-sky-500/40" /></div>
        <div className="absolute top-0.5 right-0.5 text-[7px] text-sky-300 font-bold">CHAT</div>
      </div>
    )
  }

  return (
    <div className={`relative flex-shrink-0 ${widthClass} aspect-[9/16] rounded overflow-hidden bg-gray-800 border border-gray-700`}>
      {v.firstBg ? (
        <img src={v.firstBg} className="absolute inset-0 w-full h-full object-cover" alt="" />
      ) : v.cgUrl ? (
        <img src={v.cgUrl} className="absolute inset-0 w-full h-full object-cover opacity-90" alt="" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-950" />
      )}
      {v.firstChar && (
        <img
          src={v.firstChar}
          className="absolute inset-x-0 bottom-0 top-1 w-full h-[95%] object-contain object-bottom drop-shadow"
          alt=""
        />
      )}
      {!v.firstBg && !v.firstChar && !v.cgUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">—</div>
      )}
    </div>
  )
}

function ChapterCard({ chapter, index, branchMap, selectedChapterId, onChapterClick, isMain = false, storyline }) {
  const isResult = chapter.nodeType === 'RESULT'
  const isChat = chapter.nodeType === 'CHAT'
  const script = Array.isArray(chapter.script) ? chapter.script : []
  const choices = Array.isArray(chapter.choices) ? chapter.choices : []
  const preview = getChapterPreview(chapter)
  const isSelected = selectedChapterId === chapter.id

  // 모드 통계 계산 (chip)
  const modeCounts = script.reduce((acc, item) => {
    acc[item.mode] = (acc[item.mode] || 0) + 1
    return acc
  }, {})

  // 카드 배경/보더 — branch는 amber, main은 nodeType별 (CHAPTER:gray, CHAT:sky, RESULT:indigo)
  const cardClass = isResult
    ? 'bg-indigo-950/40 border-indigo-700'
    : isMain
      ? isChat
        ? 'bg-sky-950/30 border-sky-800/60'
        : 'bg-gray-900 border-gray-700'
      : 'bg-amber-950/20 border-amber-800/60'

  // nodeType 뱃지 — 색상으로 노드 타입 구분
  const badgeClass = isResult
    ? 'bg-indigo-700 text-white'
    : isChat
      ? 'bg-sky-700 text-white'
      : isMain
        ? 'bg-gray-700 text-gray-300'
        : 'bg-amber-800/60 text-amber-100'

  return (
    <div className={`rounded-xl border ${cardClass} ${isSelected ? 'ring-2 ring-indigo-500' : ''}`}>
      <button
        onClick={() => onChapterClick(chapter)}
        className="w-full text-left px-3 py-3 hover:bg-white/5 rounded-t-xl transition-colors"
        style={{ outline: 'none' }}
      >
        <div className="flex gap-3 items-start">
          <ChapterThumb chapter={chapter} storyline={storyline} size={isMain ? 'normal' : 'small'} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-gray-500 font-mono">
                {isMain ? `#${index + 1}` : '↳ branch'}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${badgeClass}`}>
                {isChat && '💬 '}{chapter.nodeType}
              </span>
              {!isResult && (
                <span className="text-[10px] text-gray-500">
                  {script.length} items
                </span>
              )}
              {!isResult && Object.entries(modeCounts).map(([mode, cnt]) => (
                <span key={mode} className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-400">
                  {mode === 'narration' && '📖'}
                  {mode === 'character' && '💬'}
                  {mode === 'user' && '👤'}
                  {mode === 'cg' && '🖼️'}
                  {cnt}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-200 line-clamp-2">{preview}</p>
          </div>
        </div>
      </button>

      {/* 선택지 목록 */}
      {!isResult && choices.length > 0 && (
        <div className="border-t border-gray-700/50 divide-y divide-gray-700/40">
          {choices.map((c) => (
            <ChoiceRow
              key={c.id}
              choice={c}
              branchMap={branchMap}
              selectedChapterId={selectedChapterId}
              onChapterClick={onChapterClick}
              storyline={storyline}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChoiceRow({ choice, branchMap, selectedChapterId, onChapterClick, storyline }) {
  const branches = branchMap.get(choice.id) || []
  const isPremium = choice.choiceType === 'PREMIUM'
  const unlockCount = (choice.imageUnlocks || []).length

  return (
    <div className={`px-4 py-2 ${isPremium ? 'bg-amber-950/30' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gray-500 text-xs">▸</span>
        <span className="text-sm text-gray-200 flex-1 min-w-0">{choice.label}</span>
        {isPremium && (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/60 text-amber-200 border border-amber-700/60 rounded font-bold">
            PREMIUM {choice.maskCost}🎭
          </span>
        )}
        {choice.affinityDelta !== 0 && (
          <span className={`text-[10px] font-medium ${choice.affinityDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {choice.affinityDelta > 0 ? '+' : ''}{choice.affinityDelta}
          </span>
        )}
        {unlockCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded">
            🖼️ {unlockCount}
          </span>
        )}
      </div>
      {/* 분기 챕터 — 우측 들여쓰기 */}
      {branches.length > 0 && (
        <div className="mt-2 ml-5 pl-3 border-l-2 border-amber-800/40 space-y-2">
          {branches.map((b, i) => (
            <ChapterCard
              key={b.id}
              chapter={b}
              index={i}
              branchMap={branchMap}
              selectedChapterId={selectedChapterId}
              onChapterClick={onChapterClick}
              isMain={false}
              storyline={storyline}
            />
          ))}
          <div className="text-[10px] text-gray-500 pl-1">↩ 메인으로 복귀</div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 챕터 상세 사이드 패널 — script 아이템 풀 노출
// ───────────────────────────────────────────────────────────

const MODE_META = {
  narration: { icon: '📖', label: 'narration', bg: 'bg-gray-800/80', text: 'text-gray-200' },
  character: { icon: '💬', label: 'character', bg: 'bg-indigo-900/40', text: 'text-white' },
  user:      { icon: '👤', label: 'user',      bg: 'bg-emerald-900/40', text: 'text-white' },
  cg:        { icon: '🖼️', label: 'cg',        bg: 'bg-amber-900/40', text: 'text-amber-100' },
}

function ChapterDetailPanel({ chapter, storyline, onClose }) {
  const isResult = chapter.nodeType === 'RESULT'
  const isChat = chapter.nodeType === 'CHAT'
  const script = Array.isArray(chapter.script) ? chapter.script : []
  const choices = Array.isArray(chapter.choices) ? chapter.choices : []
  const isBranch = chapter.branchFromChoiceId != null
  const [lightbox, setLightbox] = useState(null) // { url, type: 'image'|'video'|'audio', label }

  const nodeTypeLabel = isResult
    ? 'RESULT 노드'
    : `${isChat ? '💬 CHAT' : '📖 CHAPTER'} ${isBranch ? '· 분기' : `· 메인 #${chapter.sortOrder + 1}`}`

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden flex flex-col h-full relative">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 font-mono">
            {nodeTypeLabel}
            {' · '}id {chapter.id}
          </p>
          <h3 className="text-sm font-bold text-white line-clamp-1">
            {isResult ? (chapter.resultTitle || '(제목 없음)') : getChapterPreview(chapter)}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-lg flex-shrink-0"
          style={{ outline: 'none' }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2"
        onWheel={(e) => e.stopPropagation()}
      >
        {isResult ? (
          <>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">resultTitle</p>
              <p className="text-sm text-white">{chapter.resultTitle || '(없음)'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">resultBody</p>
              <p className="text-sm text-white whitespace-pre-line">{chapter.resultBody || '(없음)'}</p>
            </div>
          </>
        ) : (
          <>
            {script.length === 0 && (
              <p className="text-gray-500 text-xs">script가 비어 있습니다.</p>
            )}
            {script.map((item, i) => (
              <ScriptItemRow key={i} item={item} index={i} storyline={storyline} onMediaClick={setLightbox} />
            ))}

            {choices.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700/60">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">선택지 ({choices.length})</p>
                <div className="space-y-2">
                  {choices.map((c) => (
                    <div key={c.id} className={`rounded-lg p-2.5 border ${c.choiceType === 'PREMIUM' ? 'bg-amber-950/20 border-amber-800/60' : 'bg-gray-800/60 border-gray-700'}`}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm text-gray-100 flex-1">{c.label}</span>
                        {c.choiceType === 'PREMIUM' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/60 text-amber-200 border border-amber-700/60 rounded font-bold">PREMIUM {c.maskCost}🎭</span>
                        )}
                        {c.affinityDelta !== 0 && (
                          <span className={`text-[10px] ${c.affinityDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {c.affinityDelta > 0 ? '+' : ''}{c.affinityDelta}
                          </span>
                        )}
                      </div>
                      {c.description && <p className="text-xs text-gray-400 mb-1">{c.description}</p>}
                      {Array.isArray(c.imageUnlocks) && c.imageUnlocks.length > 0 && (
                        <p className="text-[10px] text-purple-300">
                          🖼️ 해금 이미지 {c.imageUnlocks.length}장
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 미디어 풀스크린 라이트박스 (패널 내부 오버레이) */}
      {lightbox && (
        <div
          className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-full text-white"
            style={{ outline: 'none' }}
            aria-label="닫기"
          >
            ✕
          </button>
          {lightbox.label && (
            <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[11px] text-gray-200">
              {lightbox.label}
            </div>
          )}
          {lightbox.type === 'video' && (
            <video
              src={lightbox.url}
              className="max-w-full max-h-full object-contain"
              autoPlay
              loop
              controls
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {lightbox.type === 'audio' && (
            <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 rounded-xl p-6 max-w-md">
              <p className="text-xs text-gray-400 mb-3 break-all">{lightbox.url}</p>
              <audio src={lightbox.url} controls autoPlay className="w-full" />
            </div>
          )}
          {lightbox.type === 'image' && (
            <img
              src={lightbox.url}
              alt=""
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  )
}

// 미디어 썸네일 — 클릭 시 풀스크린 라이트박스 노출
function MediaThumb({ url, type, label, onClick, aspect = 'video', className = '' }) {
  const aspectCls = aspect === '9:16' ? 'aspect-[9/16] w-32' : aspect === 'audio' ? 'h-10 w-full' : 'aspect-video w-full'
  return (
    <button
      onClick={() => onClick({ url, type, label })}
      className={`relative ${aspectCls} rounded-lg overflow-hidden bg-gray-800 border border-gray-700 hover:border-indigo-500 transition-colors group ${className}`}
      style={{ outline: 'none' }}
      title={label}
    >
      {type === 'video' && (
        <>
          <video src={url} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </div>
        </>
      )}
      {type === 'image' && (
        <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {type === 'audio' && (
        <div className="absolute inset-0 flex items-center justify-start gap-2 px-3 bg-gradient-to-r from-purple-900/60 to-indigo-900/60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <span className="text-[11px] text-gray-200 truncate">{label || 'audio'}</span>
        </div>
      )}
      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-gray-200">
        {label}
      </div>
    </button>
  )
}

function ScriptItemRow({ item, index, storyline, onMediaClick }) {
  const meta = MODE_META[item.mode] || MODE_META.narration
  const cgImage = item.mode === 'cg'
    ? (storyline?.images || []).find((img) => img.id === item.storyImageId || img.tempId === item.storyImageId)
    : null

  // 이 아이템의 미디어 모음 — 큰 미리보기로 노출 (이미지/영상은 모두 9:16, 플레이어 비율과 동일)
  const medias = []
  if (item.backgroundImage) medias.push({ url: item.backgroundImage, type: 'image', label: '🏞 bg', aspect: '9:16' })
  if (item.characterImage) medias.push({ url: item.characterImage, type: 'image', label: '👤 character', aspect: '9:16' })
  if (item.fullMediaUrl) medias.push({ url: item.fullMediaUrl, type: item.fullMediaType === 'video' ? 'video' : 'image', label: '📺 full', aspect: '9:16' })
  if (item.mediaUrl) medias.push({ url: item.mediaUrl, type: item.mediaType === 'video' ? 'video' : 'image', label: '📎 attach', aspect: '9:16' })
  if (item.bgmUrl) medias.push({ url: item.bgmUrl, type: 'audio', label: '🎵 bgm', aspect: 'audio' })
  if (item.bgsUrl) medias.push({ url: item.bgsUrl, type: 'audio', label: '🌧️ bgs', aspect: 'audio' })
  if (item.voiceUrl) medias.push({ url: item.voiceUrl, type: 'audio', label: '🎤 voice', aspect: 'audio' })

  return (
    <div className={`rounded-lg p-3 ${meta.bg}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs">{meta.icon}</span>
        <span className="text-[10px] text-gray-400 font-mono">[{index}] {meta.label}</span>
      </div>

      {/* 텍스트 */}
      {item.mode === 'narration' && item.text && (
        <p className={`text-sm whitespace-pre-line ${meta.text} mb-2`}>{item.text}</p>
      )}
      {(item.mode === 'character' || item.mode === 'user') && (
        <div className="mb-2">
          {item.name && <p className="text-[10px] text-gray-400 mb-0.5">{item.name}</p>}
          {item.content && <p className={`text-sm whitespace-pre-line ${meta.text}`}>{item.content}</p>}
        </div>
      )}

      {/* CG 풀스크린 미리보기 */}
      {item.mode === 'cg' && cgImage && (
        <div className="mb-2">
          {cgImage.title && (
            <p className={`text-sm font-medium mb-1.5 ${meta.text}`}>🖼️ {cgImage.title}</p>
          )}
          <button
            onClick={() => onMediaClick({ url: cgImage.url, type: 'image', label: cgImage.title || 'CG' })}
            className="block w-full aspect-[9/16] max-h-80 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 hover:border-amber-500 transition-colors"
            style={{ outline: 'none' }}
          >
            <img src={cgImage.url} alt="" className="w-full h-full object-cover" />
          </button>
        </div>
      )}

      {/* 미디어 썸네일 그리드 */}
      {medias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {medias.map((m, i) => (
            <MediaThumb
              key={i}
              url={m.url}
              type={m.type}
              label={m.label}
              aspect={m.aspect}
              onClick={onMediaClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
