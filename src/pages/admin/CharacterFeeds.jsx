import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

export default function CharacterFeeds() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState(null)
  const [tab, setTab] = useState('feed') // 'feed' | 'story'
  const [feeds, setFeeds] = useState([])
  const [stories, setStories] = useState([])
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editCaption, setEditCaption] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    api.get(`/admin/characters`).then(({ characters }) => {
      const c = characters.find((ch) => ch.id === parseInt(id))
      setCharacter(c)
    })
    loadFeeds()
    loadStories()
  }, [id])

  const loadFeeds = () => api.get(`/admin/characters/${id}/feeds`).then(({ feeds }) => setFeeds(feeds))
  const loadStories = () => api.get(`/admin/characters/${id}/stories`).then(({ stories }) => setStories(stories))

  const uploadFiles = useCallback(async (files) => {
    if (files.length === 0) return
    setUploading(true)

    try {
      if (tab === 'feed') {
        const formData = new FormData()
        files.forEach((f) => formData.append('images', f))

        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/admin/characters/${id}/feeds`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData,
        })
        const data = await res.json()
        if (data.feeds) {
          setFeeds((prev) => [...prev, ...data.feeds])
          alert(`${data.feeds.length}개 피드 생성 완료!\n게시 간격: ${data.interval.min}~${data.interval.max}분`)
        }
      } else {
        for (const file of files) {
          const formData = new FormData()
          formData.append('image', file)
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/admin/characters/${id}/stories`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: formData,
          })
          const data = await res.json()
          if (data.story) setStories((prev) => [...prev, data.story])
        }
      }
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [tab, id])

  const handleUpload = (e) => {
    const files = Array.from(e.target.files || [])
    uploadFiles(files)
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
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    uploadFiles(files)
  }

  const handleDelete = async (itemId) => {
    if (!confirm('삭제하시겠습니까?')) return
    const endpoint = tab === 'feed' ? `/admin/feeds/${itemId}` : `/admin/stories/${itemId}`
    await api.delete(endpoint)
    if (tab === 'feed') loadFeeds()
    else loadStories()
  }

  const handleEditSave = async (itemId) => {
    await api.put(`/admin/feeds/${itemId}`, { caption: editCaption })
    setEditingId(null)
    loadFeeds()
  }

  const items = tab === 'feed' ? feeds : stories

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/characters')}
          className="text-gray-400 hover:text-white"
        >
          ← 뒤로
        </button>
        <h1 className="text-xl font-bold text-white">
          {character?.name || '...'} — 피드/스토리 관리
        </h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
        {['feed', 'story'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'feed' ? '피드' : '스토리'}
            <span className="ml-1.5 text-xs opacity-70">
              ({t === 'feed' ? feeds.length : stories.length})
            </span>
          </button>
        ))}
      </div>

      {/* 업로드 (드래그 앤 드롭 + 클릭) */}
      <div className="mb-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-gray-700 hover:border-gray-500 bg-gray-800/50'
          } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin w-8 h-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              <p className="text-sm text-indigo-300 font-medium">AI 분석 중...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm text-gray-300 font-medium">
                이미지를 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-xs text-gray-500">
                {tab === 'feed'
                  ? '여러 이미지를 한번에 선택하면 캐릭터 성격에 맞는 간격으로 자동 스케줄링됩니다. AI가 캡션도 자동 생성합니다.'
                  : '이미지 업로드 시 AI가 캐릭터 컨셉에 맞는 캡션을 자동 생성합니다.'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 아이템 그리드 */}
      {items.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          {tab === 'feed' ? '등록된 피드가 없습니다.' : '등록된 스토리가 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              {/* 이미지 */}
              <div className={tab === 'feed' ? 'aspect-[9/16]' : 'aspect-[9/16]'}>
                <img
                  src={item.filePath}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>

              {/* 게시 상태 */}
              {tab === 'feed' && item.publishAt && (
                <div className={`px-3 py-1.5 text-[11px] ${
                  new Date(item.publishAt) > new Date()
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : 'bg-green-900/30 text-green-400'
                }`}>
                  {new Date(item.publishAt) > new Date()
                    ? `⏳ 예약: ${new Date(item.publishAt).toLocaleString('ko-KR')}`
                    : `✅ 게시됨`
                  }
                </div>
              )}

              {/* 정보 */}
              <div className="p-3">
                {editingId === item.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                    />
                    <button
                      onClick={() => handleEditSave(item.id)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 line-clamp-2">
                    {item.caption || <span className="text-gray-500 italic">캡션 없음</span>}
                  </p>
                )}

                <div className="flex items-center justify-between mt-2">
                  {tab === 'feed' && editingId !== item.id && (
                    <button
                      onClick={() => { setEditingId(item.id); setEditCaption(item.caption || '') }}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      수정
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs text-red-400 hover:text-red-300 ml-auto"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
