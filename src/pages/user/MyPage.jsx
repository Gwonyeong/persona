import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import LoginModal from '../../components/LoginModal'
// import AdBanner from '../../components/AdBanner'

function resizeImage(file, maxSize = 512) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > height) {
        if (width > maxSize) { height = (height * maxSize) / width; width = maxSize }
      } else {
        if (height > maxSize) { width = (width * maxSize) / height; height = maxSize }
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8)
    }
    img.src = url
  })
}

export default function MyPage() {
  const { token, clearAuth } = useStore()
  const navigate = useNavigate()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [dbUser, setDbUser] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!token) return
    api.get('/auth/me').then(({ user }) => setDbUser(user))
  }, [token])

  const startEdit = () => {
    setEditName(dbUser?.name || '')
    setPreviewUrl(null)
    setSelectedFile(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setPreviewUrl(null)
    setSelectedFile(null)
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const resized = await resizeImage(file)
    setSelectedFile(resized)
    setPreviewUrl(URL.createObjectURL(resized))
  }

  const handleSave = async () => {
    if (saving) return
    const name = editName.trim()
    if (!name || name.length > 20) return

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      if (selectedFile) {
        formData.append('avatar', selectedFile, 'avatar.webp')
      }
      const { user } = await api.put('/auth/profile', formData)
      setDbUser(user)
      setEditing(false)
      setPreviewUrl(null)
      setSelectedFile(null)
    } catch (error) {
      console.error('Profile update error:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    navigate('/')
  }

  const avatarDisplay = previewUrl || dbUser?.avatarUrl

  return (
    <div className="px-4 pt-4">
      <Helmet>
        <title>마이페이지 - Pesona</title>
        <meta name="description" content="Pesona 프로필 설정 및 계정 관리 페이지입니다." />
      </Helmet>
      <h1 className="text-xl font-bold mb-6">마이</h1>
      {/* <div className="mb-4">
        <AdBanner slot="3193498609" />
      </div> */}

      {!token ? (
        <div className="text-center py-20">
          <p className="text-gray-300 font-semibold mb-2">로그인이 필요합니다</p>
          <p className="text-sm text-gray-500 mb-6">로그인하면 프로필 관리, 대화 기록 저장 등 다양한 기능을 이용할 수 있습니다.</p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            로그인
          </button>
          {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
        </div>
      ) : (
      <>
      {/* 프로필 */}
      <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
        {editing ? (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 group"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {avatarDisplay ? (
                <img src={avatarDisplay} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl">
                  {editName?.[0] || '?'}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={20}
              placeholder="닉네임"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none text-center"
            />
            <div className="flex gap-2 w-full">
              <button
                onClick={cancelEdit}
                className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex-1 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
              {dbUser?.avatarUrl ? (
                <img src={dbUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl">
                  {dbUser?.name?.[0] || '?'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{dbUser?.name || '사용자'}</p>
              <p className="text-sm text-gray-400">{dbUser?.email}</p>
            </div>
            <button
              onClick={startEdit}
              className="px-3 py-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              수정
            </button>
          </div>
        )}
      </div>

      {/* 메뉴 */}
      <div className="mt-4 bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
        {dbUser?.role === 'ADMIN' && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm hover:bg-gray-800/50 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-indigo-400">어드민 페이지</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center px-4 py-3.5 text-sm text-red-400 hover:bg-gray-800/50 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          로그아웃
        </button>
      </div>
      </>
      )}
    </div>
  )
}
