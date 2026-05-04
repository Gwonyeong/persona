import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const PAGE_SIZE = 10

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

export default function Expressions() {
  const [characters, setCharacters] = useState(null)
  const [filter, setFilter] = useState('ALL') // ALL | INCOMPLETE | NO_STYLE
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/admin/expressions-overview').then(({ characters }) => setCharacters(characters || []))
  }, [])

  const updateImage = (characterId, emotion, image) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== characterId || !c.defaultStyle) return c
        const others = c.defaultStyle.images.filter((i) => i.emotion !== emotion)
        const next = image ? [...others, { id: image.id, emotion, filePath: image.filePath }] : others
        return { ...c, defaultStyle: { ...c.defaultStyle, images: next } }
      }),
    )
  }

  const filtered = useMemo(() => {
    if (!characters) return []
    if (filter === 'INCOMPLETE') {
      return characters.filter(
        (c) => c.defaultStyle && c.defaultStyle.images.length < EMOTIONS.length,
      )
    }
    if (filter === 'NO_STYLE') return characters.filter((c) => !c.defaultStyle)
    return characters
  }, [characters, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  if (!characters) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">표정 이미지</h2>
          <p className="text-sm text-gray-400 mt-1">
            기본 스타일(첫 번째 스타일) 기준 · 캐릭터 {characters.length}명
          </p>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { id: 'ALL', label: '전체' },
            { id: 'INCOMPLETE', label: '미완성' },
            { id: 'NO_STYLE', label: '스타일 없음' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id)
                setPage(1)
              }}
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

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-16">표시할 캐릭터가 없습니다.</div>
      ) : (
        <>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="sticky left-0 z-10 bg-gray-900 text-left text-xs font-medium text-gray-400 px-4 py-3 min-w-[180px]">
                    캐릭터
                  </th>
                  {EMOTIONS.map((e) => (
                    <th
                      key={e.key}
                      className="text-center text-xs font-medium text-gray-400 px-2 py-3 min-w-[88px]"
                    >
                      {e.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => (
                  <CharacterRow key={c.id} character={c} onUpdateImage={updateImage} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500">
              {filtered.length}명 중 {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                style={NO_OUTLINE}
              >
                이전
              </button>
              <span className="text-xs text-gray-400">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                style={NO_OUTLINE}
              >
                다음
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CharacterRow({ character, onUpdateImage }) {
  const style = character.defaultStyle
  const imagesByEmotion = useMemo(() => {
    const map = {}
    if (style) for (const img of style.images) map[img.emotion] = img
    return map
  }, [style])

  return (
    <tr className="border-b border-gray-800/60 last:border-b-0">
      <td className="sticky left-0 z-10 bg-gray-900 px-4 py-3 min-w-[180px]">
        <div className="flex items-center gap-3">
          {character.profileImage ? (
            <img src={character.profileImage} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-800" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-800" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-white truncate">{character.name}</p>
              {!character.isPublic && (
                <span className="text-[10px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded">비공개</span>
              )}
            </div>
            {style ? (
              <p className="text-[11px] text-gray-500 truncate">스타일: {style.name}</p>
            ) : (
              <Link
                to={`/admin/characters/${character.id}/styles`}
                className="text-[11px] text-amber-400 hover:text-amber-300"
                style={NO_OUTLINE}
              >
                스타일 추가하기 →
              </Link>
            )}
          </div>
        </div>
      </td>

      {EMOTIONS.map((e) => (
        <td key={e.key} className="px-2 py-3 text-center">
          {style ? (
            <EmotionCell
              styleId={style.id}
              emotion={e.key}
              image={imagesByEmotion[e.key]}
              onChange={(img) => onUpdateImage(character.id, e.key, img)}
            />
          ) : (
            <div className="w-16 h-16 mx-auto rounded-md bg-gray-800/40 border border-dashed border-gray-700/50" />
          )}
        </td>
      ))}
    </tr>
  )
}

function EmotionCell({ styleId, emotion, image, onChange }) {
  const [uploading, setUploading] = useState(false)

  const triggerUpload = () => {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('emotion', emotion)
        formData.append('description', '')
        const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, formData)
        onChange(uploaded)
      } catch (error) {
        console.error('Expression upload error:', error)
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }

  const remove = async (ev) => {
    ev.stopPropagation()
    if (!image) return
    if (!confirm('이 표정 이미지를 삭제하시겠습니까?')) return
    await api.delete(`/admin/images/${image.id}`)
    onChange(null)
  }

  return (
    <button
      type="button"
      onClick={triggerUpload}
      disabled={uploading}
      className={`relative w-16 h-16 mx-auto rounded-md overflow-hidden border-2 border-dashed flex items-center justify-center transition-colors group ${
        image ? 'border-gray-700 hover:border-indigo-500' : 'border-gray-700 hover:border-indigo-500 bg-gray-800/40'
      } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={NO_OUTLINE}
      title={image ? '클릭하여 교체' : '클릭하여 업로드'}
    >
      {uploading ? (
        <span className="text-[10px] text-gray-400">업로드중</span>
      ) : image ? (
        <>
          <img src={image.filePath} alt={emotion} className="w-full h-full object-cover" loading="lazy" />
          <span
            onClick={remove}
            className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="삭제"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        </>
      ) : (
        <span className="text-2xl text-gray-600">+</span>
      )}
    </button>
  )
}
