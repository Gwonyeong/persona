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
  { key: 'PLAYFUL', label: '장난' },
  { key: 'EXCITED', label: '설렘' },
]

function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const clean = url.split('?')[0].toLowerCase()
  return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v')
}

// 영상 패널 — 한 이미지의 videoFilePath 관리 (업로드 / AI 생성 / URL 연결 / 기존 영상 선택 / 삭제)
function VideoPanel({ img, styleId, onDone }) {
  // gen: null | { status: 'generating' | 'preview', videoUrl?: string }
  const [gen, setGen] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [linking, setLinking] = useState(false)
  const [prompt, setPrompt] = useState('')
  // mode: null | 'url' | 'picker'
  const [mode, setMode] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [pickerVideos, setPickerVideos] = useState(null) // null | array
  const [pickerLoading, setPickerLoading] = useState(false)
  // scope: 'emotion' (default) | 'all'
  const [pickerScope, setPickerScope] = useState('emotion')

  const openPicker = async (scope = 'emotion') => {
    setMode('picker')
    setPickerLoading(true)
    setPickerScope(scope)
    try {
      const q = scope === 'emotion' ? `?emotion=${img.emotion}` : ''
      const { videos } = await api.get(`/admin/styles/${styleId}/available-videos${q}`)
      // 자기 자신은 제외
      setPickerVideos(videos.filter((v) => v.videoUrl !== img.videoFilePath))
    } catch (err) {
      alert('영상 목록 불러오기 실패: ' + (err?.error || err?.message))
      setMode(null)
    } finally {
      setPickerLoading(false)
    }
  }

  const triggerFileUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/mp4,video/webm'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      setUploadingFile(true)
      const formData = new FormData()
      formData.append('video', file)
      await api.post(`/admin/images/${img.id}/video`, formData)
      setUploadingFile(false)
      onDone()
    }
    input.click()
  }

  const generateWithAI = async () => {
    setGen({ status: 'generating' })
    try {
      const { videoUrl } = await api.post(`/admin/images/${img.id}/generate-video-seedance`, { prompt: prompt.trim() || undefined })
      setGen({ status: 'preview', videoUrl })
    } catch (err) {
      alert('영상 생성 실패: ' + (err?.error || err?.message || '알 수 없는 오류'))
      setGen(null)
    }
  }

  const linkVideoUrl = async (url) => {
    if (!url) return
    setLinking(true)
    try {
      await api.post(`/admin/images/${img.id}/link-video`, { videoUrl: url })
      setGen(null)
      setMode(null)
      setUrlInput('')
      onDone()
    } catch (err) {
      alert('연결 실패: ' + (err?.error || err?.message || '알 수 없는 오류'))
    } finally {
      setLinking(false)
    }
  }

  const removeVideo = async () => {
    if (!confirm('연결된 영상을 삭제하시겠습니까?')) return
    await api.delete(`/admin/images/${img.id}/video`)
    onDone()
  }

  // 영상 있음 — 명확한 연결 표시 + 미리보기 + 해제
  if (img.videoFilePath) {
    return (
      <div className="mt-1.5 flex flex-col gap-1 bg-emerald-950/40 border border-emerald-700/40 rounded-md p-1">
        <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-400 font-semibold">
          🔗 연결됨
        </div>
        <video
          src={img.videoFilePath}
          className="w-full aspect-square rounded object-cover"
          autoPlay loop muted playsInline
        />
        <button
          onClick={removeVideo}
          className="text-xs text-red-400 hover:text-red-300"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          연결 해제
        </button>
      </div>
    )
  }

  // 생성 중
  if (gen?.status === 'generating') {
    return (
      <div className="mt-1 text-xs text-yellow-400 flex items-center gap-1 py-2">
        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="42 100" strokeLinecap="round" />
        </svg>
        생성 중...
      </div>
    )
  }

  // 생성 결과 미리보기
  if (gen?.status === 'preview') {
    return (
      <div className="mt-1 flex flex-col gap-0.5">
        <video
          src={gen.videoUrl}
          className="w-full aspect-square rounded object-cover"
          autoPlay loop muted playsInline
        />
        <button
          onClick={() => linkVideoUrl(gen.videoUrl)}
          disabled={linking}
          className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {linking ? '연결 중...' : '✓ 연결'}
        </button>
        <button
          onClick={() => setGen(null)}
          className="text-xs text-gray-500 hover:text-gray-400"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          취소
        </button>
      </div>
    )
  }

  // 기존 영상 picker
  if (mode === 'picker') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setMode(null)}>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">기존 영상 선택 — {img.emotion}</h3>
            <button
              onClick={() => setMode(null)}
              className="text-gray-400 hover:text-white text-sm"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              ✕
            </button>
          </div>

          {/* 스코프 토글 — 같은 감정 기본, 1:1 관계 */}
          <div className="flex gap-2 mb-1 text-xs">
            <button
              onClick={() => openPicker('emotion')}
              className={`px-2 py-1 rounded ${pickerScope === 'emotion' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              같은 감정만 (기본)
            </button>
            <button
              onClick={() => openPicker('all')}
              className={`px-2 py-1 rounded ${pickerScope === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              전체 감정
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">1:1 관계 · 선택한 영상은 이 이미지로 이전됩니다</p>

          {pickerLoading ? (
            <p className="text-gray-400 text-sm py-8 text-center">불러오는 중...</p>
          ) : pickerVideos && pickerVideos.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {pickerVideos.map((v, idx) => (
                <button
                  key={`${v.videoUrl}-${idx}`}
                  onClick={() => linkVideoUrl(v.videoUrl)}
                  disabled={linking}
                  className="flex flex-col gap-1 bg-gray-800 hover:bg-gray-700 rounded-lg overflow-hidden p-2 disabled:opacity-50"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <video
                    src={v.videoUrl}
                    className="w-full aspect-square rounded object-cover"
                    autoPlay loop muted playsInline
                    onMouseEnter={(e) => e.target.play()}
                  />
                  <div className="text-[10px] text-gray-300 text-center">{v.emotion}</div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-8 text-center">사용 가능한 영상이 없습니다.</p>
          )}
        </div>
      </div>
    )
  }

  // URL 입력 모드
  if (mode === 'url') {
    return (
      <div className="mt-1 flex flex-col gap-0.5">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="영상 URL"
          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] min-w-0"
        />
        <button
          onClick={() => linkVideoUrl(urlInput.trim())}
          disabled={!urlInput.trim() || linking}
          className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {linking ? '연결 중...' : '✓ URL 연결'}
        </button>
        <button
          onClick={() => { setMode(null); setUrlInput('') }}
          className="text-xs text-gray-500 hover:text-gray-400"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          취소
        </button>
      </div>
    )
  }

  // 기본 — 3가지 액션 (업로드 / URL / AI 생성)
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      <button
        onClick={triggerFileUpload}
        disabled={uploadingFile}
        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        {uploadingFile ? '업로드중...' : '🎬 파일 업로드'}
      </button>
      <button
        onClick={() => openPicker('emotion')}
        className="text-xs text-emerald-400 hover:text-emerald-300"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        📂 기존에서 선택
      </button>
      <button
        onClick={() => setMode('url')}
        className="text-xs text-cyan-400 hover:text-cyan-300"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        🔗 URL로 연결
      </button>
      <div className="flex items-center gap-0.5">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="프롬프트(선택)"
          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] min-w-0"
        />
        <button
          onClick={generateWithAI}
          className="text-[10px] text-violet-400 hover:text-violet-300 whitespace-nowrap"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          title="AI로 영상 생성"
        >
          🤖
        </button>
      </div>
    </div>
  )
}

