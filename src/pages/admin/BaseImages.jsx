import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

export default function BaseImages() {
  const [characters, setCharacters] = useState(null)
  const [filter, setFilter] = useState('ALL') // ALL | WITH_CONTENT | EMPTY

  useEffect(() => {
    api.get('/admin/base-images-overview').then(({ characters }) => setCharacters(characters || []))
  }, [])

  const updateCharacter = (id, baseImages) => {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, baseImages } : c)))
  }

  const visible = useMemo(() => {
    if (!characters) return []
    if (filter === 'WITH_CONTENT') return characters.filter((c) => (c.baseImages?.length || 0) > 0)
    if (filter === 'EMPTY') return characters.filter((c) => (c.baseImages?.length || 0) === 0)
    return characters
  }, [characters, filter])

  const totalImages = useMemo(
    () => (characters || []).reduce((sum, c) => sum + (c.baseImages?.length || 0), 0),
    [characters],
  )

  if (!characters) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">베이스 이미지</h2>
          <p className="text-sm text-gray-400 mt-1">
            캐릭터 {characters.length}명 · 기준 이미지 {totalImages}장
          </p>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { id: 'ALL', label: '전체' },
            { id: 'WITH_CONTENT', label: '등록됨' },
            { id: 'EMPTY', label: '미등록' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                filter === f.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              style={NO_OUTLINE}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center text-gray-500 py-16">표시할 캐릭터가 없습니다.</div>
      ) : (
        <div className="space-y-6">
          {visible.map((c) => (
            <CharacterRow key={c.id} character={c} onUpdate={(images) => updateCharacter(c.id, images)} />
          ))}
        </div>
      )}
    </div>
  )
}

function CharacterRow({ character, onUpdate }) {
  const images = character.baseImages || []
  const fileRef = useRef(null)
  const dragCounter = useRef(0)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingConcept, setEditingConcept] = useState('')

  const upload = async (files) => {
    if (!files.length) return
    setUploading(true)
    try {
      let latest = images
      for (const file of files) {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('concept', '')
        const res = await fetch(`${API_BASE}/admin/characters/${character.id}/base-images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData,
        })
        const data = await res.json()
        if (data.baseImages) latest = data.baseImages
      }
      onUpdate(latest)
    } catch (error) {
      console.error('Base image upload error:', error)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const saveConcept = async (imageId) => {
    const { baseImages } = await api.put(`/admin/characters/${character.id}/base-images/${imageId}`, {
      concept: editingConcept,
    })
    onUpdate(baseImages)
    setEditingId(null)
  }

  const remove = async (imageId) => {
    if (!confirm('이 기준 이미지를 삭제하시겠습니까?')) return
    await api.delete(`/admin/characters/${character.id}/base-images/${imageId}`)
    onUpdate(images.filter((i) => i.id !== imageId))
  }

  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) setDragging(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    dragCounter.current = 0
    upload(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')))
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          {character.profileImage ? (
            <img src={character.profileImage} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-800" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-800" />
          )}
          <div>
            <p className="text-sm font-medium text-white">{character.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">기준 이미지 {images.length}장</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => upload(Array.from(e.target.files || []))}
          className="hidden"
        />
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-500 bg-gray-800/30'
          } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          style={NO_OUTLINE}
        >
          <p className="text-xs text-gray-400">
            {uploading ? '업로드 중...' : '이미지를 드래그하거나 클릭하여 추가'}
          </p>
        </div>

        {images.length === 0 ? (
          <div className="text-xs text-gray-500 py-2">등록된 기준 이미지가 없습니다.</div>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [&>*]:mb-3">
            {images.map((img) => (
              <div key={img.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 break-inside-avoid">
                <div className="relative group">
                  <img src={img.filePath} alt="" className="w-full h-auto block" loading="lazy" />
                  <button
                    onClick={() => remove(img.id)}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={NO_OUTLINE}
                    title="삭제"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="p-2.5">
                  {editingId === img.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={editingConcept}
                        onChange={(e) => setEditingConcept(e.target.value)}
                        placeholder="컨셉 설명 입력..."
                        rows={2}
                        className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveConcept(img.id)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                          style={NO_OUTLINE}
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-400 hover:text-gray-300"
                          style={NO_OUTLINE}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setEditingId(img.id)
                        setEditingConcept(img.concept || '')
                      }}
                      className="cursor-pointer min-h-[2.5rem]"
                    >
                      {img.concept ? (
                        <p className="text-xs text-gray-300 line-clamp-2">{img.concept}</p>
                      ) : (
                        <p className="text-xs text-gray-500 italic">클릭하여 컨셉 입력...</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
