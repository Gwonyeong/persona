import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import AssetLibraryModal from './AssetLibraryModal'

// 라이브러리 kind → script 아이템 필드 매핑
const SCRIPT_FIELD_BY_KIND = {
  background: 'backgroundImage',
  character: 'characterImage',
  bgm: 'bgmUrl',
  bgs: 'bgsUrl',
  // chatImage/chatVideo는 별도 핸들링 (mode:'media' 아이템의 mediaUrl로 직접 들어감) — 매핑 불필요
}

// PLACEHOLDER로 시작하는 URL은 외부 도구가 자리만 잡아둔 미수정 값.
// PUBLISHED 저장 전에 어드민이 모두 실제 URL로 교체해야 함.
const PLACEHOLDER_PREFIX = 'PLACEHOLDER'
function isPlaceholderUrl(v) {
  return typeof v === 'string' && v.startsWith(PLACEHOLDER_PREFIX)
}
const URL_FIELDS_IN_SCRIPT_ITEM = [
  'backgroundImage',
  'characterImage',
  'bgmUrl',
  'bgsUrl',
  'voiceUrl',
  'fullMediaUrl',
  'mediaUrl',
]
// storyline 객체 (DB 로드 형태) 전체에서 placeholder URL 개수 카운트
function countPlaceholders(s) {
  if (!s) return 0
  let n = 0
  if (isPlaceholderUrl(s.thumbnailImage)) n++
  if (isPlaceholderUrl(s.coverImage)) n++
  if (isPlaceholderUrl(s.defaultBgm)) n++
  ;(s.images || []).forEach((img) => { if (isPlaceholderUrl(img?.url)) n++ })
  ;(s.nodes || []).forEach((node) => {
    if (Array.isArray(node?.script)) {
      node.script.forEach((it) => {
        URL_FIELDS_IN_SCRIPT_ITEM.forEach((f) => { if (isPlaceholderUrl(it?.[f])) n++ })
      })
    }
  })
  return n
}

// 한 챕터(노드)의 script 안에 있는 placeholder URL 개수
function countPlaceholdersInChapter(chapter) {
  if (!chapter || !Array.isArray(chapter.script)) return 0
  let n = 0
  chapter.script.forEach((it) => {
    URL_FIELDS_IN_SCRIPT_ITEM.forEach((f) => { if (isPlaceholderUrl(it?.[f])) n++ })
  })
  return n
}


