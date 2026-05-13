import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

const GIFT_TAGS = [{ key: 'OUTFIT', label: '의상' }]
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

export default function CharacterGifts() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [character, setCharacter] = useState(null)
  const [gifts, setGifts] = useState([])
  const [tagFilter, setTagFilter] = useState('OUTFIT')

  // 생성 모달
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', tag: 'OUTFIT', maskCost: 10, sortOrder: 0 })
  const [newImage, setNewImage] = useState(null)
  const [newPreview, setNewPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const newImageRef = useRef(null)

  // 상세 모달
  const [detail, setDetail] = useState(null) // selected gift
  const [editForm, setEditForm] = useState({})
  const [thumbReplaceFile, setThumbReplaceFile] = useState(null)
  const [thumbReplacePreview, setThumbReplacePreview] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [addingContents, setAddingContents] = useState(false)
  const editThumbRef = useRef(null)
  const contentFileRef = useRef(null)

  // 드래그앤드랍 hover 상태
  const [dragOverNewThumb, setDragOverNewThumb] = useState(false)
  const [dragOverEditThumb, setDragOverEditThumb] = useState(false)
  const [dragOverContents, setDragOverContents] = useState(false)

  useEffect(() => {
    api.get('/admin/characters').then(({ characters }) => {
      const c = characters.find((ch) => ch.id === parseInt(id))
      setCharacter(c)
    })
    loadGifts()
  }, [id])

  const loadGifts = () =>
    api.get(`/admin/characters/${id}/gifts`).then(({ gifts }) => setGifts(gifts || []))

  const refreshDetail = async (giftId) => {
    const { gifts: all } = await api.get(`/admin/characters/${id}/gifts`)
    setGifts(all || [])
    const found = all?.find((g) => g.id === giftId)
    setDetail(found || null)
  }

  const filtered = gifts.filter((g) => g.tag === tagFilter)

  // ── 생성 ───────────────────────────────────────────
  const openCreate = () => {
    setNewForm({ name: '', tag: tagFilter, maskCost: 10, sortOrder: 0 })
    setNewImage(null)
    setNewPreview(null)
    setCreating(true)
  }

  const onNewImageChange = (file) => {
    if (!file) return
    setNewImage(file)
    setNewPreview(URL.createObjectURL(file))
  }

  const handleCreate = async () => {
    if (!newForm.name.trim()) return alert('이름을 입력하세요')
    if (!newImage) return alert('썸네일 이미지를 선택하세요')

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('image', newImage)
      fd.append('name', newForm.name.trim())
      fd.append('tag', newForm.tag)
      fd.append('maskCost', String(newForm.maskCost))
      fd.append('sortOrder', String(newForm.sortOrder))
      const res = await fetch(`${API_BASE}/admin/characters/${id}/gifts`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setGifts((prev) => [...prev, data.gift])
      setCreating(false)
    } catch (e) {
      console.error(e)
      alert('생성 실패: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── 상세/수정 ───────────────────────────────────────
  // 활성화 상태: 'OFF' | 'PUBLIC' | 'ADMIN'
  const giftStatus = (g) => {
    if (!g?.isActive) return 'OFF'
    return g.adminOnly ? 'ADMIN' : 'PUBLIC'
  }

  const openDetail = (gift) => {
    setDetail(gift)
    setEditForm({
      name: gift.name,
      tag: gift.tag,
      maskCost: gift.maskCost,
      sortOrder: gift.sortOrder,
      status: giftStatus(gift),
    })
    setThumbReplaceFile(null)
    setThumbReplacePreview(null)
  }

  const closeDetail = () => {
    setDetail(null)
    setThumbReplaceFile(null)
    setThumbReplacePreview(null)
  }

  const onThumbReplace = (file) => {
    if (!file) return
    setThumbReplaceFile(file)
    setThumbReplacePreview(URL.createObjectURL(file))
  }

  const saveEdit = async () => {
    if (!detail) return
    setSavingEdit(true)
    try {
      const fd = new FormData()
      fd.append('name', editForm.name)
      fd.append('tag', editForm.tag)
      fd.append('maskCost', String(editForm.maskCost))
      fd.append('sortOrder', String(editForm.sortOrder))
      // status → isActive + adminOnly 두 필드로 매핑
      fd.append('isActive', String(editForm.status !== 'OFF'))
      fd.append('adminOnly', String(editForm.status === 'ADMIN'))
      if (thumbReplaceFile) fd.append('image', thumbReplaceFile)
      const res = await fetch(`${API_BASE}/admin/gifts/${detail.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      await refreshDetail(detail.id)
      setThumbReplaceFile(null)
      setThumbReplacePreview(null)
    } catch (e) {
      console.error(e)
      alert('수정 실패: ' + e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const removeGift = async () => {
    if (!detail) return
    if (!confirm(`"${detail.name}" 선물을 삭제하시겠습니까? 해금 콘텐츠와 유저 기록도 함께 삭제됩니다.`)) return
    await api.delete(`/admin/gifts/${detail.id}`)
    closeDetail()
    loadGifts()
  }

  // ── 해금 콘텐츠 추가/삭제 ─────────────────────────────
  const addContents = async (files) => {
    if (!detail || files.length === 0) return
    setAddingContents(true)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      const res = await fetch(`${API_BASE}/admin/gifts/${detail.id}/contents`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      await refreshDetail(detail.id)
    } catch (e) {
      console.error(e)
      alert('업로드 실패: ' + e.message)
    } finally {
      setAddingContents(false)
      if (contentFileRef.current) contentFileRef.current.value = ''
    }
  }

  const removeContent = async (contentId) => {
    if (!confirm('이 콘텐츠를 삭제하시겠습니까?')) return
    await api.delete(`/admin/gift-contents/${contentId}`)
    if (detail) await refreshDetail(detail.id)
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/characters')} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
            ← 뒤로
          </button>
          <h1 className="text-xl font-bold text-white">{character?.name || '...'} — 선물 관리</h1>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 새 선물
        </button>
      </div>

      {/* 태그 필터 */}
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
        {GIFT_TAGS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTagFilter(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tagFilter === t.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">({gifts.filter((g) => g.tag === t.key).length})</span>
          </button>
        ))}
      </div>

      {/* 그리드 */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12">등록된 선물이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((g) => (
            <div
              key={g.id}
              className={`bg-gray-800 rounded-xl overflow-hidden border cursor-pointer transition-colors ${
                g.isActive && g.adminOnly
                  ? 'border-amber-600/60 hover:border-amber-500'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
              onClick={() => openDetail(g)}
            >
              <div className="aspect-square relative">
                <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                {!g.isActive && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-xs text-gray-300 bg-black/70 px-2 py-1 rounded">비활성</span>
                  </div>
                )}
                {g.isActive && g.adminOnly && (
                  <div className="absolute top-2 left-2 bg-amber-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                    어드민 전용
                  </div>
                )}
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span>🎭</span>
                  <span>{g.maskCost}</span>
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm text-white font-medium truncate">{g.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  해금 콘텐츠 {g.contents?.length || 0}개
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 생성 모달 */}
      {creating && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => !submitting && setCreating(false)}>
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white mb-4">새 선물 등록</h3>

            <div className="space-y-3">
              {/* 썸네일 1:1 */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">썸네일 이미지 (1:1)</label>
                <input
                  ref={newImageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onNewImageChange(e.target.files?.[0])}
                />
                <div
                  onClick={() => newImageRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverNewThumb(true)
                  }}
                  onDragLeave={() => setDragOverNewThumb(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverNewThumb(false)
                    const file = Array.from(e.dataTransfer.files || []).find((f) =>
                      f.type.startsWith('image/'),
                    )
                    if (file) onNewImageChange(file)
                  }}
                  className={`aspect-square w-32 mx-auto bg-gray-800 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer overflow-hidden transition-colors ${
                    dragOverNewThumb
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {newPreview ? (
                    <img src={newPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-500 text-center px-2">
                      클릭 또는 드래그
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">이름</label>
                <input
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="예: 봄꽃 원피스"
                  className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">태그</label>
                  <select
                    value={newForm.tag}
                    onChange={(e) => setNewForm({ ...newForm, tag: e.target.value })}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  >
                    {GIFT_TAGS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">마스크 비용</label>
                  <input
                    type="number"
                    min="0"
                    value={newForm.maskCost}
                    onChange={(e) => setNewForm({ ...newForm, maskCost: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">정렬 순서</label>
                <input
                  type="number"
                  value={newForm.sortOrder}
                  onChange={(e) => setNewForm({ ...newForm, sortOrder: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {newForm.tag === 'OUTFIT' && (
                <p className="text-[10px] text-gray-500">
                  💡 의상 변경 시 선물 이름과 동일한 이름의 CharacterStyle로 변경됩니다.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setCreating(false)}
                disabled={submitting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {submitting ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={closeDetail}>
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-bold text-white">선물 상세</h3>
              <button onClick={closeDetail} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 메타 편집 */}
            <div className="px-5 py-4 border-b border-gray-800">
              <div className="flex gap-4">
                {/* 썸네일 */}
                <div>
                  <input
                    ref={editThumbRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onThumbReplace(e.target.files?.[0])}
                  />
                  <div
                    onClick={() => editThumbRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverEditThumb(true)
                    }}
                    onDragLeave={() => setDragOverEditThumb(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverEditThumb(false)
                      const file = Array.from(e.dataTransfer.files || []).find((f) =>
                        f.type.startsWith('image/'),
                      )
                      if (file) onThumbReplace(file)
                    }}
                    className={`w-32 aspect-square bg-gray-800 border-2 ${
                      dragOverEditThumb ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700'
                    } rounded-xl overflow-hidden cursor-pointer transition-colors`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <img
                      src={thumbReplacePreview || detail.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 text-center mt-1">클릭 또는 드래그</p>
                </div>

                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">이름</label>
                    <input
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">태그</label>
                      <select
                        value={editForm.tag || 'OUTFIT'}
                        onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })}
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                      >
                        {GIFT_TAGS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">마스크 비용</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.maskCost ?? 10}
                        onChange={(e) => setEditForm({ ...editForm, maskCost: parseInt(e.target.value) || 0 })}
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">정렬 순서</label>
                    <input
                      type="number"
                      value={editForm.sortOrder ?? 0}
                      onChange={(e) => setEditForm({ ...editForm, sortOrder: parseInt(e.target.value) || 0 })}
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  {editForm.tag === 'OUTFIT' && (
                    <p className="text-[10px] text-gray-500">
                      💡 의상 변경 시 선물 이름("{editForm.name}")과 동일한 이름의 CharacterStyle로 변경됩니다.
                    </p>
                  )}
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">노출 모드</label>
                    <div className="grid grid-cols-3 gap-1 bg-gray-700 p-1 rounded">
                      {[
                        { key: 'OFF', label: '비활성', activeCls: 'bg-gray-600 text-white' },
                        { key: 'PUBLIC', label: '활성', activeCls: 'bg-emerald-600 text-white' },
                        { key: 'ADMIN', label: '어드민 활성화', activeCls: 'bg-amber-600 text-white' },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setEditForm({ ...editForm, status: opt.key })}
                          className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                            editForm.status === opt.key ? opt.activeCls : 'text-gray-400 hover:text-white'
                          }`}
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      어드민 활성화: 어드민 계정에서만 채팅 페이지에 노출 (테스트용)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={removeGift}
                  className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  삭제
                </button>
                <button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {savingEdit ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>

            {/* 해금 콘텐츠 */}
            <div
              className={`px-5 py-4 transition-colors ${
                dragOverContents ? 'bg-indigo-500/10' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                if (!addingContents) setDragOverContents(true)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return
                setDragOverContents(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverContents(false)
                if (addingContents) return
                const files = Array.from(e.dataTransfer.files || []).filter(
                  (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
                )
                if (files.length > 0) addContents(files)
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-white">해금 콘텐츠 ({detail.contents?.length || 0}개)</p>
                <button
                  onClick={() => contentFileRef.current?.click()}
                  disabled={addingContents}
                  className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {addingContents ? '업로드 중...' : '+ 이미지/동영상 추가'}
                </button>
                <input
                  ref={contentFileRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addContents(Array.from(e.target.files || []))}
                />
              </div>

              {(!detail.contents || detail.contents.length === 0) ? (
                <div
                  className={`text-center py-8 text-xs border-2 border-dashed rounded-lg transition-colors ${
                    dragOverContents
                      ? 'border-indigo-500 text-indigo-300'
                      : 'border-gray-700 text-gray-500'
                  }`}
                >
                  {dragOverContents
                    ? '여기에 놓아 업로드'
                    : '선물 시 해금될 콘텐츠를 추가하세요 (이미지 또는 동영상 · 드래그앤드랍 지원)'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.contents.map((c) => (
                      <div key={c.id} className="relative aspect-square rounded-lg overflow-hidden group bg-gray-800">
                        {c.type === 'VIDEO' ? (
                          <video src={c.filePath} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={c.filePath} alt="" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded uppercase">
                          {c.type}
                        </div>
                        <button
                          onClick={() => removeContent(c.id)}
                          className="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  {dragOverContents && (
                    <div className="mt-2 text-center py-3 text-xs border-2 border-dashed border-indigo-500 text-indigo-300 rounded-lg">
                      여기에 놓아 업로드
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
