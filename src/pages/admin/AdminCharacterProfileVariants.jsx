import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

/**
 * 캐릭터의 프로필 이미지 풀 관리. 마스크 패스 PROFILE 보상으로 해금되는 대체 프로필 이미지들.
 * 드래그앤드랍 업로드 지원 (memory feedback_admin_dnd).
 */
export default function AdminCharacterProfileVariants() {
  const { id } = useParams()
  const characterId = parseInt(id, 10)
  const navigate = useNavigate()
  const [variants, setVariants] = useState([])
  const [character, setCharacter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadSource, setUploadSource] = useState('MASK_PASS') // 업로드 시 기본 획득처
  const fileRef = useRef(null)

  async function load() {
    setLoading(true)
    try {
      const [list, char] = await Promise.all([
        api.get(`/admin/characters/${characterId}/profile-variants`),
        api.get(`/characters/${characterId}`).catch(() => ({ character: null })),
      ])
      setVariants(list.variants || [])
      setCharacter(char.character)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (Number.isFinite(characterId)) load()
  }, [characterId])

  async function upload(files) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('image', file)
        fd.append('source', uploadSource)
        await api.post(`/admin/characters/${characterId}/profile-variants`, fd)
      }
      await load()
    } catch (e) {
      alert(e.data?.error || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  async function updateTitle(v, title) {
    try {
      await api.put(`/admin/profile-variants/${v.id}`, { title })
      await load()
    } catch (e) {
      alert(e.data?.error || '수정 실패')
    }
  }

  async function updateSource(v, source) {
    try {
      await api.put(`/admin/profile-variants/${v.id}`, { source })
      await load()
    } catch (e) {
      alert(e.data?.error || '수정 실패')
    }
  }

  async function remove(v) {
    if (!confirm('이 프로필 이미지를 삭제할까요? 이미 적용한 유저는 기본 이미지로 돌아갑니다.')) return
    try {
      await api.delete(`/admin/profile-variants/${v.id}`)
      await load()
    } catch (e) {
      alert(e.data?.error || '삭제 실패')
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h1 className="text-lg font-bold">
          프로필 이미지 풀 — {character?.name || `#${characterId}`}
        </h1>
      </div>

      {/* 업로드 시 획득처 선택 */}
      <div className="mb-2 flex items-center gap-2">
        <label className="text-xs text-gray-400">업로드 획득처:</label>
        <select
          value={uploadSource}
          onChange={(e) => setUploadSource(e.target.value)}
          className="px-2 py-1 text-xs bg-gray-950 border border-gray-800 rounded text-gray-200"
        >
          <option value="MASK_PASS">Mask Pass</option>
          <option value="GACHA">Gacha</option>
        </select>
      </div>

      {/* 드래그앤드랍 업로드 */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          upload([...e.dataTransfer.files])
        }}
        onClick={() => fileRef.current?.click()}
        className={`mb-5 p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
          dragOver ? 'border-amber-400 bg-amber-950/20' : 'border-gray-700 hover:border-gray-600'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload([...e.target.files])}
        />
        <p className="text-sm text-gray-400">
          {uploading ? '업로드 중...' : '이미지를 드래그하거나 클릭해서 업로드 (여러 장 가능)'}
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">불러오는 중...</p>}

      <div className="grid grid-cols-3 gap-3">
        {variants.map((v) => (
          <div key={v.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <img src={v.imageUrl} alt="" className="w-full aspect-square object-cover" />
            <div className="p-2">
              <input
                defaultValue={v.title || ''}
                onBlur={(e) => {
                  const newTitle = e.target.value.trim()
                  if (newTitle !== (v.title || '')) updateTitle(v, newTitle)
                }}
                placeholder="라벨"
                className="w-full px-2 py-1 text-xs bg-gray-950 border border-gray-800 rounded"
              />
              <select
                value={v.source || 'MASK_PASS'}
                onChange={(e) => updateSource(v, e.target.value)}
                className="mt-1.5 w-full px-2 py-1 text-xs bg-gray-950 border border-gray-800 rounded text-gray-200"
              >
                <option value="MASK_PASS">Mask Pass</option>
                <option value="GACHA">Gacha</option>
              </select>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-mono">id: {v.id}</span>
                <button
                  onClick={() => remove(v)}
                  className="text-[10px] px-2 py-0.5 bg-red-900/40 text-red-300 rounded"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-gray-500">
        업로드한 variant의 <code className="text-amber-400">id</code>를 마스크 패스 PROFILE 보상의 payload에 넣으면 해당 티어 클레임 시 해금됩니다.
      </p>
    </div>
  )
}