// 노드의 화자 캐릭터 voiceId 해석 — node.characterId 우선, 없으면 host
function resolveSpeakerVoiceId(chapter, storyline) {
  if (!storyline) return null
  const nodeCharId = chapter?.characterId
  if (nodeCharId) {
    if (storyline.character?.id === nodeCharId) return storyline.character?.voiceId || null
    const guest = (storyline.characters || []).find((sc) => sc.characterId === nodeCharId)
    if (guest?.character?.voiceId) return guest.character.voiceId
  }
  return storyline.character?.voiceId || null
}

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
  // 에디터 dirty 상태 — script 인라인 편집 시 true. 라이브러리 편집은 즉시 서버 반영이라 dirty와 무관.
  const [dirty, setDirty] = useState(false)
  // 라이브러리/피커 모달 상태
  const [libraryModal, setLibraryModal] = useState(null) // null | { mode: 'manage' } | { mode: 'pick', kind, onPick }

  useEffect(() => {
    load()
  }, [id])

  // dirty 시 페이지 이탈/새로고침 경고
  useEffect(() => {
    if (!dirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

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
      const editorJson = buildReplaceBody(storyline)
      setJsonText(JSON.stringify(editorJson, null, 2))
      setDirty(false)
    } catch (e) {
      console.error('Load storyline failed:', e)
    } finally {
      setLoading(false)
    }
  }

  // 현재 storyline state → PUT /storylines/:id/replace body 형식으로 직렬화
  function buildReplaceBody(s) {
    return {
      title: s.title,
      description: s.description,
      thumbnailImage: s.thumbnailImage,
      coverImage: s.coverImage,
      defaultBgm: s.defaultBgm,
      status: s.status,
      sortOrder: s.sortOrder,
      assetLibrary: s.assetLibrary || { backgrounds: [], characters: [] },
      guestCharacterIds: (s.characters || []).map((sc) => sc.characterId),
      images: (s.images || []).map((img) => ({
        tempId: img.id,
        url: img.url,
        ...(img.title ? { title: img.title } : {}),
        ...(img.description ? { description: img.description } : {}),
        unlockType: img.unlockType,
        sortOrder: img.sortOrder,
      })),
      nodes: serializeNodesForEditor(s.nodes || []),
    }
  }

  // 챕터(노드) 자체의 필드 업데이트 — nodeType, resultTitle, resultBody 등
  function updateChapterField(chapterId, patch) {
    setStoryline((prev) => {
      if (!prev) return prev
      const nodes = (prev.nodes || []).map((n) => (n.id === chapterId ? { ...n, ...patch } : n))
      return { ...prev, nodes }
    })
    setSelectedChapter((prev) => (prev && prev.id === chapterId ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  // 새 script 아이템 삽입 — atIndex 위치에. 기본값은 노드 타입에 맞춰 narration/character 중 선택
  function insertScriptItem(chapterId, atIndex) {
    setStoryline((prev) => {
      if (!prev) return prev
      const nodes = (prev.nodes || []).map((n) => {
        if (n.id !== chapterId) return n
        const script = Array.isArray(n.script) ? [...n.script] : []
        // CHAT 노드는 캐릭터 대화가 디폴트, CHAPTER 노드는 내레이션이 디폴트
        const defaultItem = n.nodeType === 'CHAT'
          ? { mode: 'character', content: '' }
          : { mode: 'narration', text: '' }
        const idx = Math.max(0, Math.min(atIndex, script.length))
        script.splice(idx, 0, defaultItem)
        return { ...n, script }
      })
      return { ...prev, nodes }
    })
    setSelectedChapter((prev) => {
      if (!prev || prev.id !== chapterId) return prev
      const script = Array.isArray(prev.script) ? [...prev.script] : []
      const defaultItem = prev.nodeType === 'CHAT'
        ? { mode: 'character', content: '' }
        : { mode: 'narration', text: '' }
      const idx = Math.max(0, Math.min(atIndex, script.length))
      script.splice(idx, 0, defaultItem)
      return { ...prev, script }
    })
    setDirty(true)
  }

  // script 아이템 제거
  function removeScriptItem(chapterId, atIndex) {
    setStoryline((prev) => {
      if (!prev) return prev
      const nodes = (prev.nodes || []).map((n) => {
        if (n.id !== chapterId) return n
        const script = Array.isArray(n.script) ? n.script.filter((_, i) => i !== atIndex) : []
        return { ...n, script }
      })
      return { ...prev, nodes }
    })
    setSelectedChapter((prev) => {
      if (!prev || prev.id !== chapterId) return prev
      const script = Array.isArray(prev.script) ? prev.script.filter((_, i) => i !== atIndex) : []
      return { ...prev, script }
    })
    setDirty(true)
  }

  // script 아이템의 한 필드 업데이트 — backgroundImage/characterImage/etc.
  // chapterId는 storyline.nodes 안의 노드 id (메인/분기 모두 평면 배열)
  function updateScriptField(chapterId, scriptIndex, patch) {
    setStoryline((prev) => {
      if (!prev) return prev
      const nodes = (prev.nodes || []).map((n) => {
        if (n.id !== chapterId) return n
        const newScript = (n.script || []).map((it, i) =>
          i === scriptIndex ? { ...it, ...patch } : it
        )
        return { ...n, script: newScript }
      })
      return { ...prev, nodes }
    })
    setSelectedChapter((prev) => {
      if (!prev || prev.id !== chapterId) return prev
      const newScript = (prev.script || []).map((it, i) =>
        i === scriptIndex ? { ...it, ...patch } : it
      )
      return { ...prev, script: newScript }
    })
    setDirty(true)
  }

  // dirty 변경사항(script 편집)을 replace API로 일괄 저장
  async function saveAllChanges() {
    if (!storyline) return
    // PUBLISHED 상태 + placeholder 잔존 → 클라이언트 가드 (서버도 동일 검증)
    if (storyline.status === 'PUBLISHED' && countPlaceholders(storyline) > 0) {
      alert('PUBLISHED 상태에서는 PLACEHOLDER URL이 남아있는 채로 저장할 수 없습니다.\n메타데이터 탭에서 일단 DRAFT로 바꾸거나, 모든 슬롯을 실제 URL로 교체해 주세요.')
      return
    }
    if (!confirm('변경사항을 저장할까요?\n\n노드/선택지/유저 진행 기록을 삭제하고 새로 생성합니다.')) return
    setSaving(true)
    setStatusMsg(null)
    try {
      const body = buildReplaceBody(storyline)
      await api.put(`/admin/storylines/${id}/replace`, body)
      setStatusMsg({ type: 'success', text: '저장 완료. 다시 불러오는 중...' })
      await load()
    } catch (e) {
      console.error(e)
      setStatusMsg({ type: 'error', text: e?.data?.error || e?.message || '저장 실패' })
    } finally {
      setSaving(false)
      setTimeout(() => setStatusMsg(null), 3000)
    }
  }

  // 라이브러리만 갱신 — 서버에서 이미 반영된 새 라이브러리를 storyline state에 머지
  function applyLibraryUpdate(newLibrary) {
    setStoryline((prev) => (prev ? { ...prev, assetLibrary: newLibrary } : prev))
  }

  // 개별 보이스 생성 — character 아이템 1개에 대해
  async function generateVoiceForItem(chapterId, scriptIndex, item) {
    const text = item.mode === 'character' ? (item.content || '').trim() : ''
    if (!text) throw new Error('텍스트가 비어있습니다')
    // chapter 객체를 storyline.nodes에서 다시 조회해 현재 voiceId 결정
    const chapter = (storyline?.nodes || []).find((n) => n.id === chapterId)
    const voiceId = resolveSpeakerVoiceId(chapter, storyline)
    if (!voiceId) throw new Error('이 캐릭터에 voiceId가 설정되지 않았습니다')
    const res = await api.post(`/admin/storylines/${id}/voice/generate`, {
      text,
      voiceId,
      emotion: 'NEUTRAL',
    })
    if (!res?.url) throw new Error('서버 응답에 url이 없습니다')
    updateScriptField(chapterId, scriptIndex, { voiceUrl: res.url })
    return res.url
  }

  // 일괄 보이스 생성 — 한 챕터의 character 모드 아이템 전부
  const [bulkVoiceProgress, setBulkVoiceProgress] = useState(null) // { done, total, failures: [{ idx, msg }] } | null
  async function bulkGenerateVoiceForChapter(chapterId, opts = {}) {
    const { overwrite = false } = opts
    const chapter = (storyline?.nodes || []).find((n) => n.id === chapterId)
    if (!chapter || chapter.nodeType !== 'CHAPTER') return
    const script = Array.isArray(chapter.script) ? chapter.script : []
    const targets = script
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.mode === 'character' && (overwrite || !it.voiceUrl))
    if (targets.length === 0) {
      setStatusMsg({ type: 'error', text: '생성할 character 아이템이 없습니다' })
      setTimeout(() => setStatusMsg(null), 2500)
      return
    }
    if (!confirm(`${targets.length}개 character 아이템에 보이스를 생성합니다. (실패한 행은 그대로 둡니다)`)) return
    const voiceId = resolveSpeakerVoiceId(chapter, storyline)
    if (!voiceId) {
      setStatusMsg({ type: 'error', text: '이 캐릭터에 voiceId가 설정되지 않았습니다' })
      setTimeout(() => setStatusMsg(null), 2500)
      return
    }
    setBulkVoiceProgress({ done: 0, total: targets.length, failures: [] })
    const failures = []
    let done = 0
    // 동시 3개 — ElevenLabs rate limit 보호
    const concurrency = 3
    let cursor = 0
    async function worker() {
      while (cursor < targets.length) {
        const myIdx = cursor++
        const { it, i } = targets[myIdx]
        try {
          await generateVoiceForItem(chapterId, i, it)
        } catch (e) {
          failures.push({ idx: i, msg: e?.data?.error || e?.message || '실패' })
        }
        done++
        setBulkVoiceProgress({ done, total: targets.length, failures: [...failures] })
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))
    if (failures.length === 0) {
      setStatusMsg({ type: 'success', text: `${targets.length}개 보이스 생성 완료` })
    } else {
      setStatusMsg({ type: 'error', text: `${targets.length - failures.length}개 성공 · ${failures.length}개 실패` })
    }
    setTimeout(() => {
      setStatusMsg(null)
      setBulkVoiceProgress(null)
    }, 3500)
  }

  const saveMeta = async () => {
    setSaving(true)
    setStatusMsg(null)
    try {
      // PUBLISHED로 전환 시도 시 placeholder 잔존 클라이언트 가드
      if (meta.status === 'PUBLISHED' && countPlaceholders(storyline) > 0) {
        throw new Error('PLACEHOLDER URL이 남아있어 PUBLISHED로 저장할 수 없습니다. 모든 슬롯의 미디어를 실제 URL로 교체해 주세요.')
      }
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
      setStatusMsg({ type: 'error', text: e?.data?.error || e?.message || '저장 실패' })
    } finally {
      setSaving(false)
      setTimeout(() => setStatusMsg(null), 4000)
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

  const placeholderCount = countPlaceholders(storyline)
  const hasPlaceholders = placeholderCount > 0
  const isPublished = storyline.status === 'PUBLISHED'

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
          onClick={() => setLibraryModal({ mode: 'manage' })}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded transition-colors"
          style={{ outline: 'none' }}
          title="이미지 라이브러리"
        >
          📁 라이브러리
        </button>
        {dirty && (
          <button
            onClick={saveAllChanges}
            disabled={saving}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
            style={{ outline: 'none' }}
          >
            {saving ? '저장 중...' : '💾 변경사항 저장'}
          </button>
        )}
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

      {/* PLACEHOLDER URL 경고 배너 */}
      {hasPlaceholders && (
        <div className={`mb-4 rounded-lg border ${isPublished ? 'bg-red-900/30 border-red-700/60' : 'bg-amber-900/30 border-amber-700/60'} p-3`}>
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${isPublished ? 'text-red-200' : 'text-amber-200'}`}>
                수정이 필요합니다! — {placeholderCount}개의 PLACEHOLDER URL
              </p>
              <p className={`text-[11px] mt-0.5 ${isPublished ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                트리 카드의 ⚠ 배지로 어느 챕터에 placeholder가 남아있는지 확인하세요. PUBLISHED 상태로 저장하려면 모두 교체되어야 합니다.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* 트리 탭 — detail 패널 열렸을 때 좌측 트리 360px 고정, 우측 패널 flex-1로 확장 */}
      {tab === 'tree' && (
        <div className="flex gap-4">
          <div className={selectedChapter ? 'w-[360px] flex-shrink-0 min-w-0' : 'flex-1 min-w-0'}>
            <StorylineTreeView
              storyline={storyline}
              selectedChapterId={selectedChapter?.id ?? null}
              onChapterClick={setSelectedChapter}
            />
          </div>
          {selectedChapter && (
            <div
              className="flex-1 min-w-0 sticky top-4 self-start"
              style={{ height: 'calc(100vh - 2rem)' }}
            >
              <ChapterDetailPanel
                chapter={selectedChapter}
                storyline={storyline}
                onClose={() => setSelectedChapter(null)}
                onChapterPatch={updateChapterField}
                onScriptFieldChange={updateScriptField}
                onInsertScriptItem={insertScriptItem}
                onRemoveScriptItem={removeScriptItem}
                onGenerateVoice={generateVoiceForItem}
                onBulkGenerateVoice={bulkGenerateVoiceForChapter}
                bulkVoiceProgress={bulkVoiceProgress}
                onOpenPicker={(opts) =>
                  setLibraryModal({
                    mode: 'pick',
                    kind: opts.kind,
                    pickContext: {
                      scriptLength: opts.scriptLength,
                      defaultIndex: opts.defaultIndex,
                    },
                    onPick: (url, indices) => {
                      // chatImage/chatVideo는 mode:'media' 아이템의 mediaUrl로 들어감
                      const isMediaKind = opts.kind === 'chatImage' || opts.kind === 'chatVideo'
                      const field = isMediaKind ? 'mediaUrl' : (SCRIPT_FIELD_BY_KIND[opts.kind] || 'backgroundImage')
                      for (const i of indices) {
                        updateScriptField(opts.chapterId, i, { [field]: url })
                      }
                      setLibraryModal(null)
                    },
                  })
                }
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
                <option value="PUBLISHED" disabled={hasPlaceholders}>
                  PUBLISHED (공개){hasPlaceholders ? ' — PLACEHOLDER 수정 후 가능' : ''}
                </option>
              </select>
              {meta.status === 'PUBLISHED' && hasPlaceholders && (
                <p className="text-[11px] text-red-400 mt-1.5">
                  ⚠️ PLACEHOLDER URL이 {placeholderCount}개 남아있어 저장 시 거부됩니다. 트리 탭에서 모두 교체해 주세요.
                </p>
              )}
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

      {/* 라이브러리 모달 (관리/피커 겸용) */}
      {libraryModal && (
        <AssetLibraryModal
          storylineId={parseInt(id)}
          assetLibrary={storyline.assetLibrary}
          onLibraryChange={applyLibraryUpdate}
          mode={libraryModal.mode}
          pickKind={libraryModal.kind}
          pickContext={libraryModal.pickContext}
          onPick={libraryModal.onPick}
          onClose={() => setLibraryModal(null)}
        />
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
                  {mode === 'media' && '📷'}
                  {cnt}
                </span>
              ))}
              {!isResult && countPlaceholdersInChapter(chapter) > 0 && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded bg-amber-700/90 text-white font-bold leading-none"
                  title="이 챕터에 PLACEHOLDER URL이 남아있습니다"
                >
                  ⚠ {countPlaceholdersInChapter(chapter)}개 수정 필요
                </span>
              )}
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
  media:     { icon: '📷', label: 'media',     bg: 'bg-pink-900/30',   text: 'text-pink-100' },
}

function ChapterDetailPanel({ chapter, storyline, onClose, onChapterPatch, onScriptFieldChange, onInsertScriptItem, onRemoveScriptItem, onOpenPicker, onGenerateVoice, onBulkGenerateVoice, bulkVoiceProgress }) {
  const isResult = chapter.nodeType === 'RESULT'
  const isChat = chapter.nodeType === 'CHAT'
  const script = Array.isArray(chapter.script) ? chapter.script : []
  const choices = Array.isArray(chapter.choices) ? chapter.choices : []
  const isBranch = chapter.branchFromChoiceId != null
  const editable = typeof onChapterPatch === 'function'
  const [lightbox, setLightbox] = useState(null) // { url, type: 'image'|'video'|'audio', label }

  // 일괄 보이스 생성 — CHAPTER 노드 + character 아이템 1개 이상일 때만 버튼 노출
  const characterItems = script.filter((it) => it.mode === 'character')
  const characterMissingVoice = characterItems.filter((it) => !it.voiceUrl).length
  const canBulkVoice = chapter.nodeType === 'CHAPTER' && characterItems.length > 0 && typeof onBulkGenerateVoice === 'function'
  const bulkActive = !!bulkVoiceProgress

  const positionLabel = isResult
    ? 'RESULT 노드'
    : `${isBranch ? '분기' : `메인 #${chapter.sortOrder + 1}`}`

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden flex flex-col h-full relative">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {/* nodeType 선택 — RESULT는 변경 불가 (script 구조가 다름) */}
            {!isResult && editable ? (
              <select
                value={chapter.nodeType}
                onChange={(e) => onChapterPatch(chapter.id, { nodeType: e.target.value })}
                className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-200 focus:border-indigo-500 focus:outline-none font-mono"
                style={{ outline: 'none' }}
                title="노드 타입 변경"
              >
                <option value="CHAPTER">📖 CHAPTER</option>
                <option value="CHAT">💬 CHAT</option>
              </select>
            ) : (
              <span className="text-[10px] text-gray-500 font-mono">
                {isResult ? '🏁 RESULT' : isChat ? '💬 CHAT' : '📖 CHAPTER'}
              </span>
            )}
            <span className="text-[10px] text-gray-500 font-mono">
              · {positionLabel} · id {chapter.id}
            </span>
          </div>
          <h3 className="text-sm font-bold text-white line-clamp-1">
            {isResult ? (chapter.resultTitle || '(제목 없음)') : getChapterPreview(chapter)}
          </h3>
        </div>
        {canBulkVoice && (
          <button
            onClick={() => onBulkGenerateVoice(chapter.id, { overwrite: characterMissingVoice === 0 })}
            disabled={bulkActive}
            className="px-2 py-1 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-[10px] rounded font-semibold whitespace-nowrap flex-shrink-0"
            style={{ outline: 'none' }}
            title={
              characterMissingVoice > 0
                ? `보이스 없는 ${characterMissingVoice}개 character 아이템에 일괄 생성`
                : `이미 모두 생성됨 — 클릭 시 ${characterItems.length}개 모두 재생성`
            }
          >
            {bulkActive
              ? `${bulkVoiceProgress.done}/${bulkVoiceProgress.total}`
              : characterMissingVoice > 0
                ? `🎤 일괄 (${characterMissingVoice})`
                : `🎤 전부 재생성`}
          </button>
        )}
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-lg flex-shrink-0"
          style={{ outline: 'none' }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 일괄 보이스 진행률 / 실패 결과 표시 */}
      {bulkActive && (
        <div className="px-4 py-2 border-b border-gray-700 bg-gray-950/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-pink-500 transition-all"
                style={{ width: `${(bulkVoiceProgress.done / bulkVoiceProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-300 font-mono">
              {bulkVoiceProgress.done}/{bulkVoiceProgress.total}
            </span>
          </div>
          {bulkVoiceProgress.failures.length > 0 && (
            <p className="text-[10px] text-red-400 mt-1">
              실패 {bulkVoiceProgress.failures.length}: {bulkVoiceProgress.failures.map((f) => `[${f.idx}]`).join(' ')}
            </p>
          )}
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2"
        onWheel={(e) => e.stopPropagation()}
      >
        {isResult ? (
          <>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">resultTitle</p>
              {editable ? (
                <input
                  type="text"
                  value={chapter.resultTitle || ''}
                  onChange={(e) => onChapterPatch(chapter.id, { resultTitle: e.target.value })}
                  placeholder="결말 제목"
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              ) : (
                <p className="text-sm text-white">{chapter.resultTitle || '(없음)'}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">resultBody</p>
              {editable ? (
                <textarea
                  value={chapter.resultBody || ''}
                  onChange={(e) => onChapterPatch(chapter.id, { resultBody: e.target.value })}
                  placeholder="결말 본문 (멀티라인)"
                  rows={6}
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-indigo-500 focus:outline-none whitespace-pre-line"
                />
              ) : (
                <p className="text-sm text-white whitespace-pre-line">{chapter.resultBody || '(없음)'}</p>
              )}
            </div>
          </>
        ) : (
          <>
            {script.length === 0 && (
              <div className="space-y-1">
                <p className="text-gray-500 text-xs">script가 비어 있습니다.</p>
                {typeof onInsertScriptItem === 'function' && (
                  <InsertGap onInsert={() => onInsertScriptItem(chapter.id, 0)} alwaysVisible />
                )}
              </div>
            )}
            {script.map((item, i) => (
              <Fragment key={i}>
                {typeof onInsertScriptItem === 'function' && (
                  <InsertGap onInsert={() => onInsertScriptItem(chapter.id, i)} />
                )}
                <ScriptItemRow
                  item={item}
                  index={i}
                  chapter={chapter}
                  storyline={storyline}
                  onMediaClick={setLightbox}
                  editable={typeof onScriptFieldChange === 'function'}
                  onFieldChange={(patch) => onScriptFieldChange && onScriptFieldChange(chapter.id, i, patch)}
                  onRemove={typeof onRemoveScriptItem === 'function' ? () => onRemoveScriptItem(chapter.id, i) : null}
                  onOpenPicker={(scriptIndex, kind, currentUrl) =>
                    onOpenPicker && onOpenPicker({
                      chapterId: chapter.id,
                      kind,
                      currentUrl,
                      scriptLength: script.length,
                      defaultIndex: scriptIndex,
                    })
                  }
                  onGenerateVoice={() => onGenerateVoice && onGenerateVoice(chapter.id, i, item)}
                />
              </Fragment>
            ))}
            {script.length > 0 && typeof onInsertScriptItem === 'function' && (
              <InsertGap onInsert={() => onInsertScriptItem(chapter.id, script.length)} alwaysVisible />
            )}

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

// 모드 변경 시 text↔content 마이그레이션 — 기존 텍스트가 새 필드로 옮겨가도록
function buildModeChangePatch(item, newMode) {
  if (!item || !newMode || item.mode === newMode) return { mode: newMode }
  const patch = { mode: newMode }
  if (item.mode === 'narration' && (newMode === 'character' || newMode === 'user')) {
    patch.content = item.text || item.content || ''
    patch.text = null
  } else if ((item.mode === 'character' || item.mode === 'user') && newMode === 'narration') {
    patch.text = item.content || item.text || ''
    patch.content = null
  }
  // 'media'로 전환: 텍스트 필드 정리 + variant 기본값 'normal'
  if (newMode === 'media') {
    patch.text = null
    patch.content = null
    patch.variant = item.variant || 'normal'
  }
  // 'media' → 다른 모드: media 관련 필드 정리
  if (item.mode === 'media' && newMode !== 'media') {
    patch.mediaUrl = null
    patch.variant = null
    patch.maskCost = null
  }
  return patch
}

// CHAT 노드의 mode:'media' 아이템 편집기 — variant + URL 피커 + maskCost
function MediaItemEditor({ item, storyline, editable, onFieldChange, onMediaClick, onOpenPicker, index }) {
  const variant = item.variant || 'normal'
  const isVideo = variant === 'video'
  const isPremium = variant === 'premium'
  const url = item.mediaUrl || null
  const lib = storyline?.assetLibrary || {}
  const bucket = isVideo ? (lib.chatVideo || []) : (lib.chatImage || [])
  const matched = url ? bucket.find((a) => a.url === url) : null
  const matchedIdx = matched ? bucket.indexOf(matched) : -1
  const inLibrary = !!matched

  const handleVariantChange = (v) => {
    const patch = { variant: v }
    // variant 전환 시 URL은 유지하되, 영상↔이미지 전환이면 URL 비우기 (소스 다름)
    const wasVideo = variant === 'video'
    const willBeVideo = v === 'video'
    if (wasVideo !== willBeVideo) patch.mediaUrl = null
    // premium이 아니면 maskCost 정리
    if (v !== 'premium') patch.maskCost = null
    // premium 신규 설정 시 기본 비용
    if (v === 'premium' && (!item.maskCost || item.maskCost <= 0)) patch.maskCost = 5
    onFieldChange && onFieldChange(patch)
  }

  const openPicker = () => {
    if (!onOpenPicker) return
    onOpenPicker(index, isVideo ? 'chatVideo' : 'chatImage', url)
  }

  return (
    <div className="mb-2 space-y-1.5">
      {/* variant 선택 (3개 라디오 스타일 버튼) */}
      {editable && (
        <div className="flex gap-1">
          {[
            { value: 'normal', label: '일반' },
            { value: 'premium', label: '프리미엄' },
            { value: 'video', label: '영상' },
          ].map((v) => (
            <button
              key={v.value}
              onClick={() => handleVariantChange(v.value)}
              className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                variant === v.value
                  ? 'bg-pink-600 border-pink-500 text-white font-semibold'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
              style={{ outline: 'none' }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* 미디어 미리보기 + 변경/삭제 + 라이브러리 매칭 */}
      <div className="flex items-start gap-2">
        <div
          className={`relative w-20 aspect-[9/16] flex-shrink-0 rounded overflow-hidden border ${isPlaceholderUrl(url) ? 'bg-amber-900/40 border-amber-600' : 'bg-gray-800 border-gray-700'}`}
          onClick={() => url && !isPlaceholderUrl(url) && onMediaClick && onMediaClick({ url, type: isVideo ? 'video' : 'image', label: variant })}
          style={{ cursor: url && !isPlaceholderUrl(url) ? 'pointer' : 'default' }}
        >
          {isPlaceholderUrl(url) ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-300 text-[10px] font-bold leading-tight px-1 text-center">
              <span className="text-xl">⚠️</span>
              <span>수정 필요</span>
            </div>
          ) : url ? (
            isVideo ? (
              <video src={url} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline preload="metadata" />
            ) : (
              <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-[10px]">∅</div>
          )}
          {inLibrary && !isPlaceholderUrl(url) && (
            <div className="absolute top-0.5 left-0.5 px-1 py-0 rounded bg-indigo-600/90 text-white text-[9px] leading-tight font-bold pointer-events-none">
              #{matchedIdx}
            </div>
          )}
          {isPremium && url && !isPlaceholderUrl(url) && (
            <div className="absolute bottom-0.5 left-0.5 right-0.5 px-1 py-0.5 rounded bg-amber-600/90 text-white text-[9px] leading-none font-bold text-center pointer-events-none">
              PRM
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          {editable && (
            <div className="flex gap-1.5 items-center">
              <button
                onClick={openPicker}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded font-medium"
                style={{ outline: 'none' }}
              >
                {url ? '변경' : '추가'}
              </button>
              {url && (
                <button
                  onClick={() => onFieldChange && onFieldChange({ mediaUrl: null })}
                  className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] rounded font-medium"
                  style={{ outline: 'none' }}
                >
                  삭제
                </button>
              )}
              <span className="text-[10px] text-gray-500">{isVideo ? '🎬 영상' : '📷 이미지'}</span>
            </div>
          )}
          {isPlaceholderUrl(url) && (
            <p className="text-[10px] text-amber-300 font-mono truncate" title={url}>{url}</p>
          )}
          {!isPlaceholderUrl(url) && url && matched?.label && (
            <p className="text-[10px] text-gray-300 truncate" title={matched.label}>{matched.label}</p>
          )}
          {!isPlaceholderUrl(url) && url && !inLibrary && (
            <p className="text-[10px] text-amber-400" title="라이브러리 외부 URL">⚠ 외부 URL</p>
          )}
          {/* 프리미엄: maskCost 입력 */}
          {isPremium && (
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-gray-400 whitespace-nowrap">해금 비용</label>
              <input
                type="number"
                min="1"
                value={item.maskCost ?? ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  onFieldChange && onFieldChange({ maskCost: Number.isNaN(v) ? null : v })
                }}
                className="w-16 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-200 focus:border-indigo-500 focus:outline-none"
                disabled={!editable}
              />
              <span className="text-[10px] text-gray-500">마스크</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 요소 사이에 마우스 올리면 노출되는 "+ 추가" 버튼
function InsertGap({ onInsert, alwaysVisible = false }) {
  return (
    <div
      className={`relative flex items-center justify-center group ${alwaysVisible ? 'h-7' : 'h-2 hover:h-7 transition-[height] duration-150'}`}
    >
      <div
        className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-px ${alwaysVisible ? 'bg-gray-700/40' : 'bg-transparent group-hover:bg-indigo-500/30 transition-colors'}`}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onInsert && onInsert() }}
        className={`relative z-10 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded font-semibold leading-none ${
          alwaysVisible ? 'opacity-80 hover:opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'
        }`}
        style={{ outline: 'none' }}
        title="새 요소 추가"
      >
        + 추가
      </button>
    </div>
  )
}

function ScriptItemRow({ item, index, storyline, chapter, onMediaClick, editable = false, onFieldChange, onRemove, onOpenPicker, onGenerateVoice }) {
  const meta = MODE_META[item.mode] || MODE_META.narration
  const cgImage = item.mode === 'cg'
    ? (storyline?.images || []).find((img) => img.id === item.storyImageId || img.tempId === item.storyImageId)
    : null

  // 보이스 슬롯 노출 조건: CHAPTER 노드 + character 모드
  const voiceEligible = chapter?.nodeType === 'CHAPTER' && item.mode === 'character'
  const voiceId = voiceEligible ? resolveSpeakerVoiceId(chapter, storyline) : null

  // 편집 불가 미디어 (full/attach/voice)
  const otherMedias = []
  if (item.fullMediaUrl) otherMedias.push({ url: item.fullMediaUrl, type: item.fullMediaType === 'video' ? 'video' : 'image', label: '📺 full', aspect: '9:16' })
  if (item.mediaUrl) otherMedias.push({ url: item.mediaUrl, type: item.mediaType === 'video' ? 'video' : 'image', label: '📎 attach', aspect: '9:16' })

  return (
    <div className={`rounded-lg p-3 ${meta.bg}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs">{meta.icon}</span>
        <span className="text-[10px] text-gray-400 font-mono">[{index}] {meta.label}</span>
        {editable && typeof onRemove === 'function' && (
          <button
            onClick={() => {
              if (confirm(`이 [${index}] ${meta.label} 요소를 삭제할까요?`)) onRemove()
            }}
            className="ml-auto px-1.5 py-0.5 bg-red-900/50 hover:bg-red-700 text-red-300 hover:text-white text-[10px] rounded leading-none transition-colors"
            style={{ outline: 'none' }}
            title="이 요소 삭제"
          >
            ✕
          </button>
        )}
      </div>

      {/* 모드 선택 dropdown — editable일 때, 텍스트/미디어 모드들에 공통 */}
      {editable && (item.mode === 'narration' || item.mode === 'character' || item.mode === 'user' || item.mode === 'media') && (
        <div className="mb-2">
          <select
            value={item.mode}
            onChange={(e) => onFieldChange && onFieldChange(buildModeChangePatch(item, e.target.value))}
            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-200 focus:border-indigo-500 focus:outline-none font-mono"
            style={{ outline: 'none' }}
            title="요소 타입 변경"
          >
            <option value="narration">📖 narration</option>
            <option value="character">💬 character</option>
            <option value="user">👤 user</option>
            {/* media는 CHAT 노드에서만 노출 */}
            {chapter?.nodeType === 'CHAT' && <option value="media">📷 media</option>}
          </select>
        </div>
      )}

      {/* 텍스트 본문 — narration/character/user */}
      {(item.mode === 'narration' || item.mode === 'character' || item.mode === 'user') && (
        <div className="mb-2 space-y-1">
          {editable ? (
            <textarea
              value={(item.mode === 'narration' ? item.text : item.content) || ''}
              onChange={(e) => {
                const field = item.mode === 'narration' ? 'text' : 'content'
                onFieldChange && onFieldChange({ [field]: e.target.value })
              }}
              placeholder={
                item.mode === 'narration' ? '내레이션 텍스트'
                : item.mode === 'user' ? '유저 발화'
                : '캐릭터 발화'
              }
              rows={2}
              className={`w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm whitespace-pre-line focus:border-indigo-500 focus:outline-none ${meta.text}`}
              style={{ resize: 'vertical' }}
            />
          ) : (
            <>
              {item.mode === 'narration' && item.text && (
                <p className={`text-sm whitespace-pre-line ${meta.text}`}>{item.text}</p>
              )}
              {(item.mode === 'character' || item.mode === 'user') && (
                <>
                  {item.name && <p className="text-[10px] text-gray-400 mb-0.5">{item.name}</p>}
                  {item.content && <p className={`text-sm whitespace-pre-line ${meta.text}`}>{item.content}</p>}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* 미디어 본문 — variant + URL 피커 + maskCost */}
      {item.mode === 'media' && (
        <MediaItemEditor
          item={item}
          storyline={storyline}
          editable={editable}
          onFieldChange={onFieldChange}
          onMediaClick={onMediaClick}
          onOpenPicker={onOpenPicker}
          index={index}
        />
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

      {/* 배경 + 캐릭터 이미지 슬롯
         CHAPTER 노드: 항상 노출 (편집 흐름의 핵심)
         CHAT 노드: 값이 들어있을 때만 노출 (외부 JSON으로 들어온 placeholder/잔존 데이터 정리용) */}
      {item.mode !== 'cg' && (() => {
        const isChat = chapter?.nodeType === 'CHAT'
        const showBg = !isChat || item.backgroundImage != null
        const showChar = !isChat || item.characterImage != null
        if (!showBg && !showChar) return null
        return (
          <div className="flex gap-2 mb-2">
            {showBg && (
              <EditableImageSlot
                kind="background"
                label="🏞 배경"
                url={item.backgroundImage}
                storyline={storyline}
                onMediaClick={onMediaClick}
                editable={editable}
                onPick={() => onOpenPicker && onOpenPicker(index, 'background', item.backgroundImage)}
                onClear={() => onFieldChange && onFieldChange({ backgroundImage: null })}
              />
            )}
            {showChar && (
              <EditableImageSlot
                kind="character"
                label="👤 캐릭터"
                url={item.characterImage}
                storyline={storyline}
                onMediaClick={onMediaClick}
                editable={editable}
                onPick={() => onOpenPicker && onOpenPicker(index, 'character', item.characterImage)}
                onClear={() => onFieldChange && onFieldChange({ characterImage: null })}
              />
            )}
          </div>
        )
      })()}

      {/* BGM + BGS 슬롯
         CHAPTER: 항상 노출
         CHAT: 값이 들어있을 때만 노출 */}
      {item.mode !== 'cg' && (() => {
        const isChat = chapter?.nodeType === 'CHAT'
        const showBgm = !isChat || item.bgmUrl != null
        const showBgs = !isChat || item.bgsUrl != null
        const showVoice = voiceEligible // 이미 'CHAPTER + character'만 true
        if (!showBgm && !showBgs && !showVoice) return null
        return (
          <div className="flex flex-col gap-1 mb-2">
            {showBgm && (
              <EditableAudioSlot
                kind="bgm"
                label="🎵 BGM"
                url={item.bgmUrl}
                storyline={storyline}
                onMediaClick={onMediaClick}
                editable={editable}
                onPick={() => onOpenPicker && onOpenPicker(index, 'bgm', item.bgmUrl)}
                onClear={() => onFieldChange && onFieldChange({ bgmUrl: null })}
              />
            )}
            {showBgs && (
              <EditableAudioSlot
                kind="bgs"
                label="🌧️ BGS"
                url={item.bgsUrl}
                storyline={storyline}
                onMediaClick={onMediaClick}
                editable={editable}
                onPick={() => onOpenPicker && onOpenPicker(index, 'bgs', item.bgsUrl)}
                onClear={() => onFieldChange && onFieldChange({ bgsUrl: null })}
              />
            )}
            {showVoice && (
              <EditableVoiceSlot
                url={item.voiceUrl}
                voiceId={voiceId}
                text={item.content}
                onMediaClick={onMediaClick}
                editable={editable}
                onGenerate={onGenerateVoice}
                onClear={() => onFieldChange && onFieldChange({ voiceUrl: null })}
              />
            )}
          </div>
        )
      })()}

      {/* 그 외 미디어 (변경 불가, 표시만) */}
      {otherMedias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {otherMedias.map((m, i) => (
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

// URL/라이브러리 항목으로부터 영상 여부 판별
function detectIsVideo(url, libraryItem) {
  if (!url) return false
  if (libraryItem?.mediaType === 'video') return true
  if (libraryItem?.mediaType === 'image') return false
  const cleaned = url.split(/[?#]/)[0].toLowerCase()
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(cleaned)
}

// bg/character 슬롯 — 작은 9:16 썸네일 + 변경/삭제 버튼 + 라이브러리 매칭 정보
// background는 영상도 허용 (video 썸네일).
function EditableImageSlot({ kind, label, url, storyline, onMediaClick, editable, onPick, onClear }) {
  const lib = storyline?.assetLibrary || { backgrounds: [], characters: [] }
  const bucket = kind === 'character' ? (lib.characters || []) : (lib.backgrounds || [])
  const matchedIdx = url ? bucket.findIndex((a) => a.url === url) : -1
  const matched = matchedIdx >= 0 ? bucket[matchedIdx] : null
  const inLibrary = matchedIdx >= 0
  const placeholder = isPlaceholderUrl(url)
  const isVideo = kind === 'background' && !placeholder && detectIsVideo(url, matched)

  return (
    <div className="flex items-start gap-1.5">
      <div className={`relative group rounded ${placeholder ? 'bg-amber-900/40 border-amber-600' : 'bg-gray-800 border-gray-700'} border w-12 aspect-[9/16] flex-shrink-0 overflow-hidden`}>
        {placeholder ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-300 text-[9px] font-bold leading-tight px-0.5 text-center">
            <span className="text-base">⚠️</span>
            <span>수정<br/>필요</span>
          </div>
        ) : url ? (
          <button
            onClick={() => onMediaClick({ url, type: isVideo ? 'video' : 'image', label })}
            className="absolute inset-0 w-full h-full"
            style={{ outline: 'none' }}
            title={matched?.label || label}
          >
            {isVideo ? (
              <video src={url} className="w-full h-full object-cover" muted loop playsInline preload="metadata"
                onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
              />
            ) : (
              <img src={url} alt="" className="w-full h-full object-cover" />
            )}
          </button>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-[10px]">∅</div>
        )}
        {/* 영상 표시자 */}
        {isVideo && (
          <div className="absolute top-0.5 right-0.5 px-1 py-0 rounded bg-pink-600/90 text-white text-[8px] leading-tight font-bold pointer-events-none">
            🎬
          </div>
        )}

        {/* 매칭 인덱스 표시 (좌상단) */}
        {inLibrary && !placeholder && (
          <div className="absolute top-0.5 left-0.5 px-1 py-0 rounded bg-indigo-600/90 text-white text-[9px] leading-tight font-bold pointer-events-none">
            #{matchedIdx}
          </div>
        )}

        {/* 편집 액션 — editable일 때만 hover 시 노출 */}
        {editable && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/65 transition-colors flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              onClick={onPick}
              className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] rounded leading-none font-medium"
              style={{ outline: 'none' }}
            >
              {url ? '변경' : '추가'}
            </button>
            {url && (
              <button
                onClick={onClear}
                className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[9px] rounded leading-none font-medium"
                style={{ outline: 'none' }}
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>

      {/* 우측: 라벨 + 라이브러리 매칭 정보 */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[10px] text-gray-400 leading-tight truncate">{label}</p>
        {placeholder && (
          <p className="text-[9px] text-amber-300 leading-tight truncate mt-0.5 font-mono" title={url}>{url}</p>
        )}
        {!placeholder && url && matched?.label && (
          <p className="text-[10px] text-gray-300 leading-tight truncate mt-0.5" title={matched.label}>{matched.label}</p>
        )}
        {!placeholder && url && !inLibrary && (
          <p className="text-[9px] text-amber-400 leading-tight truncate mt-0.5" title="라이브러리 외부 URL">⚠ 외부</p>
        )}
      </div>
    </div>
  )
}

// bgm/bgs 슬롯 — 컴팩트 오디오 바 + 변경/삭제 버튼 + 라이브러리 매칭 정보
function EditableAudioSlot({ kind, label, url, storyline, onMediaClick, editable, onPick, onClear }) {
  const lib = storyline?.assetLibrary || {}
  const bucket = kind === 'bgm' ? (lib.bgm || []) : (lib.bgs || [])
  const matchedIdx = url ? bucket.findIndex((a) => a.url === url) : -1
  const matched = matchedIdx >= 0 ? bucket[matchedIdx] : null
  const inLibrary = matchedIdx >= 0
  const placeholder = isPlaceholderUrl(url)
  const accent = placeholder
    ? 'border-amber-600 bg-amber-900/40'
    : kind === 'bgm' ? 'border-purple-700/50 bg-purple-950/30' : 'border-cyan-700/50 bg-cyan-950/30'

  return (
    <div className={`flex items-center gap-1.5 rounded border ${accent} px-2 py-1 min-h-[28px]`}>
      <span className="text-[10px] text-gray-300 leading-tight whitespace-nowrap font-medium">{label}</span>
      {inLibrary && !placeholder && (
        <span className="px-1 rounded bg-indigo-600/90 text-white text-[9px] leading-none font-bold flex-shrink-0">
          #{matchedIdx}
        </span>
      )}
      <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0" title={matched?.label || url || ''}>
        {placeholder
          ? <span className="text-amber-300 font-bold">⚠️ 수정 필요 — {url}</span>
          : url
            ? (matched?.label || (inLibrary ? '(라벨 없음)' : '⚠ 외부 URL'))
            : <span className="text-gray-600">(없음)</span>
        }
      </span>
      {url && !placeholder && (
        <button
          onClick={() => onMediaClick({ url, type: 'audio', label })}
          className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[9px] rounded leading-none flex-shrink-0"
          style={{ outline: 'none' }}
          title="재생"
        >
          ▶
        </button>
      )}
      {editable && (
        <>
          <button
            onClick={onPick}
            className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] rounded leading-none font-medium flex-shrink-0"
            style={{ outline: 'none' }}
          >
            {url ? '변경' : '추가'}
          </button>
          {url && (
            <button
              onClick={onClear}
              className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[9px] rounded leading-none font-medium flex-shrink-0"
              style={{ outline: 'none' }}
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  )
}

// 보이스 슬롯 — character 모드 ScriptItem에 ElevenLabs TTS 결과 부착
// onGenerate: 클릭 시 부모가 서버 호출 → 완료되면 voiceUrl 갱신. 컴포넌트는 isGenerating 로컬 상태만 관리.
function EditableVoiceSlot({ url, voiceId, text, onMediaClick, editable, onGenerate, onClear }) {
  const [generating, setGenerating] = useState(false)
  const [errMsg, setErrMsg] = useState(null)

  const noVoiceId = !voiceId
  const noText = !text || !String(text).trim()
  const disabledReason =
    noVoiceId ? '캐릭터에 voiceId가 설정되지 않음'
    : noText ? '텍스트가 비어있음'
    : null

  const handleClick = async () => {
    if (!onGenerate || disabledReason) return
    setGenerating(true)
    setErrMsg(null)
    try {
      await onGenerate()
    } catch (e) {
      const msg = e?.data?.error || e?.message || '생성 실패'
      setErrMsg(msg)
      setTimeout(() => setErrMsg(null), 4000)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded border border-pink-700/50 bg-pink-950/30 px-2 py-1 min-h-[28px]">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-300 leading-tight whitespace-nowrap font-medium">🎤 voice</span>
        <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0">
          {url
            ? <span className="text-gray-300">생성됨</span>
            : <span className="text-gray-600">{disabledReason || '(없음)'}</span>
          }
        </span>
        {url && (
          <button
            onClick={() => onMediaClick({ url, type: 'audio', label: '🎤 voice' })}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[9px] rounded leading-none flex-shrink-0"
            style={{ outline: 'none' }}
            title="재생"
          >
            ▶
          </button>
        )}
        {editable && (
          <>
            <button
              onClick={handleClick}
              disabled={generating || !!disabledReason}
              className="px-1.5 py-0.5 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-[9px] rounded leading-none font-medium flex-shrink-0"
              style={{ outline: 'none' }}
              title={disabledReason || (url ? '재생성' : '생성')}
            >
              {generating ? '...' : (url ? '↻ 재생성' : '🎙 생성')}
            </button>
            {url && (
              <button
                onClick={onClear}
                className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[9px] rounded leading-none font-medium flex-shrink-0"
                style={{ outline: 'none' }}
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>
      {errMsg && (
        <p className="text-[10px] text-red-400 mt-1 leading-tight">{errMsg}</p>
      )}
    </div>
  )
}
