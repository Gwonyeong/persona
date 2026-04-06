import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

export default function CharacterGallery() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState(null)
  const [tab, setTab] = useState('AFFINITY')
  const [galleryContents, setGalleryContents] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [pendingPreviews, setPendingPreviews] = useState([])
  const [form, setForm] = useState({ title: '', description: '', affinityThreshold: 0, missionKey: '', missionName: '' })
  const [detailContent, setDetailContent] = useState(null) // 상세 모달
  const [addingImages, setAddingImages] = useState(false)
  const [modalDragging, setModalDragging] = useState(false)
  const [editingDetail, setEditingDetail] = useState(false)
  const [detailEditForm, setDetailEditForm] = useState({})
  const fileRef = useRef(null)
  const modalFileRef = useRef(null)
  const dragCounter = useRef(0)
  const modalDragCounter = useRef(0)

  useEffect(() => {
    api.get('/admin/characters').then(({ characters }) => {
      const c = characters.find((ch) => ch.id === parseInt(id))
      setCharacter(c)
    })
    loadGallery()
  }, [id])

  const loadGallery = () =>
    api.get(`/admin/characters/${id}/gallery`).then(({ galleryContents }) => setGalleryContents(galleryContents || []))

  const refreshDetail = async (contentId) => {
    const { galleryContents: all } = await api.get(`/admin/characters/${id}/gallery`)
    setGalleryContents(all || [])
    const found = all?.find((c) => c.id === contentId)
    if (found) setDetailContent(found)
    else setDetailContent(null)
  }

  const filtered = galleryContents.filter((c) => c.unlockType === tab)

  // --- 새 콘텐츠 업로드 ---
  const handleFileSelect = (files) => {
    if (files.length === 0) return
    setPendingFiles(files)
    setPendingPreviews(files.map((f) => URL.createObjectURL(f)))
    setForm({ title: '', description: '', affinityThreshold: 0, missionKey: '', missionName: '' })
    setShowForm(true)
  }

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      pendingFiles.forEach((f) => formData.append('images', f))
      formData.append('unlockType', tab)
      if (form.title) formData.append('title', form.title)
      if (form.description) formData.append('description', form.description)
      if (tab === 'AFFINITY') formData.append('affinityThreshold', form.affinityThreshold)
      if (tab === 'MISSION') {
        formData.append('missionName', form.missionName)
        if (form.missionKey) formData.append('missionKey', form.missionKey)
      }
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/admin/characters/${id}/gallery`,
        { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: formData }
      )
      const data = await res.json()
      if (data.galleryContent) setGalleryContents((prev) => [...prev, data.galleryContent])
      setShowForm(false)
      setPendingFiles([])
      setPendingPreviews([])
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // --- 모달: 기존 콘텐츠에 이미지 추가 ---
  const handleAddImages = async (contentId, files) => {
    if (files.length === 0) return
    setAddingImages(true)
    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('images', f))
      await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/admin/gallery/${contentId}/images`,
        { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: formData }
      )
      await refreshDetail(contentId)
    } catch (error) {
      console.error('Add images error:', error)
    } finally {
      setAddingImages(false)
      if (modalFileRef.current) modalFileRef.current.value = ''
    }
  }

  const handleDeleteImage = async (imageId) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return
    await api.delete(`/admin/gallery-images/${imageId}`)
    if (detailContent) await refreshDetail(detailContent.id)
  }

  const handleDelete = async (contentId) => {
    if (!confirm('이 갤러리 콘텐츠를 삭제하시겠습니까?')) return
    await api.delete(`/admin/gallery/${contentId}`)
    setDetailContent(null)
    loadGallery()
  }

  // --- 모달: 메타데이터 수정 ---
  const startDetailEdit = () => {
    setEditingDetail(true)
    setDetailEditForm({
      title: detailContent.title || '',
      description: detailContent.description || '',
      affinityThreshold: detailContent.affinityThreshold ?? 0,
      missionKey: detailContent.missionKey || '',
      missionName: detailContent.missionName || '',
    })
  }

  const saveDetailEdit = async () => {
    const data = { title: detailEditForm.title, description: detailEditForm.description }
    if (detailContent.unlockType === 'AFFINITY') data.affinityThreshold = detailEditForm.affinityThreshold
    if (detailContent.unlockType === 'MISSION') {
      data.missionKey = detailEditForm.missionKey
      data.missionName = detailEditForm.missionName
    }
    await api.put(`/admin/gallery/${detailContent.id}`, data)
    setEditingDetail(false)
    await refreshDetail(detailContent.id)
  }

  // --- 드래그 앤 드롭 (메인) ---
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (dragCounter.current === 1) setDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false) }
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false); dragCounter.current = 0
    handleFileSelect(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')))
  }

  // --- 드래그 앤 드롭 (모달) ---
  const handleModalDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); modalDragCounter.current++; if (modalDragCounter.current === 1) setModalDragging(true) }
  const handleModalDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); modalDragCounter.current--; if (modalDragCounter.current === 0) setModalDragging(false) }
  const handleModalDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
  const handleModalDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setModalDragging(false); modalDragCounter.current = 0
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (detailContent) handleAddImages(detailContent.id, files)
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/admin/characters')} className="text-gray-400 hover:text-white">
          ← 뒤로
        </button>
        <h1 className="text-xl font-bold text-white">
          {character?.name || '...'} — 갤러리 관리
        </h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
        {['AFFINITY', 'MISSION'].map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setShowForm(false) }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t === 'AFFINITY' ? '호감도 이미지' : '미션 이미지'}
            <span className="ml-1.5 text-xs opacity-70">
              ({galleryContents.filter((c) => c.unlockType === t).length})
            </span>
          </button>
        ))}
      </div>

      {/* 업로드 영역 */}
      <div className="mb-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
          className="hidden"
        />

        {!showForm ? (
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-500 bg-gray-800/50'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <div className="flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm text-gray-300 font-medium">이미지를 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-gray-500">여러 이미지를 선택하면 하나의 콘텐츠에 슬라이드로 등록됩니다.</p>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex gap-4">
              <div className="flex gap-2 flex-shrink-0 overflow-x-auto">
                {pendingPreviews.map((preview, i) => (
                  <div key={i} className="w-24 h-32 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900">
                    <img src={preview} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="flex-1 space-y-3">
                <p className="text-xs text-gray-400">{pendingFiles.length}개 이미지 선택됨</p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">제목</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="콘텐츠 제목 (선택)" className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">설명</label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="콘텐츠 설명 (선택)" className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                </div>
                {tab === 'AFFINITY' && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">필요 호감도: <span className="text-indigo-400 font-medium">{form.affinityThreshold}</span></label>
                    <input type="range" min="-100" max="100" value={form.affinityThreshold} onChange={(e) => setForm({ ...form, affinityThreshold: parseInt(e.target.value) })} className="w-full" />
                    <div className="flex justify-between text-[10px] text-gray-500"><span>-100</span><span>0</span><span>100</span></div>
                  </div>
                )}
                {tab === 'MISSION' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">미션 이름 *</label>
                      <input value={form.missionName} onChange={(e) => setForm({ ...form, missionName: e.target.value })} placeholder="예: 첫 대화 시작하기" className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">미션 키 (시스템용)</label>
                      <input value={form.missionKey} onChange={(e) => setForm({ ...form, missionKey: e.target.value })} placeholder="예: first_chat" className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowForm(false); setPendingFiles([]); setPendingPreviews([]) }} className="px-4 py-2 text-sm text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>취소</button>
              <button onClick={handleUpload} disabled={uploading || (tab === 'MISSION' && !form.missionName.trim())} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>{uploading ? '업로드 중...' : '등록'}</button>
            </div>
          </div>
        )}
      </div>

      {/* 콘텐츠 그리드 */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          {tab === 'AFFINITY' ? '등록된 호감도 콘텐츠가 없습니다.' : '등록된 미션 콘텐츠가 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((content) => (
            <div
              key={content.id}
              className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 cursor-pointer hover:border-gray-500 transition-colors"
              onClick={() => { setDetailContent(content); setEditingDetail(false) }}
            >
              <div className="aspect-[3/4] relative">
                {content.images?.[0] && (
                  <img src={content.images[0].filePath} alt={content.title || ''} className="w-full h-full object-cover" />
                )}
                {content.images?.length > 1 && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                    {content.images.length}장
                  </div>
                )}
              </div>
              <div className={`px-3 py-1.5 text-[11px] ${
                content.unlockType === 'AFFINITY' ? 'bg-pink-900/30 text-pink-400' : 'bg-amber-900/30 text-amber-400'
              }`}>
                {content.unlockType === 'AFFINITY' ? `♥ 호감도 ${content.affinityThreshold} 이상` : `★ ${content.missionName}`}
              </div>
              <div className="p-3">
                {content.title && <p className="text-sm text-white font-medium mb-0.5">{content.title}</p>}
                {content.description && <p className="text-xs text-gray-400 line-clamp-2">{content.description}</p>}
                {!content.title && !content.description && <p className="text-xs text-gray-500 italic">제목 없음</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상세 모달 */}
      {detailContent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setDetailContent(null)}>
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-bold text-white">갤러리 콘텐츠 상세</h3>
              <button onClick={() => setDetailContent(null)} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 메타데이터 */}
            <div className="px-5 py-3 border-b border-gray-800">
              {editingDetail ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">제목</label>
                    <input value={detailEditForm.title} onChange={(e) => setDetailEditForm({ ...detailEditForm, title: e.target.value })} placeholder="제목" className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">설명</label>
                    <input value={detailEditForm.description} onChange={(e) => setDetailEditForm({ ...detailEditForm, description: e.target.value })} placeholder="설명" className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                  </div>
                  {detailContent.unlockType === 'AFFINITY' && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">호감도: <span className="text-indigo-400 font-medium">{detailEditForm.affinityThreshold}</span></label>
                      <input type="range" min="-100" max="100" value={detailEditForm.affinityThreshold} onChange={(e) => setDetailEditForm({ ...detailEditForm, affinityThreshold: parseInt(e.target.value) })} className="w-full" />
                    </div>
                  )}
                  {detailContent.unlockType === 'MISSION' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">미션 이름</label>
                        <input value={detailEditForm.missionName} onChange={(e) => setDetailEditForm({ ...detailEditForm, missionName: e.target.value })} className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">미션 키</label>
                        <input value={detailEditForm.missionKey} onChange={(e) => setDetailEditForm({ ...detailEditForm, missionKey: e.target.value })} className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none" />
                      </div>
                    </>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveDetailEdit} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">저장</button>
                    <button onClick={() => setEditingDetail(false)} className="text-xs text-gray-400 hover:text-gray-300">취소</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{detailContent.title || <span className="text-gray-500 italic">제목 없음</span>}</p>
                      {detailContent.description && <p className="text-xs text-gray-400 mt-0.5">{detailContent.description}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={startDetailEdit} className="text-xs text-indigo-400 hover:text-indigo-300" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>수정</button>
                      <button onClick={() => handleDelete(detailContent.id)} className="text-xs text-red-400 hover:text-red-300" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>삭제</button>
                    </div>
                  </div>
                  <div className={`inline-block mt-2 px-2 py-0.5 rounded text-[11px] ${
                    detailContent.unlockType === 'AFFINITY' ? 'bg-pink-900/30 text-pink-400' : 'bg-amber-900/30 text-amber-400'
                  }`}>
                    {detailContent.unlockType === 'AFFINITY' ? `♥ 호감도 ${detailContent.affinityThreshold} 이상` : `★ ${detailContent.missionName}`}
                  </div>
                </>
              )}
            </div>

            {/* 이미지 목록 */}
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400 mb-3">이미지 ({detailContent.images?.length || 0}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detailContent.images?.map((img, idx) => (
                  <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden group">
                    <img src={img.filePath} alt="" className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">{idx + 1}</div>
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 이미지 추가 드래그앤드롭 */}
            <div className="px-5 pb-5">
              <input
                ref={modalFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  if (detailContent) handleAddImages(detailContent.id, files)
                }}
              />
              <div
                onDragEnter={handleModalDragEnter}
                onDragLeave={handleModalDragLeave}
                onDragOver={handleModalDragOver}
                onDrop={handleModalDrop}
                onClick={() => !addingImages && modalFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  modalDragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-500 bg-gray-800/30'
                } ${addingImages ? 'pointer-events-none opacity-50' : ''}`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {addingImages ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    <span className="text-sm text-indigo-300">업로드 중...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <svg className="w-7 h-7 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <p className="text-xs text-gray-400">이미지를 드래그하거나 클릭하여 추가</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
