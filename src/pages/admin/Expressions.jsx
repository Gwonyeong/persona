import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const PAGE_SIZE = 10

// 일반 표정 (Safety Mode ON에서도 노출)
const SFW_EMOTIONS = [
  { key: 'NEUTRAL', label: '기본' },
  { key: 'HAPPY', label: '웃음' },
  { key: 'ANGRY', label: '화남' },
  { key: 'SAD', label: '슬픔' },
  { key: 'SHY', label: '부끄러움' },
  { key: 'WORRIED', label: '걱정' },
]

// 흥분 표정 (NSFW) — 성인 인증 + Safety Mode OFF 유저에게만 출력
// desc는 운영자가 어떤 컨셉의 이미지를 업로드해야 하는지 안내.
const NSFW_EMOTIONS = [
  { key: 'AROUSED_TEASE', label: '도발', desc: '옷 흐트러짐 · 살짝 노출 (어깨·허벅지·속옷 비침) · 도발적 미소' },
  { key: 'AROUSED_TOPLESS', label: '상의 노출', desc: '가슴 노출, 하의는 착용한 상태' },
  { key: 'AROUSED_NUDE', label: '전라', desc: '완전 노출 · 행위 전 정지 포즈' },
  { key: 'AROUSED_FOREPLAY', label: '애무', desc: '키스 · 터치 · 구강 등 전희 단계' },
  { key: 'AROUSED_INSERT', label: '삽입', desc: '결합 컷 · 정상위 권장 (가장 범용)' },
  { key: 'AROUSED_INSERT_ALT', label: '삽입(체위2)', desc: '후배위 / 기승위 등 변형 체위' },
  { key: 'AROUSED_CLIMAX', label: '절정', desc: '정점 순간 · 눈물 그렁 · 입 벌어짐 · 무방비 표정' },
  { key: 'AROUSED_AFTERGLOW', label: '여운', desc: '마무리 · 나른함 · 풀린 표정 · 절정 후 정적' },
]

const EMOTION_TABS = {
  sfw: { label: '일반', emotions: SFW_EMOTIONS },
  nsfw: { label: '흥분 (NSFW)', emotions: NSFW_EMOTIONS },
}

// 'bg'는 emotions를 안 쓰고 별도 컴포넌트로 렌더링.
const TABS = [
  { id: 'sfw', label: '일반' },
  { id: 'nsfw', label: '흥분 (NSFW)' },
  { id: 'bg', label: '배경' },
]