export default function CharacterStyles() {
  const { id } = useParams()
  const [character, setCharacter] = useState(null)
  const [newStyleName, setNewStyleName] = useState('')
  const [newStyleDesc, setNewStyleDesc] = useState('')
  const [newStyleUnlockMode, setNewStyleUnlockMode] = useState('DEFAULT')
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
      unlockMode: newStyleUnlockMode,
    })
    setNewStyleName('')
    setNewStyleDesc('')
    setNewStyleUnlockMode('DEFAULT')
    load()
  }

  const setStyleUnlockMode = async (styleId, unlockMode) => {
    await api.put(`/admin/styles/${styleId}`, { unlockMode })
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
    input.accept = 'image/*,video/mp4,video/webm'
    input.onchange = (e) => {
      if (e.target.files[0]) uploadImage(styleId, emotion, e.target.files[0])
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
          <select
            value={newStyleUnlockMode}
            onChange={(e) => setNewStyleUnlockMode(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <option value="DEFAULT">기본 (대화 해금)</option>
            <option value="GACHA">가챠 전용</option>
          </select>
          <button
            onClick={addStyle}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 whitespace-nowrap"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            추가
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          가챠 전용 스타일은 일반 대화 해금 풀에서 제외되고, 가챠 STYLE_SET 보상으로만 통째 해금됩니다.
        </p>
      </div>

      {/* 스타일별 이미지 그리드 */}
      {character.styles.length === 0 ? (
        <p className="text-gray-500">등록된 스타일이 없습니다. 위에서 스타일을 추가해주세요.</p>
      ) : (
        character.styles.map((style) => (
          <div key={style.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  {style.name}
                  {style.unlockMode === 'GACHA' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-fuchsia-900/60 text-fuchsia-300 border border-fuchsia-700/50">
                      GACHA 전용
                    </span>
                  )}
                </h3>
                {style.description && (
                  <p className="text-xs text-gray-400">{style.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={style.unlockMode || 'DEFAULT'}
                  onChange={(e) => setStyleUnlockMode(style.id, e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <option value="DEFAULT">기본</option>
                  <option value="GACHA">가챠 전용</option>
                </select>
                <button
                  onClick={() => removeStyle(style.id)}
                  className="text-red-400 hover:text-red-300 text-xs"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  스타일 삭제
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {EMOTIONS.map(({ key, label }) => {
                // 1:1 정책 — 이미 linked된 URL과 동일한 standalone row(ghost)는 표시에서 제외
                const linkedUrls = new Set(style.images.map((i) => i.videoFilePath).filter(Boolean))
                const imgs = style.images.filter((i) => i.emotion === key && !(isVideoUrl(i.filePath) && linkedUrls.has(i.filePath)))
                const isUploading = uploading === `${style.id}-${key}`

                return (
                  <div key={key} className="text-center">
                    <p className="text-xs font-semibold text-gray-300 mb-1">{label}</p>

                    {/* 등록된 이미지/영상 — 각각 타입에 맞게 표시 */}
                    {imgs.map((img, idx) => {
                      const isStandaloneVideo = isVideoUrl(img.filePath)
                      return (
                        <div key={img.id} className={`relative ${idx > 0 ? 'mt-2 pt-2 border-t border-gray-800' : ''}`}>
                          {/* 썸네일 + 타입 배지 + 🔗 연결 배지 */}
                          <div className="relative aspect-square rounded-lg overflow-hidden">
                            {isStandaloneVideo ? (
                              <video src={img.filePath} className="w-full h-full object-cover" autoPlay loop muted playsInline preload="metadata" />
                            ) : (
                              <img src={img.filePath} alt={label} className="w-full h-full object-cover" />
                            )}
                            {/* 타입 배지 — 좌상단 */}
                            <div className={`absolute top-1 left-1 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isStandaloneVideo ? 'bg-amber-500/90' : 'bg-blue-500/90'}`}>
                              {isStandaloneVideo ? '🎥 영상' : '🖼 이미지'}
                            </div>
                            {/* 영상 연결 배지 — 우상단 (이미지 row에만) */}
                            {!isStandaloneVideo && img.videoFilePath && (
                              <div className="absolute top-1 right-1 bg-emerald-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                🔗
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => removeImage(img.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 mt-0.5"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            {isStandaloneVideo ? '영상 삭제' : '이미지 삭제'}
                          </button>

                          {/* 영상 패널 — 이미지 row에만 표시 (영상 row는 자체가 영상이라 불필요) */}
                          {!isStandaloneVideo && (
                            <VideoPanel img={img} styleId={style.id} onDone={load} />
                          )}
                          {isStandaloneVideo && (
                            <p className="text-[9px] text-amber-400/70 mt-1">
                              picker에서 이미지에<br/>연결 가능
                            </p>
                          )}
                        </div>
                      )
                    })}

                    {/* + 추가 슬롯 */}
                    <div
                      onClick={() => !isUploading && triggerUpload(style.id, key)}
                      className={`${imgs.length > 0 ? 'mt-2' : ''} aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden border-gray-700 hover:border-indigo-500`}
                    >
                      {isUploading ? (
                        <span className="text-xs text-gray-400">업로드중...</span>
                      ) : (
                        <span className="text-2xl text-gray-600">+</span>
                      )}
                    </div>
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
