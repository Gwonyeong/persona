import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

export default function AffinityImages() {
  const [characters, setCharacters] = useState(null)
  const [filter, setFilter] = useState('ALL') // ALL | WITH_CONTENT | EMPTY
  const [lightbox, setLightbox] = useState(null) // { images, index }
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    api.get('/admin/affinity-gallery').then(({ characters }) => setCharacters(characters || []))
  }, [])

  const handleDeleteImage = async (imageId) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return
    setDeletingId(imageId)
    try {
      await api.delete(`/admin/gallery-images/${imageId}`)
      setCharacters((prev) =>
        prev.map((c) => ({
          ...c,
          galleryContents: c.galleryContents.map((g) => ({
            ...g,
            images: g.images.filter((img) => img.id !== imageId),
          })),
        })),
      )
      setLightbox((lb) => {
        if (!lb) return lb
        const filtered = lb.images.filter((img) => img.id !== imageId)
        if (filtered.length === 0) return null
        return { ...lb, images: filtered, index: Math.min(lb.index, filtered.length - 1) }
      })
    } catch (error) {
      console.error('Delete image error:', error)
      alert('삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const visible = useMemo(() => {
    if (!characters) return []
    if (filter === 'WITH_CONTENT') return characters.filter((c) => c.galleryContents.length > 0)
    if (filter === 'EMPTY') return characters.filter((c) => c.galleryContents.length === 0)
    return characters
  }, [characters, filter])

  const totalContents = useMemo(
    () => (characters || []).reduce((sum, c) => sum + c.galleryContents.length, 0),
    [characters],
  )
  const totalImages = useMemo(
    () =>
      (characters || []).reduce(
        (sum, c) => sum + c.galleryContents.reduce((s, g) => s + (g.images?.length || 0), 0),
        0,
      ),
    [characters],
  )

  if (!characters) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">호감도 이미지</h2>
          <p className="text-sm text-gray-400 mt-1">
            캐릭터 {characters.length}명 · 콘텐츠 {totalContents}개 · 이미지 {totalImages}장
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
            <CharacterRow
              key={c.id}
              character={c}
              onOpenLightbox={setLightbox}
              onDeleteImage={handleDeleteImage}
              deletingId={deletingId}
            />
          ))}
        </div>
      )}

      {lightbox && <Lightbox state={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
    </div>
  )
}

function CharacterRow({ character, onOpenLightbox, onDeleteImage, deletingId }) {
  const contents = character.galleryContents

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
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white">{character.name}</p>
              {!character.isPublic && (
                <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">비공개</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              호감도 콘텐츠 {contents.length}개 ·{' '}
              {contents.reduce((s, g) => s + (g.images?.length || 0), 0)}장
            </p>
          </div>
        </div>
        <Link
          to={`/admin/characters/${character.id}/gallery`}
          className="text-xs text-indigo-400 hover:text-indigo-300"
          style={NO_OUTLINE}
        >
          관리하기 →
        </Link>
      </div>

      {contents.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-500">등록된 호감도 이미지가 없습니다.</div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          {contents.map((g) => (
            <GalleryStrip
              key={g.id}
              content={g}
              onClickImage={(imgIdx) => onOpenLightbox({ images: g.images, index: imgIdx, title: g.title })}
              onDeleteImage={onDeleteImage}
              deletingId={deletingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryStrip({ content, onClickImage, onDeleteImage, deletingId }) {
  const images = content.images || []

  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700/70 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-700/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-pink-300 bg-pink-900/30 px-2 py-0.5 rounded whitespace-nowrap">
            ♥ {content.affinityThreshold} 이상
          </span>
          {content.title ? (
            <p className="text-xs text-white truncate">{content.title}</p>
          ) : (
            <p className="text-xs text-gray-500 italic truncate">제목 없음</p>
          )}
          {content.description && (
            <p className="text-xs text-gray-500 truncate hidden md:block">— {content.description}</p>
          )}
        </div>
        <span className="text-[11px] text-gray-500 whitespace-nowrap">{images.length}장</span>
      </div>

      {images.length === 0 ? (
        <div className="px-3 py-4 text-xs text-gray-500">이미지 없음</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-3 py-3" style={{ scrollbarWidth: 'thin' }}>
          {images.map((img, idx) => {
            const deleting = deletingId === img.id
            return (
              <div
                key={img.id}
                className={`relative flex-shrink-0 w-28 aspect-[3/4] rounded-md overflow-hidden bg-gray-900 group ${
                  deleting ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => onClickImage(idx)}
                  className="block w-full h-full hover:ring-2 hover:ring-indigo-500 transition"
                  style={NO_OUTLINE}
                >
                  <img src={img.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                  {idx + 1}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteImage(img.id)
                  }}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  style={NO_OUTLINE}
                  title="이미지 삭제"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Lightbox({ state, onClose, setLightbox }) {
  const { images, index, title } = state
  const prev = () => setLightbox({ ...state, index: (index - 1 + images.length) % images.length })
  const next = () => setLightbox({ ...state, index: (index + 1) % images.length })

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 text-white">
          <p className="text-sm font-medium">{title || '이미지'}</p>
          <p className="text-xs text-gray-400">
            {index + 1} / {images.length}
          </p>
        </div>
        <div className="relative bg-gray-950 rounded-xl overflow-hidden">
          <img
            src={images[index].filePath}
            alt=""
            className="w-full max-h-[75vh] object-contain bg-black"
          />
          {images.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white"
                style={NO_OUTLINE}
              >
                ‹
              </button>
              <button
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white"
                style={NO_OUTLINE}
              >
                ›
              </button>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute -top-1 right-0 -translate-y-full text-white/80 hover:text-white text-sm"
          style={NO_OUTLINE}
        >
          닫기 ✕
        </button>
      </div>
    </div>
  )
}