export default function Expressions() {
  const [characters, setCharacters] = useState(null)
  const [filter, setFilter] = useState('ALL') // ALL | INCOMPLETE | NO_STYLE
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState('sfw') // sfw | nsfw | bg
  const currentEmotions = tab === 'bg' ? [] : EMOTION_TABS[tab].emotions

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
      // 현재 탭의 emotion 풀 기준 미완성 판단
      const tabKeys = new Set(currentEmotions.map((e) => e.key))
      return characters.filter((c) => {
        if (!c.defaultStyle) return false
        const filled = c.defaultStyle.images.filter((i) => tabKeys.has(i.emotion)).length
        return filled < currentEmotions.length
      })
    }
    if (filter === 'NO_STYLE') return characters.filter((c) => !c.defaultStyle)
    return characters
  }, [characters, filter, currentEmotions])

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
        <div className="flex items-center gap-3">
          {/* 탭: 일반 / NSFW / 배경 */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {TABS.map((def) => (
              <button
                key={def.id}
                onClick={() => {
                  setTab(def.id)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  tab === def.id
                    ? def.id === 'nsfw'
                      ? 'bg-pink-600 text-white'
                      : def.id === 'bg'
                        ? 'bg-amber-600 text-white'
                        : 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                style={NO_OUTLINE}
              >
                {def.label}
              </button>
            ))}
          </div>
          {/* 필터 (표정 탭에서만) */}
          {tab !== 'bg' && (
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
          )}
        </div>
      </div>

      {tab === 'nsfw' && (
        <div className="mb-4 bg-pink-950/30 border border-pink-800/40 rounded-xl px-4 py-3">
          <p className="text-xs text-pink-200 leading-relaxed">
            <span className="font-semibold">흥분 단계 가이드</span> — 서사 진행 순서로 배치되어 있습니다.
            도발 → 노출 → 행위 → 절정 → 여운. 각 열의 안내를 보고 캐릭터별로 적합한 이미지를 업로드하세요.
            모든 슬롯을 채울 필요는 없습니다 — 캐릭터 컨셉에 맞는 단계만 채우면 AI가 자동으로 매칭합니다.
          </p>
        </div>
      )}

      {tab === 'bg' ? (
        <BackgroundsTab />
      ) : filtered.length === 0 ? (
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
                  {currentEmotions.map((e) => (
                    <th
                      key={e.key}
                      className={`text-center text-xs font-medium text-gray-400 px-2 py-3 align-top ${e.desc ? 'min-w-[140px]' : 'min-w-[88px]'}`}
                      title={e.desc || undefined}
                    >
                      <div className="text-gray-200">{e.label}</div>
                      {e.desc && (
                        <p className="mt-1 text-[10px] text-gray-500 font-normal leading-snug whitespace-normal">{e.desc}</p>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => (
                  <CharacterRow key={c.id} character={c} emotions={currentEmotions} onUpdateImage={updateImage} />
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

function CharacterRow({ character, emotions, onUpdateImage }) {
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

      {emotions.map((e) => (
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
  const [dragOver, setDragOver] = useState(false)

  const uploadFile = async (file) => {
    if (!file || !file.type?.startsWith('image/')) return
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

  const triggerUpload = () => {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (file) await uploadFile(file)
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

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (uploading) return
    if (!dragOver) setDragOver(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (uploading) return
    const file = e.dataTransfer?.files?.[0]
    if (file) await uploadFile(file)
  }

  return (
    <button
      type="button"
      onClick={triggerUpload}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      disabled={uploading}
      className={`relative w-16 h-16 mx-auto rounded-md overflow-hidden border-2 flex items-center justify-center transition-colors group ${
        dragOver
          ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-500/40'
          : `border-dashed ${image ? 'border-gray-700 hover:border-indigo-500' : 'border-gray-700 hover:border-indigo-500 bg-gray-800/40'}`
      } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={NO_OUTLINE}
      title={image ? '클릭 또는 드래그하여 교체' : '클릭 또는 드래그하여 업로드'}
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

// ============================================
// 배경 탭 — 라이브러리(전역 풀) + 캐릭터별 할당
// ============================================

function BackgroundsTab() {
  const [library, setLibrary] = useState(null)
  const [assignments, setAssignments] = useState(null) // [{id, name, profileImage, backgrounds: [{id, order, background:{id,filePath,tags}}]}]
  const [pickerForCharacter, setPickerForCharacter] = useState(null)
  const [libraryDragOver, setLibraryDragOver] = useState(false)
  const [batchUploading, setBatchUploading] = useState(false)

  const reloadLibrary = () =>
    api.get('/admin/background-library').then(({ items }) => setLibrary(items || []))
  const reloadAssignments = () =>
    api
      .get('/admin/background-assignments-overview')
      .then(({ characters }) => setAssignments(characters || []))

  useEffect(() => {
    reloadLibrary()
    reloadAssignments()
  }, [])

  const handleUpload = async (file, tags) => {
    const fd = new FormData()
    fd.append('image', file)
    fd.append('tags', JSON.stringify(tags))
    await api.post('/admin/background-library', fd)
    await reloadLibrary()
  }

  // 드래그앤드롭: 여러 파일 동시 업로드. 태그는 한 번 prompt로 받아 모든 파일에 공통 적용.
  const handleDropFiles = async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type?.startsWith('image/'))
    if (imageFiles.length === 0) return
    const tagInput = prompt(
      `태그를 콤마(,)로 구분해 입력하세요 (${imageFiles.length}개 파일에 공통 적용. 예: 카페, 실내, 낮)`,
      '',
    )
    if (tagInput === null) return // 취소
    const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    setBatchUploading(true)
    try {
      for (const file of imageFiles) {
        try {
          await handleUpload(file, tags)
        } catch (err) {
          console.error('Background upload error:', err)
        }
      }
    } finally {
      setBatchUploading(false)
    }
  }

  const handleLibraryDragOver = (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    if (!libraryDragOver) setLibraryDragOver(true)
  }
  const handleLibraryDragLeave = (e) => {
    e.preventDefault()
    // 자식 요소 위로 이동한 경우 무시
    if (e.currentTarget.contains(e.relatedTarget)) return
    setLibraryDragOver(false)
  }
  const handleLibraryDrop = async (e) => {
    e.preventDefault()
    setLibraryDragOver(false)
    if (e.dataTransfer?.files?.length) {
      await handleDropFiles(e.dataTransfer.files)
    }
  }

  const handleDeleteLibrary = async (id) => {
    if (!confirm('이 배경 이미지를 라이브러리에서 삭제할까요? 할당된 모든 캐릭터에서도 제거됩니다.')) return
    await api.delete(`/admin/background-library/${id}`)
    await Promise.all([reloadLibrary(), reloadAssignments()])
  }

  const handleUpdateTags = async (id, tags) => {
    await api.patch(`/admin/background-library/${id}`, { tags })
    await reloadLibrary()
  }

  const handleAssign = async (characterId, backgroundIds) => {
    await api.post(`/admin/characters/${characterId}/backgrounds`, { backgroundIds })
    await reloadAssignments()
    setPickerForCharacter(null)
  }

  const handleUnassign = async (characterId, backgroundId) => {
    await api.delete(`/admin/characters/${characterId}/backgrounds/${backgroundId}`)
    await reloadAssignments()
  }

  if (!library || !assignments) return <div className="text-gray-400">로딩 중...</div>

  return (
    <>
      {/* 라이브러리 — 영역 전체가 drop zone */}
      <section
        className={`mb-8 rounded-xl transition-colors ${
          libraryDragOver ? 'bg-amber-500/10 ring-2 ring-amber-500/40 p-3' : ''
        }`}
        onDragOver={handleLibraryDragOver}
        onDragEnter={handleLibraryDragOver}
        onDragLeave={handleLibraryDragLeave}
        onDrop={handleLibraryDrop}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">배경 라이브러리</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              전역 풀 · {library.length}개 · 이미지를 이 영역에 드래그하면 일괄 업로드
              {batchUploading && <span className="ml-2 text-amber-400">업로드 중...</span>}
            </p>
          </div>
          <LibraryUploadButton onUpload={handleUpload} />
        </div>

        {library.length === 0 ? (
          <div className="bg-gray-900/60 border border-dashed border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
            아직 등록된 배경이 없습니다. 우측 상단 버튼을 누르거나 이미지를 드래그해서 추가하세요.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {library.map((bg) => (
              <LibraryCard
                key={bg.id}
                bg={bg}
                onDelete={() => handleDeleteLibrary(bg.id)}
                onUpdateTags={(tags) => handleUpdateTags(bg.id, tags)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 캐릭터별 할당 */}
      <section>
        <h3 className="text-sm font-semibold text-white mb-3">캐릭터별 배경 할당</h3>
        <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
          {assignments.map((c) => (
            <CharacterBackgroundRow
              key={c.id}
              character={c}
              onAddClick={() => setPickerForCharacter(c.id)}
              onUnassign={(bid) => handleUnassign(c.id, bid)}
            />
          ))}
        </div>
      </section>

      {/* 라이브러리 픽커 모달 */}
      {pickerForCharacter && (
        <LibraryPickerModal
          library={library}
          alreadyAssigned={
            new Set(
              (assignments.find((c) => c.id === pickerForCharacter)?.backgrounds || []).map(
                (b) => b.background.id,
              ),
            )
          }
          onClose={() => setPickerForCharacter(null)}
          onConfirm={(ids) => handleAssign(pickerForCharacter, ids)}
        />
      )}
    </>
  )
}

function LibraryUploadButton({ onUpload }) {
  const [uploading, setUploading] = useState(false)
  const trigger = () => {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const tagInput = prompt('태그를 콤마(,)로 구분해 입력하세요 (예: 카페, 실내, 낮)', '') || ''
      const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
      setUploading(true)
      try {
        await onUpload(file, tags)
      } catch (err) {
        console.error('Background upload error:', err)
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }
  return (
    <button
      onClick={trigger}
      disabled={uploading}
      className="px-3 py-1.5 rounded-md text-sm bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
      style={NO_OUTLINE}
    >
      {uploading ? '업로드 중...' : '+ 배경 업로드'}
    </button>
  )
}

function LibraryCard({ bg, onDelete, onUpdateTags }) {
  const [editing, setEditing] = useState(false)
  const [tagInput, setTagInput] = useState((bg.tags || []).join(', '))

  const saveTags = async () => {
    const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    await onUpdateTags(tags)
    setEditing(false)
  }

  return (
    <div className="group relative rounded-lg overflow-hidden bg-gray-800/40 border border-gray-700/50">
      <div className="aspect-[4/3] bg-gray-800 overflow-hidden">
        <img src={bg.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="p-2">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="태그 (콤마 구분)"
              className="w-full text-[11px] bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
              style={NO_OUTLINE}
            />
            <div className="flex gap-1">
              <button
                onClick={saveTags}
                className="flex-1 text-[10px] py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                style={NO_OUTLINE}
              >저장</button>
              <button
                onClick={() => { setEditing(false); setTagInput((bg.tags || []).join(', ')) }}
                className="flex-1 text-[10px] py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                style={NO_OUTLINE}
              >취소</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} className="cursor-pointer min-h-[20px]">
            {bg.tags?.length ? (
              <div className="flex flex-wrap gap-1">
                {bg.tags.map((t) => (
                  <span key={t} className="text-[10px] bg-gray-700/60 text-gray-200 px-1.5 py-0.5 rounded">{t}</span>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-gray-500 italic">+ 태그 추가</span>
            )}
          </div>
        )}
        <p className="text-[10px] text-gray-500 mt-1.5">{bg._count?.assignments ?? 0}개 캐릭터에 사용 중</p>
      </div>
      <button
        onClick={onDelete}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        style={NO_OUTLINE}
        title="삭제"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function CharacterBackgroundRow({ character, onAddClick, onUnassign }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-[160px]">
        {character.profileImage ? (
          <img src={character.profileImage} alt="" className="w-7 h-7 rounded-full object-cover bg-gray-800" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-800" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{character.name}</p>
          {!character.isPublic && (
            <span className="text-[10px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded">비공개</span>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-wrap items-center gap-2">
        {character.backgrounds.map((b) => (
          <div key={b.background.id} className="relative group">
            <div className="w-14 h-10 rounded-md overflow-hidden bg-gray-800 border border-gray-700/60">
              <img src={b.background.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <button
              onClick={() => onUnassign(b.background.id)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              style={NO_OUTLINE}
              title="해제"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
        <button
          onClick={onAddClick}
          className="w-14 h-10 rounded-md border border-dashed border-gray-600 hover:border-amber-500 text-gray-500 hover:text-amber-400 text-xs"
          style={NO_OUTLINE}
        >
          +
        </button>
      </div>
    </div>
  )
}

function LibraryPickerModal({ library, alreadyAssigned, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set())
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-3xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">라이브러리에서 추가</h3>
          <span className="text-[11px] text-gray-500">{selected.size}개 선택됨</span>
        </div>

        {library.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">라이브러리가 비어 있습니다.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mb-4">
            {library.map((bg) => {
              const isAssigned = alreadyAssigned.has(bg.id)
              const isSelected = selected.has(bg.id)
              return (
                <button
                  key={bg.id}
                  onClick={() => !isAssigned && toggle(bg.id)}
                  disabled={isAssigned}
                  className={`relative aspect-[4/3] rounded-md overflow-hidden border-2 transition-all ${
                    isAssigned
                      ? 'border-gray-700 opacity-40 cursor-not-allowed'
                      : isSelected
                        ? 'border-amber-500'
                        : 'border-transparent hover:border-gray-500'
                  }`}
                  style={NO_OUTLINE}
                >
                  <img src={bg.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {isAssigned && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-[10px] text-gray-300">이미 할당됨</span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                  {bg.tags?.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[9px] text-white truncate">{bg.tags.slice(0, 3).join(', ')}</p>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg"
            style={NO_OUTLINE}
          >취소</button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="flex-1 py-2 text-sm text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
            style={NO_OUTLINE}
          >추가 ({selected.size})</button>
        </div>
      </div>
    </div>
  )
}
