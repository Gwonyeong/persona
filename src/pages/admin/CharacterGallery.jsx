import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

export default function CharacterGallery() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState(null)
  const [tab, setTab] = useState('AFFINITY')
  const [galleryImages, setGalleryImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', affinityThreshold: 0, missionKey: '', missionName: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const fileRef = useRef(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    api.get('/admin/characters').then(({ characters }) => {
      const c = characters.find((ch) => ch.id === parseInt(id))
      setCharacter(c)
    })
    loadGallery()
  }, [id])

  const loadGallery = () =>
    api.get(`/admin/characters/${id}/gallery`).then(({ galleryImages }) => setGalleryImages(galleryImages))

  const filtered = galleryImages.filter((img) => img.unlockType === tab)

  const handleFileSelect = (files) => {
    if (files.length === 0) return
    const file = files[0]
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
    setForm({ title: '', description: '', affinityThreshold: 0, missionKey: '', missionName: '' })
    setShowForm(true)
  }

  const handleUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', pendingFile)
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
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData,
        }
      )
      const data = await res.json()
      if (data.galleryImage) {
        setGalleryImages((prev) => [...prev, data.galleryImage])
      }
      setShowForm(false)
      setPendingFile(null)
      setPendingPreview(null)
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (imgId) => {
    if (!confirm('삭제하시겠습니까?')) return
    await api.delete(`/admin/gallery/${imgId}`)
    loadGallery()
  }

  const startEdit = (img) => {
    setEditingId(img.id)
    setEditForm({
      title: img.title || '',
      description: img.description || '',
      affinityThreshold: img.affinityThreshold ?? 0,
      missionKey: img.missionKey || '',
      missionName: img.missionName || '',
    })
  }

  const saveEdit = async (imgId) => {
    const img = galleryImages.find((i) => i.id === imgId)
    const data = { title: editForm.title, description: editForm.description }
    if (img.unlockType === 'AFFINITY') data.affinityThreshold = editForm.affinityThreshold
    if (img.unlockType === 'MISSION') {
      data.missionKey = editForm.missionKey
      data.missionName = editForm.missionName
    }
    await api.put(`/admin/gallery/${imgId}`, data)
    setEditingId(null)
    loadGallery()
  }

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (dragCounter.current === 1) setDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false) }
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false); dragCounter.current = 0
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    handleFileSelect(files)
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
              ({galleryImages.filter((i) => i.unlockType === t).length})
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
              <p className="text-xs text-gray-500">
                {tab === 'AFFINITY'
                  ? '호감도 달성 시 해금되는 이미지를 등록합니다.'
                  : '미션 완료 시 해금되는 이미지를 등록합니다.'}
              </p>
            </div>
          </div>
        ) : (
          /* 업로드 폼 */
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex gap-4">
              {/* 미리보기 */}
              <div className="w-32 h-40 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900">
                {pendingPreview && <img src={pendingPreview} alt="" className="w-full h-full object-cover" />}
              </div>

              {/* 필드 */}
              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">제목</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="이미지 제목 (선택)"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">설명</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="이미지 설명 (선택)"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {tab === 'AFFINITY' && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                      필요 호감도: <span className="text-indigo-400 font-medium">{form.affinityThreshold}</span>
                    </label>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={form.affinityThreshold}
                      onChange={(e) => setForm({ ...form, affinityThreshold: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>-100</span><span>0</span><span>100</span>
                    </div>
                  </div>
                )}

                {tab === 'MISSION' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">미션 이름 *</label>
                      <input
                        value={form.missionName}
                        onChange={(e) => setForm({ ...form, missionName: e.target.value })}
                        placeholder="예: 첫 대화 시작하기"
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">미션 키 (시스템용)</label>
                      <input
                        value={form.missionKey}
                        onChange={(e) => setForm({ ...form, missionKey: e.target.value })}
                        placeholder="예: first_chat"
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowForm(false); setPendingFile(null); setPendingPreview(null) }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || (tab === 'MISSION' && !form.missionName.trim())}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {uploading ? '업로드 중...' : '등록'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 그리드 */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          {tab === 'AFFINITY' ? '등록된 호감도 이미지가 없습니다.' : '등록된 미션 이미지가 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((img) => (
            <div key={img.id} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              <div className="aspect-[3/4]">
                <img src={img.filePath} alt={img.title || ''} className="w-full h-full object-cover" />
              </div>

              {/* 해금 조건 배지 */}
              <div className={`px-3 py-1.5 text-[11px] ${
                img.unlockType === 'AFFINITY'
                  ? 'bg-pink-900/30 text-pink-400'
                  : 'bg-amber-900/30 text-amber-400'
              }`}>
                {img.unlockType === 'AFFINITY'
                  ? `♥ 호감도 ${img.affinityThreshold} 이상`
                  : `★ ${img.missionName}`
                }
              </div>

              <div className="p-3">
                {editingId === img.id ? (
                  <div className="space-y-2">
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      placeholder="제목"
                      className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                    />
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      placeholder="설명"
                      className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                    />
                    {img.unlockType === 'AFFINITY' && (
                      <div>
                        <label className="text-[10px] text-gray-400">호감도: {editForm.affinityThreshold}</label>
                        <input
                          type="range" min="-100" max="100"
                          value={editForm.affinityThreshold}
                          onChange={(e) => setEditForm({ ...editForm, affinityThreshold: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                    )}
                    {img.unlockType === 'MISSION' && (
                      <>
                        <input
                          value={editForm.missionName}
                          onChange={(e) => setEditForm({ ...editForm, missionName: e.target.value })}
                          placeholder="미션 이름"
                          className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                        />
                        <input
                          value={editForm.missionKey}
                          onChange={(e) => setEditForm({ ...editForm, missionKey: e.target.value })}
                          placeholder="미션 키"
                          className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                        />
                      </>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(img.id)} className="text-xs text-indigo-400 hover:text-indigo-300">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-300">취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {img.title && <p className="text-sm text-white font-medium mb-1">{img.title}</p>}
                    {img.description && <p className="text-xs text-gray-400 line-clamp-2 mb-2">{img.description}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(img)}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(img.id)}
                        className="text-xs text-red-400 hover:text-red-300 ml-auto"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
