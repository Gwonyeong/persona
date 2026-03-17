import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'

const EMOTIONS = [
  { key: 'NEUTRAL', label: '기본' },
  { key: 'HAPPY', label: '웃음' },
  { key: 'ANGRY', label: '화남' },
  { key: 'SAD', label: '슬픔' },
  { key: 'SURPRISED', label: '놀람' },
  { key: 'SHY', label: '부끄러움' },
  { key: 'ANNOYED', label: '짜증' },
  { key: 'WORRIED', label: '걱정' },
  { key: 'PLAYFUL', label: '장난' },
  { key: 'EXCITED', label: '설렘' },
]


export default function CharacterStyles() {
  const { id } = useParams()
  const [character, setCharacter] = useState(null)
  const [newStyleName, setNewStyleName] = useState('')
  const [newStyleDesc, setNewStyleDesc] = useState('')
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(null) // "styleId-emotion"

  const load = () => {
    api.get(`/admin/characters`).then(({ characters }) => {
      const c = characters.find((ch) => ch.id === parseInt(id))
      setCharacter(c)
    })
  }

  useEffect(() => { load() }, [id])

  const addStyle = async () => {
    if (!newStyleName.trim()) return
    await api.post(`/admin/characters/${id}/styles`, {
      name: newStyleName,
      description: newStyleDesc,
    })
    setNewStyleName('')
    setNewStyleDesc('')
    load()
  }

  const removeStyle = async (styleId) => {
    if (!confirm('이 스타일과 모든 이미지를 삭제하시겠습니까?')) return
    await api.delete(`/admin/styles/${styleId}`)
    load()
  }

  const uploadImage = async (styleId, emotion, file) => {
    const key = `${styleId}-${emotion}`
    setUploading(key)

    const formData = new FormData()
    formData.append('image', file)
    formData.append('emotion', emotion)
    formData.append('description', '')

    await api.post(`/admin/styles/${styleId}/images`, formData)
    setUploading(null)
    load()
  }

  const removeImage = async (imageId) => {
    await api.delete(`/admin/images/${imageId}`)
    load()
  }

  const triggerUpload = (styleId, emotion) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      if (e.target.files[0]) {
        uploadImage(styleId, emotion, e.target.files[0])
      }
    }
    input.click()
  }

  if (!character) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/characters" className="text-gray-400 hover:text-white text-sm">
          ← 목록
        </Link>
        <h2 className="text-xl font-bold">{character.name} — 스타일/이미지 관리</h2>
      </div>

      {/* 새 스타일 추가 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">새 스타일 추가</h3>
        <div className="flex gap-2">
          <input
            value={newStyleName}
            onChange={(e) => setNewStyleName(e.target.value)}
            placeholder="스타일명 (예: 교복)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={newStyleDesc}
            onChange={(e) => setNewStyleDesc(e.target.value)}
            placeholder="설명 (선택)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={addStyle}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 whitespace-nowrap"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            추가
          </button>
        </div>
      </div>

      {/* 스타일별 이미지 그리드 */}
      {character.styles.length === 0 ? (
        <p className="text-gray-500">등록된 스타일이 없습니다. 위에서 스타일을 추가해주세요.</p>
      ) : (
        character.styles.map((style) => (
          <div key={style.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{style.name}</h3>
                {style.description && (
                  <p className="text-xs text-gray-400">{style.description}</p>
                )}
              </div>
              <button
                onClick={() => removeStyle(style.id)}
                className="text-red-400 hover:text-red-300 text-xs"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                스타일 삭제
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {EMOTIONS.map(({ key, label }) => {
                const img = style.images.find((i) => i.emotion === key)
                const isUploading = uploading === `${style.id}-${key}`

                return (
                  <div key={key} className="text-center">
                    <div
                      onClick={() => !isUploading && triggerUpload(style.id, key)}
                      className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden ${
                        img ? 'border-gray-700' : 'border-gray-700 hover:border-indigo-500'
                      }`}
                    >
                      {isUploading ? (
                        <span className="text-xs text-gray-400">업로드중...</span>
                      ) : img ? (
                        <img
                          src={img.filePath}
                          alt={label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl text-gray-600">+</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{label}</p>
                    {img && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeImage(img.id)
                        }}
                        className="text-xs text-red-400 hover:text-red-300 mt-0.5"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
