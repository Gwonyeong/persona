import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import JSZip from 'jszip'
import { api } from '../../lib/api'
import { removeChromaBackground } from '../../lib/removeChromaBackground'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const PAGE_SIZE = 10

// 표정 sprite 미디어 — 비디오(mp4/webm/...)는 자동재생/루프/음소거로 미리보기.
// 채팅 출력 시에도 동일하게 음소거로 재생됨.
function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const clean = url.split('?')[0].toLowerCase()
  return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v')
}
function ExpressionThumb({ src, className = '' }) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return <img src={src} alt="" className={className} loading="lazy" />
}

// 서버 buildExpressionPrompt의 디폴트 구도 문구와 일치시킨다.
const DEFAULT_COMPOSITION_KO = '정면(eye-level) 상반신 포트레이트, 인물 중앙 정렬, 레퍼런스와 동일한 크롭·조명'
const DEFAULT_COMPOSITION_EN =
  'eye-level head-and-shoulders portrait, character centered, identical framing and crop to the reference, same lighting style as the reference'

// 배경 옵션 — server/src/lib/expressionPrompt.js와 동기화.
const BACKGROUND_LINES = {
  black:
    'Background: a perfectly flat, solid, pure black (#000000, rgb(0,0,0)) background. No gradients, no shadows on the background, no patterns, no objects, no scenery, no environmental details. Pure flat black only, edge to edge.',
  cyan:
    'Background: a perfectly flat, solid, pure cyan (#00FFFF, rgb(0,255,255)) chroma-key background. No gradients, no shadows on the background, no patterns, no objects, no scenery, no environmental details. Pure flat cyan only, edge to edge. The character itself must NOT contain any cyan/turquoise/aqua color — only the background is cyan.',
}

// 서버 buildExpressionPrompt와 동일한 조립 순서로 전문(全文)을 만든다.
// posePrompt는 운영자가 모달에서 추가 입력하는 값이라 기본 미리보기에서는 비움.
function buildExpressionPromptPreview(emotion, { background = 'black', posePrompt = '' } = {}) {
  const expr = EXPRESSION_PROMPTS[emotion] || 'a clear, distinct emotional expression matching the emotion label'
  const trimmedPose = (posePrompt || '').trim()
  const lines = [
    'Strictly preserve the art style, character design, face shape, hair color, hairstyle, outfit, and body type of the provided reference image. Recreate the exact same character.',
    `Change the facial expression to: ${expr}.`,
    `Default composition: ${DEFAULT_COMPOSITION_EN}.`,
  ]
  if (trimmedPose) {
    lines.push(
      `Additional composition / pose guidance (this overrides the default above when it specifies a different framing, angle, or pose): ${trimmedPose}.`,
    )
  }
  lines.push(BACKGROUND_LINES[background] || BACKGROUND_LINES.black)
  lines.push('No text, no watermarks, no logos anywhere.')
  return lines.join(' ')
}

// 일반 표정 (Safety Mode ON에서도 노출)
const SFW_EMOTIONS = [
  { key: 'NEUTRAL', label: '기본' },
  { key: 'HAPPY', label: '웃음' },
  { key: 'ANGRY', label: '화남' },
  { key: 'SAD', label: '슬픔' },
  { key: 'SHY', label: '설렘' },
]

// server/src/lib/expressionPrompt.js#EXPRESSION_DESCRIPTORS와 동기화. 서버 변경 시 같이 수정.
const EXPRESSION_PROMPTS = {
  NEUTRAL: 'calm, relaxed neutral expression, soft closed mouth, eyes looking forward, no strong emotion',
  HAPPY: 'bright joyful smile with mouth slightly open, eyes warmly squinted from genuine happiness, cheeks lifted',
  ANGRY: 'furrowed angry brow, narrowed glaring eyes, tightly pressed lips or a sharp scowl, intense irritation',
  SAD: 'downturned mouth, glossy slightly tearful eyes, drooped eyelids, head tilted very slightly downward, sorrowful',
  SURPRISED: 'eyes wide open, eyebrows raised high, mouth slightly opened in a small "oh" of surprise',
  SHY: 'flustered, heart-fluttering expression of someone smitten with the person in front of them — clearly visible warm blush across the cheeks and nose bridge, eyes shyly glancing to the side or downward as if unable to hold the gaze, a soft bashful smile gently curling the lips, slightly tilted head, subtle look of infatuation and quiet excitement',
  ANNOYED: 'slightly furrowed brow, sideways sulky glance, mouth set in a small displeased line, mildly annoyed',
  WORRIED: 'softly furrowed concerned brow, slightly downturned mouth, anxious wide eyes, gentle worry',
  PLAYFUL: 'mischievous closed-mouth smile or smirk, eyes glinting with playful intent, head tilted slightly',
  EXCITED: 'wide bright open smile with eyes lit up, eager animated expression, joyful energy',
  AROUSED_TEASE: 'flirty teasing smirk, half-lidded suggestive eyes, subtle blush, playful expression',
  AROUSED_TOPLESS: 'soft heated expression, parted lips, half-lidded eyes, subtle blush',
  AROUSED_NUDE: 'soft anticipatory expression, slightly parted lips, half-lidded eyes, light blush',
  AROUSED_FOREPLAY: 'lost in sensation, eyes half-closed, mouth slightly open, deep blush',
  AROUSED_INSERT: 'eyes squeezed shut or unfocused, mouth open in a quiet gasp, deep blush, intense expression',
  AROUSED_INSERT_ALT: 'eyes half-closed, mouth open in a heated gasp, flushed cheeks, intense expression',
  AROUSED_CLIMAX: 'eyes welling with tears or rolled slightly up, mouth open in a quiet cry, deep blush, defenseless expression at the peak',
  AROUSED_AFTERGLOW: 'soft dazed expression, half-lidded peaceful eyes, faint smile, languid afterglow',
}

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

  // 같은 (styleId, emotion)에 여러 이미지 허용 — 추가/삭제/업데이트 별도 핸들러.
  const addImage = (characterId, image) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== characterId || !c.defaultStyle) return c
        const next = [
          ...c.defaultStyle.images,
          { id: image.id, emotion: image.emotion, filePath: image.filePath, videoFilePath: image.videoFilePath ?? null },
        ]
        return { ...c, defaultStyle: { ...c.defaultStyle, images: next } }
      }),
    )
  }
  const removeImage = (characterId, imageId) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== characterId || !c.defaultStyle) return c
        const next = c.defaultStyle.images.filter((i) => i.id !== imageId)
        return { ...c, defaultStyle: { ...c.defaultStyle, images: next } }
      }),
    )
  }
  const updateImage = (characterId, imageId, patch) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== characterId || !c.defaultStyle) return c
        const next = c.defaultStyle.images.map((i) => (i.id === imageId ? { ...i, ...patch } : i))
        return { ...c, defaultStyle: { ...c.defaultStyle, images: next } }
      }),
    )
  }

  const filtered = useMemo(() => {
    if (!characters) return []
    if (filter === 'INCOMPLETE') {
      // 현재 탭의 emotion 중 1장도 없는 게 있으면 미완성 (다중 이미지 모드)
      const tabKeys = new Set(currentEmotions.map((e) => e.key))
      return characters.filter((c) => {
        if (!c.defaultStyle) return false
        const filledEmotions = new Set(
          c.defaultStyle.images.filter((i) => tabKeys.has(i.emotion)).map((i) => i.emotion),
        )
        return filledEmotions.size < currentEmotions.length
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

      {tab !== 'bg' && (
        <ExpressionPromptReference emotions={currentEmotions} />
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
                  <CharacterRow
                    key={c.id}
                    character={c}
                    emotions={currentEmotions}
                    onAddImage={(img) => addImage(c.id, img)}
                    onRemoveImage={(imageId) => removeImage(c.id, imageId)}
                    onUpdateImage={(imageId, patch) => updateImage(c.id, imageId, patch)}
                  />
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

// 표정별 AI 생성에 실제로 사용되는 전문 프롬프트(영문)를 그대로 노출.
// 일괄 생성 기준(배경 검정)으로 조립한다. 단일 생성 모달은 시안 배경을 쓰지만,
// 표정 묘사·구도·금지사항 등 다른 라인은 동일하므로 운영자가 참고 가능.
function ExpressionPromptReference({ emotions }) {
  const [copiedKey, setCopiedKey] = useState(null)
  const copyTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(copyTimerRef.current), [])

  const copyPrompt = async (key, text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // 구형 브라우저 / insecure context fallback.
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiedKey(key)
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), 1500)
    } catch (err) {
      console.error('프롬프트 복사 실패:', err)
    }
  }

  if (!emotions || emotions.length === 0) return null
  return (
    <details className="mb-4 bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden group">
      <summary
        className="cursor-pointer select-none px-4 py-3 text-sm text-gray-200 hover:bg-gray-800/40 flex items-center justify-between gap-2"
        style={NO_OUTLINE}
      >
        <span>
          <span className="font-semibold">🧠 AI 생성 프롬프트 전문</span>
          <span className="text-[11px] text-gray-500 ml-2">
            ({emotions.length}개 표정 · 일괄 생성 기준 — 검정 배경 · 클릭하면 복사)
          </span>
        </span>
        <span className="text-[11px] text-gray-500 group-open:hidden">펼치기</span>
        <span className="text-[11px] text-gray-500 hidden group-open:inline">접기</span>
      </summary>
      <div className="border-t border-gray-800 divide-y divide-gray-800/70">
        {emotions.map((e) => {
          const promptText = buildExpressionPromptPreview(e.key, { background: 'black' })
          const isCopied = copiedKey === e.key
          return (
            <div key={e.key} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-white">{e.label}</span>
                <span className="text-[10px] text-gray-500">{e.key}</span>
                {isCopied && (
                  <span className="text-[10px] text-emerald-400 ml-auto">✓ 복사됨</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => copyPrompt(e.key, promptText)}
                title="클릭하여 클립보드로 복사"
                className={`w-full text-left text-[11px] leading-relaxed whitespace-pre-wrap break-words rounded-md px-2 py-1.5 -mx-2 cursor-pointer transition-colors ${
                  isCopied
                    ? 'bg-emerald-500/10 text-emerald-100'
                    : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
                }`}
                style={NO_OUTLINE}
              >
                {promptText}
              </button>
            </div>
          )
        })}
      </div>
    </details>
  )
}

function CharacterRow({ character, emotions, onAddImage, onRemoveImage, onUpdateImage }) {
  const style = character.defaultStyle
  const [frameGalleryOpen, setFrameGalleryOpen] = useState(false)
  const [aiGenOpen, setAiGenOpen] = useState(false)

  // 한 emotion에 여러 이미지 가능 — 배열로 그룹화.
  const imagesByEmotion = useMemo(() => {
    const map = {}
    if (style) for (const img of style.images) {
      if (!map[img.emotion]) map[img.emotion] = []
      map[img.emotion].push(img)
    }
    return map
  }, [style])

  return (
    <>
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
                <>
                  <p className="text-[11px] text-gray-500 truncate">스타일: {style.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => setFrameGalleryOpen(true)}
                      className="text-[10px] text-indigo-300 hover:text-indigo-200"
                      style={NO_OUTLINE}
                      title="Seedance로 추출한 프레임 이미지 보기"
                    >
                      🎞 추출 이미지
                    </button>
                    <button
                      onClick={() => setAiGenOpen(true)}
                      className="text-[10px] text-amber-300 hover:text-amber-200"
                      style={NO_OUTLINE}
                      title="이미지 선택 → 분석 → 변형 or 영상 생성"
                    >
                      🤖 AI 생성
                    </button>
                  </div>
                </>
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
                characterId={character.id}
                styleId={style.id}
                emotion={e.key}
                emotionLabel={e.label}
                images={imagesByEmotion[e.key] || []}
                allStyleImages={style.images || []}
                onAdd={onAddImage}
                onRemove={onRemoveImage}
                onUpdate={onUpdateImage}
              />
            ) : (
              <div className="w-16 h-16 mx-auto rounded-md bg-gray-800/40 border border-dashed border-gray-700/50" />
            )}
          </td>
        ))}
      </tr>

      {frameGalleryOpen && createPortal(
        <VideoFrameGalleryModal
          characterId={character.id}
          characterName={character.name}
          onClose={() => setFrameGalleryOpen(false)}
        />,
        document.body,
      )}

      {aiGenOpen && style && createPortal(
        <AiGenerationModal
          styleId={style.id}
          allImages={style.images || []}
          onClose={() => setAiGenOpen(false)}
          onUploaded={() => {}}
        />,
        document.body,
      )}
    </>
  )
}

function EmotionCell({ characterId, styleId, emotion, emotionLabel, images, allStyleImages, onAdd, onRemove, onUpdate }) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const hasImages = images.length > 0
  const firstImage = hasImages ? images[0] : null

  const uploadFile = async (file) => {
    if (!file) return
    // 이미지 또는 비디오만 허용 (서버 uploadSprite와 일치)
    if (!file.type?.startsWith('image/') && !file.type?.startsWith('video/')) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('emotion', emotion)
      formData.append('description', '')
      const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, formData)
      onAdd({ ...uploaded, emotion })
    } catch (error) {
      console.error('Expression upload error:', error)
    } finally {
      setUploading(false)
    }
  }

  const triggerUploadDirect = () => {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/mp4,video/webm'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (file) await uploadFile(file)
    }
    input.click()
  }

  const handleClick = () => {
    if (uploading) return
    // 이미지 유무와 관계없이 매니저 열기 (업로드 + AI 생성 두 옵션 노출)
    setManagerOpen(true)
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
    <>
      <button
        type="button"
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={uploading}
        className={`relative w-16 h-16 mx-auto rounded-md overflow-hidden border-2 flex items-center justify-center transition-colors group ${
          dragOver
            ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-500/40'
            : `border-dashed ${hasImages ? 'border-gray-700 hover:border-indigo-500' : 'border-gray-700 hover:border-indigo-500 bg-gray-800/40'}`
        } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={NO_OUTLINE}
        title={hasImages ? `${images.length}장 — 클릭하여 관리 / 드래그하여 추가` : '클릭 또는 드래그하여 업로드'}
      >
        {uploading ? (
          <span className="text-[10px] text-gray-400">업로드중</span>
        ) : firstImage ? (
          <>
            <ExpressionThumb src={firstImage.filePath} className="w-full h-full object-cover" />
            {images.length > 1 && (
              <span className="absolute bottom-0.5 right-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-black/70 text-white pointer-events-none">
                +{images.length - 1}
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl text-gray-600">+</span>
        )}
      </button>

      {managerOpen && (
        <EmotionSlotManager
          characterId={characterId}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          images={images}
          allStyleImages={allStyleImages}
          onClose={() => setManagerOpen(false)}
          onUpload={uploadFile}
          uploading={uploading}
          onRemove={onRemove}
          onAdd={onAdd}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}

// 감정 순서 — 이전 감정 추론에 사용
const PREV_EMOTION_MAP = {
  AROUSED_TOPLESS: 'AROUSED_TEASE',
  AROUSED_NUDE: 'AROUSED_TOPLESS',
  AROUSED_FOREPLAY: 'AROUSED_NUDE',
  AROUSED_INSERT: 'AROUSED_FOREPLAY',
  AROUSED_INSERT_ALT: 'AROUSED_INSERT',
  AROUSED_CLIMAX: 'AROUSED_INSERT_ALT',
  AROUSED_AFTERGLOW: 'AROUSED_CLIMAX',
}

function EmotionSlotManager({ characterId, styleId, emotion, emotionLabel, images, allStyleImages, onClose, onUpload, uploading, onRemove, onAdd, onUpdate }) {
  const [removingId, setRemovingId] = useState(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [bgImage, setBgImage] = useState(null)
  const [seedanceImage, setSeedanceImage] = useState(null)
  const [fromFrameOpen, setFromFrameOpen] = useState(false)
  const [wanImage, setWanImage] = useState(null)
  // 영상 연결 picker — 어떤 이미지 row에 어떤 영상을 붙일지 선택.
  const [linkPickerForImage, setLinkPickerForImage] = useState(null) // CharacterImage object or null
  const [linkingVideoId, setLinkingVideoId] = useState(null)
  const [unlinkingId, setUnlinkingId] = useState(null)

  // 사용 가능한 standalone 영상 풀 — 1:1 정책상 이미 linked된 URL은 제외
  // 기본은 같은 감정만 (linkPickerForImage 기준), 토글로 전체 감정 보기 가능
  const [pickerScope, setPickerScope] = useState('emotion') // 'emotion' | 'all'

  const availableVideos = useMemo(() => {
    if (!linkPickerForImage) return []
    const linkedUrls = new Set((allStyleImages || []).map((i) => i.videoFilePath).filter(Boolean))
    const seen = new Set()
    const list = []
    for (const i of allStyleImages || []) {
      if (!isVideoUrl(i.filePath)) continue
      if (linkedUrls.has(i.filePath)) continue // 이미 다른 이미지에 1:1로 연결됨
      if (seen.has(i.filePath)) continue
      if (pickerScope === 'emotion' && i.emotion !== linkPickerForImage.emotion) continue
      seen.add(i.filePath)
      list.push({ videoUrl: i.filePath, thumbnailUrl: i.filePath, emotion: i.emotion })
    }
    return list
  }, [allStyleImages, linkPickerForImage, pickerScope])

  const handleLinkVideo = async (imageId, videoUrl) => {
    setLinkingVideoId(videoUrl)
    try {
      const res = await api.post(`/admin/images/${imageId}/link-video`, { videoUrl })
      onUpdate?.(imageId, { videoFilePath: res.image.videoFilePath })
      // 소모된 standalone row는 로컬 state에서 제거
      if (res.consumedStandalone) onRemove?.(res.consumedStandalone)
      // 1:1 정책으로 이전 연결 해제된 이미지 반영
      if (res.transferredFrom) onUpdate?.(res.transferredFrom, { videoFilePath: null })
      setLinkPickerForImage(null)
    } catch (err) {
      alert('연결 실패: ' + (err?.error || err?.message))
    } finally {
      setLinkingVideoId(null)
    }
  }

  const handleUnlinkVideo = async (imageId) => {
    if (!confirm('이 이미지의 영상 연결을 해제하시겠습니까?')) return
    setUnlinkingId(imageId)
    try {
      await api.delete(`/admin/images/${imageId}/video`)
      onUpdate?.(imageId, { videoFilePath: null })
    } catch (err) {
      alert('해제 실패: ' + (err?.error || err?.message))
    } finally {
      setUnlinkingId(null)
    }
  }

  const triggerUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/mp4,video/webm'
    input.multiple = true
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || [])
      for (const f of files) await onUpload(f)
    }
    input.click()
  }

  const handleRemove = async (imageId) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return
    setRemovingId(imageId)
    try {
      await api.delete(`/admin/images/${imageId}`)
      onRemove(imageId)
    } catch (err) {
      console.error('Remove image error:', err)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">{emotionLabel} <span className="text-gray-500 text-[11px]">({emotion})</span></h3>
            {(() => {
              const linkedUrls = new Set((allStyleImages || []).map((i) => i.videoFilePath).filter(Boolean))
              const imageCount = images.filter((i) => !isVideoUrl(i.filePath)).length
              const standaloneCount = images.filter((i) => isVideoUrl(i.filePath) && !linkedUrls.has(i.filePath)).length
              return (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  🖼 {imageCount}장 · 🎥 {standaloneCount}개 (미연결) · 채팅에서 랜덤으로 1장 선택됨
                </p>
              )
            })()}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {PREV_EMOTION_MAP[emotion] && (
              <button
                onClick={() => setFromFrameOpen(true)}
                className="px-3 py-1.5 rounded-md text-sm bg-indigo-700 hover:bg-indigo-600 text-white"
                style={NO_OUTLINE}
                title={`${EMOTION_LABEL_MAP[PREV_EMOTION_MAP[emotion]]} 프레임으로 Seedance 생성`}
              >
                🎞 Seedance 생성
              </button>
            )}
            <button
              onClick={() => setAiOpen(true)}
              disabled={uploading}
              className="px-3 py-1.5 rounded-md text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white disabled:opacity-50"
              style={NO_OUTLINE}
              title="Grok 시안 배경 생성 + chroma key 배경 제거"
            >
              ✨ AI 생성
            </button>
            <button
              onClick={triggerUpload}
              disabled={uploading}
              className="px-3 py-1.5 rounded-md text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              style={NO_OUTLINE}
            >
              {uploading ? '업로드 중...' : '+ 이미지 추가'}
            </button>
          </div>
        </div>

        {(() => {
          // 1:1 정책 — 스타일 전체 기준으로 videoFilePath 사용 중인 URL 체크 (cross-emotion 포함)
          const linkedUrls = new Set((allStyleImages || []).map((i) => i.videoFilePath).filter(Boolean))
          const imageRows = images.filter((i) => !isVideoUrl(i.filePath))
          const videoRows = images.filter((i) => isVideoUrl(i.filePath) && !linkedUrls.has(i.filePath))
          const ghostRows = images.filter((i) => isVideoUrl(i.filePath) && linkedUrls.has(i.filePath))

          if (images.length === 0) {
            return <p className="text-center text-sm text-gray-500 py-10">아직 이미지가 없습니다.</p>
          }

          const renderCell = (img) => {
            const isVid = isVideoUrl(img.filePath)
            return (
              <div key={img.id} className="relative group rounded-md overflow-hidden bg-gray-800">
                <div className="aspect-[3/4]">
                  <ExpressionThumb src={img.filePath} className="w-full h-full object-cover" />
                </div>
                {img.videoFilePath && !isVid && (
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-full pointer-events-none">
                    🔗
                  </span>
                )}
                {!isVid && (
                  <>
                    <button
                      onClick={() => setBgImage(img)}
                      className="absolute top-1.5 left-7 w-6 h-6 rounded-full bg-black/70 hover:bg-fuchsia-600 text-white text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      style={NO_OUTLINE}
                      title="배경 제거 (시안 chroma key)"
                    >
                      🪄
                    </button>
                    <button
                      onClick={() => setSeedanceImage(img)}
                      className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-blue-600 text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      style={NO_OUTLINE}
                      title="Seedance 2.0 Spicy — 비디오 생성"
                    >
                      🎬
                    </button>
                    <button
                      onClick={() => setWanImage(img)}
                      className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-emerald-600 text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      style={NO_OUTLINE}
                      title="WAN 2.7 image-edit — 이미지 생성"
                    >
                      🖼
                    </button>
                    {/* 영상 연결 or 해제 버튼 — 중앙 하단 */}
                    {img.videoFilePath ? (
                      <button
                        onClick={() => handleUnlinkVideo(img.id)}
                        disabled={unlinkingId === img.id}
                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 h-6 rounded-full bg-emerald-700/90 hover:bg-red-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 disabled:opacity-50"
                        style={NO_OUTLINE}
                        title="영상 연결 해제"
                      >
                        🔗 해제
                      </button>
                    ) : (
                      <button
                        onClick={() => setLinkPickerForImage(img)}
                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 h-6 rounded-full bg-black/70 hover:bg-emerald-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                        style={NO_OUTLINE}
                        title="기존 영상에 연결"
                      >
                        🔗 연결
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => handleRemove(img.id)}
                  disabled={removingId === img.id}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-50"
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

          return (
            <div className="space-y-5">
              {/* 🖼 이미지 섹션 */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-blue-300">🖼 이미지</span>
                  <span className="text-[10px] text-gray-500">({imageRows.length}장)</span>
                  <span className="text-[10px] text-emerald-400/80">
                    · 🔗 = 영상 연결됨 ({imageRows.filter((i) => i.videoFilePath).length}장)
                  </span>
                </div>
                {imageRows.length === 0 ? (
                  <p className="text-center text-xs text-gray-600 py-6 border border-dashed border-gray-800 rounded-md">
                    등록된 이미지가 없습니다.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {imageRows.map(renderCell)}
                  </div>
                )}
              </section>

              {/* 🎥 영상 섹션 — 미연결 standalone만 (이미 linked된 URL은 ghost로 분리) */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-amber-300">🎥 영상 (미연결)</span>
                  <span className="text-[10px] text-gray-500">({videoRows.length}개)</span>
                  <span className="text-[10px] text-gray-500">· 이미지에 연결 가능</span>
                </div>
                {videoRows.length === 0 ? (
                  <p className="text-center text-xs text-gray-600 py-6 border border-dashed border-gray-800 rounded-md">
                    연결 가능한 영상이 없습니다.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {videoRows.map(renderCell)}
                  </div>
                )}
              </section>

              {/* 👻 Ghost 섹션 — 정합성 깨진 잔여 row (이미 linked된 URL과 동일한 standalone) */}
              {ghostRows.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-red-300">👻 Ghost (정합성 오류)</span>
                    <span className="text-[10px] text-gray-500">({ghostRows.length}개)</span>
                    <span className="text-[10px] text-red-300/70">· 이미 이미지에 연결됐는데 standalone row도 남아있음 — 삭제 권장</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {ghostRows.map(renderCell)}
                  </div>
                </section>
              )}
            </div>
          )
        })()}

        <div className="mt-4 pt-3 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg"
            style={NO_OUTLINE}
          >
            닫기
          </button>
        </div>
      </div>

      {aiOpen && (
        <AiExpressionGenerator
          characterId={characterId}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          onClose={() => setAiOpen(false)}
          onSaved={(uploaded) => onAdd({ ...uploaded, emotion })}
        />
      )}

      {bgImage && (
        <BackgroundRemovalModal
          image={bgImage}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          onClose={() => setBgImage(null)}
          onReplaced={(oldId, newImage) => {
            onRemove(oldId)
            onAdd({ ...newImage, emotion })
          }}
        />
      )}

      {seedanceImage && (
        <SeedanceVideoModal
          image={seedanceImage}
          characterId={characterId}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          onAdd={onAdd}
          onClose={() => setSeedanceImage(null)}
        />
      )}

      {wanImage && (
        <WanImageModal
          image={wanImage}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          onAdd={onAdd}
          onClose={() => setWanImage(null)}
        />
      )}

      {fromFrameOpen && (
        <SeedanceFromFrameModal
          characterId={characterId}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          prevEmotion={PREV_EMOTION_MAP[emotion]}
          onAdd={onAdd}
          onClose={() => setFromFrameOpen(false)}
        />
      )}

      {/* 영상 picker 모달 — 1:1 관계, 같은 감정 기본 */}
      {linkPickerForImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLinkPickerForImage(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">🔗 영상 연결</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">1:1 관계 · 선택한 영상은 이 이미지로 이전됩니다 (원본 standalone 삭제)</p>
              </div>
              <button
                onClick={() => setLinkPickerForImage(null)}
                className="text-gray-400 hover:text-white"
                style={NO_OUTLINE}
              >
                ✕
              </button>
            </div>

            {/* 선택 대상 이미지 미리보기 */}
            <div className="flex items-center gap-3 mb-4 bg-gray-800/50 rounded-lg p-3">
              <img src={linkPickerForImage.filePath} alt="" className="w-16 rounded-lg object-cover" style={{ aspectRatio: '3/4' }} />
              <div className="text-xs">
                <p className="text-gray-300 font-semibold">{EMOTION_LABEL_MAP[linkPickerForImage.emotion] || linkPickerForImage.emotion}</p>
                <p className="text-gray-500">이미지 ID: {linkPickerForImage.id}</p>
              </div>
            </div>

            {/* 스코프 토글 */}
            <div className="flex gap-2 mb-3 text-xs">
              <button
                onClick={() => setPickerScope('emotion')}
                className={`px-2 py-1 rounded ${pickerScope === 'emotion' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                style={NO_OUTLINE}
              >
                같은 감정만 (기본)
              </button>
              <button
                onClick={() => setPickerScope('all')}
                className={`px-2 py-1 rounded ${pickerScope === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                style={NO_OUTLINE}
              >
                전체 감정
              </button>
            </div>

            {availableVideos.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-10">
                연결 가능한 영상이 없습니다.<br/>
                <span className="text-[11px]">
                  {pickerScope === 'emotion'
                    ? '같은 감정의 standalone 영상이 없습니다. 전체 감정 보기로 전환하거나 Seedance로 생성하세요.'
                    : '먼저 영상을 업로드하거나 Seedance로 생성하세요.'}
                </span>
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {availableVideos.map((v, idx) => (
                  <button
                    key={`${v.videoUrl}-${idx}`}
                    onClick={() => handleLinkVideo(linkPickerForImage.id, v.videoUrl)}
                    disabled={linkingVideoId === v.videoUrl}
                    className="relative bg-gray-800 hover:bg-gray-700 rounded-lg overflow-hidden border border-gray-700 hover:border-emerald-500 transition-all disabled:opacity-50"
                    style={NO_OUTLINE}
                  >
                    <div className="aspect-[3/4]">
                      <video src={v.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                    </div>
                    <span className="absolute top-1 left-1 text-[9px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded-full">
                      {EMOTION_LABEL_MAP[v.emotion] || v.emotion}
                    </span>
                    {linkingVideoId === v.videoUrl && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-emerald-400 text-xs">
                        이전 중...
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// WAN 2.7 image-edit — 표정 이미지 → 이미지 생성 + 감정 슬롯 업로드
// ============================================
function WanImageModal({ image, styleId, emotion, emotionLabel, onAdd, onClose }) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [resultUrl, setResultUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState(null)

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setResultUrl(null)
    setUploaded(false)
    setError(null)
    try {
      const { imageUrl } = await api.post(`/admin/images/${image.id}/generate-image-wan`, { prompt })
      setResultUrl(imageUrl)
    } catch (err) {
      setError(err.message || '생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const handleUpload = async () => {
    if (uploading || !resultUrl) return
    setUploading(true)
    setError(null)
    try {
      // 결과 이미지를 다운로드 후 감정 슬롯에 업로드
      const res = await fetch(resultUrl)
      const blob = await res.blob()
      const ext = blob.type.includes('png') ? 'png' : 'jpg'
      const fd = new FormData()
      fd.append('image', blob, `wan_${emotion}.${ext}`)
      fd.append('emotion', emotion)
      fd.append('description', 'WAN 2.7 image-edit 생성')
      const { image: newImage } = await api.post(`/admin/styles/${styleId}/images`, fd)
      onAdd({ ...newImage, emotion })
      setUploaded(true)
    } catch (err) {
      setError('업로드 실패: ' + (err.message || ''))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 overflow-y-auto py-6" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-1">🖼 WAN 2.7 image-edit — {emotionLabel}</h3>
        <p className="text-[11px] text-gray-500 mb-4">alibaba/wan-2.7/image-edit · 래퍼런스 이미지 기반 생성</p>

        {/* 래퍼런스 + 프롬프트 */}
        <div className="flex gap-3 mb-3">
          <img src={image.filePath} alt="" className="w-20 rounded-lg object-cover border border-gray-700 flex-shrink-0" style={{ aspectRatio: '3/4' }} />
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="프롬프트를 입력하세요 (필수)"
            rows={5}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-emerald-500"
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {/* 생성 중 */}
        {generating && (
          <div className="flex items-center gap-2 my-3 py-2.5 px-3 bg-gray-800 rounded-xl">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" className="animate-spin flex-shrink-0">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
            <span className="text-emerald-400 text-xs">이미지 생성 중...</span>
          </div>
        )}

        {/* 결과 */}
        {resultUrl && (
          <div className="my-3 rounded-xl overflow-hidden border border-gray-700 bg-black">
            <img src={resultUrl} alt="결과" className="w-full object-contain max-h-80" />
            <div className="flex border-t border-gray-700">
              <a href={resultUrl} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs text-blue-400 py-2 bg-gray-800 hover:bg-gray-700">원본 링크</a>
              <button
                onClick={handleUpload}
                disabled={uploading || uploaded}
                className="flex-1 text-xs py-2 bg-gray-800 hover:bg-gray-700 border-l border-gray-700 disabled:opacity-50"
                style={{ ...NO_OUTLINE, color: uploaded ? '#4ade80' : '#a78bfa' }}
              >
                {uploading ? '업로드 중...' : uploaded ? '✓ 감정 슬롯에 저장됨' : '↑ 감정에 업로드'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>닫기</button>
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="flex-1 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {generating ? '생성 중...' : '이미지 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Seedance 2.0 Fast Spicy — 표정 이미지 → 비디오 생성 + 업로드 + 프레임 추출
// ============================================
function SeedanceVideoModal({ image, characterId, styleId, emotion, emotionLabel, onAdd, onClose }) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedImage, setUploadedImage] = useState(null)
  const [frames, setFrames] = useState([]) // { timestampMs, objectUrl, saved, error }
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [error, setError] = useState(null)

  const extractFrames = async (url) => {
    setExtracting(true)
    setExtractError(null)
    setFrames([])
    try {
      const INTERVAL = 1.0
      await new Promise((resolve, reject) => {
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.preload = 'auto'
        video.src = url
        video.onloadedmetadata = async () => {
          try {
            const duration = video.duration
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth || 720
            canvas.height = video.videoHeight || 1280
            const ctx = canvas.getContext('2d')
            const timestamps = []
            for (let t = 0; t <= duration + 0.01; t += INTERVAL)
              timestamps.push(Math.min(parseFloat(t.toFixed(1)), duration))

            for (const t of timestamps) {
              video.currentTime = t
              await new Promise((r) => { video.onseeked = r })
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
              const objectUrl = URL.createObjectURL(blob)
              const timestampMs = Math.round(t * 1000)

              setFrames(prev => [...prev, { timestampMs, objectUrl, saved: false, error: false }])

              try {
                const fd = new FormData()
                fd.append('frame', blob, `frame_${timestampMs}.jpg`)
                fd.append('characterId', String(characterId))
                fd.append('emotion', emotion)
                fd.append('sourceVideoUrl', url)
                fd.append('timestampMs', String(timestampMs))
                await api.post('/admin/video-frames', fd)
                setFrames(prev => prev.map(f => f.timestampMs === timestampMs ? { ...f, saved: true } : f))
              } catch {
                setFrames(prev => prev.map(f => f.timestampMs === timestampMs ? { ...f, error: true } : f))
              }
            }
            resolve()
          } catch (e) { reject(e) }
        }
        video.onerror = () => reject(new Error('비디오 로드 실패 (CORS 문제일 수 있음)'))
        video.load()
      })
    } catch (err) {
      setExtractError('프레임 추출 실패: ' + (err.message || ''))
    } finally {
      setExtracting(false)
    }
  }

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true)
    setError(null)
    try {
      const { prompt: generated } = await api.post(`/admin/images/${image.id}/generate-video-prompt`, {})
      setPrompt(generated)
    } catch (err) {
      setError('프롬프트 생성 실패: ' + (err.message || ''))
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setVideoUrl(null)
    setUploadedImage(null)
    setFrames([])
    setExtractError(null)
    setError(null)
    try {
      const { videoUrl: url } = await api.post(`/admin/images/${image.id}/generate-video-seedance`, { prompt })
      setVideoUrl(url)
      extractFrames(url)
    } catch (err) {
      setError(err.message || '생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const handleUploadVideo = async () => {
    if (uploading || !videoUrl) return
    setUploading(true)
    setError(null)
    try {
      const { image: newImage } = await api.post(`/admin/images/${image.id}/upload-seedance-video`, { videoUrl })
      setUploadedImage(newImage)
      onAdd({ ...newImage, emotion })
    } catch (err) {
      setError('업로드 실패: ' + (err.message || ''))
    } finally {
      setUploading(false)
    }
  }

  const savedCount = frames.filter(f => f.saved).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 overflow-y-auto py-6" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-1">🎬 Seedance 2.0 Spicy — {emotionLabel}</h3>
        <p className="text-[11px] text-gray-500 mb-4">seedance-2.0-fast/image-to-video-spicy · 5s · 720p</p>

        {/* 레퍼런스 이미지 + 프롬프트 */}
        <div className="flex gap-3 mb-2">
          <img src={image.filePath} alt="" className="w-20 rounded-lg object-cover aspect-[3/4] flex-shrink-0 border border-gray-700" />
          <div className="flex-1 flex flex-col gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="프롬프트 (선택 — 비우면 이미지만으로 생성)"
              rows={4}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleGeneratePrompt}
              disabled={generatingPrompt}
              className="py-1.5 text-xs text-fuchsia-300 bg-fuchsia-900/40 border border-fuchsia-700/50 rounded-lg hover:bg-fuchsia-800/50 disabled:opacity-50"
              style={NO_OUTLINE}
            >
              {generatingPrompt ? '생성 중...' : '✨ 프롬프트 자동 생성'}
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mb-3 px-1">{error}</p>}

        {/* 비디오 생성 중 */}
        {generating && (
          <div className="flex items-center gap-2 my-3 py-2.5 px-3 bg-gray-800 rounded-xl">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" className="animate-spin flex-shrink-0">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
            <span className="text-blue-400 text-xs">비디오 생성 중... (최대 5분)</span>
          </div>
        )}

        {/* 비디오 플레이어 */}
        {videoUrl && (
          <div className="my-3 rounded-xl overflow-hidden border border-gray-700 bg-black">
            <video src={videoUrl} controls autoPlay loop playsInline className="w-full max-h-56" />
            <div className="flex border-t border-gray-700">
              <a href={videoUrl} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs text-blue-400 py-2 bg-gray-800 hover:bg-gray-700">원본 링크</a>
              <button
                onClick={handleUploadVideo}
                disabled={uploading || !!uploadedImage}
                className="flex-1 text-xs py-2 bg-gray-800 hover:bg-gray-700 border-l border-gray-700 disabled:opacity-50"
                style={{ ...NO_OUTLINE, color: uploadedImage ? '#4ade80' : '#a78bfa' }}
              >
                {uploading ? '업로드 중...' : uploadedImage ? '✓ 감정 슬롯에 저장됨' : '↑ 감정에 업로드'}
              </button>
            </div>
          </div>
        )}

        {/* 프레임 그리드 */}
        {(frames.length > 0 || extracting) && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">
                프레임 추출
                {extracting && (
                  <span className="ml-2 inline-flex items-center gap-1 text-indigo-400">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    추출 중...
                  </span>
                )}
                {!extracting && frames.length > 0 && (
                  <span className="ml-2 text-green-400">{savedCount}/{frames.length} 저장됨</span>
                )}
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {frames.map((frame) => (
                <div key={frame.timestampMs} className="relative flex-shrink-0">
                  <img
                    src={frame.objectUrl}
                    alt={`${frame.timestampMs}ms`}
                    className="h-24 rounded-lg object-cover border border-gray-700"
                    style={{ aspectRatio: '9/16' }}
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-white bg-black/60 rounded-b-lg py-0.5">
                    {(frame.timestampMs / 1000).toFixed(1)}s
                  </span>
                  {frame.saved && (
                    <span className="absolute top-1 right-1 text-[9px] text-green-400 bg-black/70 rounded px-0.5">✓</span>
                  )}
                  {frame.error && (
                    <span className="absolute top-1 right-1 text-[9px] text-red-400 bg-black/70 rounded px-0.5">✗</span>
                  )}
                </div>
              ))}
            </div>
            {extractError && <p className="text-red-400 text-[11px] mt-1">{extractError}</p>}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>닫기</button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {generating ? '생성 중...' : '비디오 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 이전 감정 프레임 → 다음 감정 Seedance 비디오 생성
// ============================================
function SeedanceFromFrameModal({ characterId, styleId, emotion, emotionLabel, prevEmotion, onAdd, onClose }) {
  const [frames, setFrames] = useState([])
  const [loadingFrames, setLoadingFrames] = useState(true)
  const [selectedFrame, setSelectedFrame] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedImage, setUploadedImage] = useState(null)
  const [extractedFrames, setExtractedFrames] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState(null)

  const prevEmotionLabel = EMOTION_LABEL_MAP[prevEmotion] || prevEmotion

  useEffect(() => {
    api.get(`/admin/characters/${characterId}/video-frames`)
      .then(({ frames: all }) => {
        const filtered = all.filter(f => f.emotion === prevEmotion)
        setFrames(filtered)
        if (filtered.length > 0) setSelectedFrame(filtered[0])
      })
      .catch(err => setError(err.message || '프레임 불러오기 실패'))
      .finally(() => setLoadingFrames(false))
  }, [characterId, prevEmotion])

  const handleGeneratePrompt = async () => {
    if (!selectedFrame) return
    setGeneratingPrompt(true)
    setError(null)
    try {
      const { prompt: generated } = await api.post(
        `/admin/video-frames/${selectedFrame.id}/generate-video-prompt`,
        { targetEmotion: emotion }
      )
      setPrompt(generated)
    } catch (err) {
      setError('프롬프트 생성 실패: ' + (err.message || ''))
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const extractFrames = async (url) => {
    setExtracting(true)
    setExtractedFrames([])
    try {
      const INTERVAL = 1.0
      await new Promise((resolve, reject) => {
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.preload = 'auto'
        video.src = url
        video.onloadedmetadata = async () => {
          try {
            const duration = video.duration
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth || 720
            canvas.height = video.videoHeight || 1280
            const ctx = canvas.getContext('2d')
            const timestamps = []
            for (let t = 0; t <= duration + 0.01; t += INTERVAL)
              timestamps.push(Math.min(parseFloat(t.toFixed(1)), duration))
            for (const t of timestamps) {
              video.currentTime = t
              await new Promise((r) => { video.onseeked = r })
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
              const objectUrl = URL.createObjectURL(blob)
              const timestampMs = Math.round(t * 1000)
              setExtractedFrames(prev => [...prev, { timestampMs, objectUrl, saved: false, error: false }])
              try {
                const fd = new FormData()
                fd.append('frame', blob, `frame_${timestampMs}.jpg`)
                fd.append('characterId', String(characterId))
                fd.append('emotion', emotion)
                fd.append('sourceVideoUrl', url)
                fd.append('timestampMs', String(timestampMs))
                await api.post('/admin/video-frames', fd)
                setExtractedFrames(prev => prev.map(f => f.timestampMs === timestampMs ? { ...f, saved: true } : f))
              } catch {
                setExtractedFrames(prev => prev.map(f => f.timestampMs === timestampMs ? { ...f, error: true } : f))
              }
            }
            resolve()
          } catch (e) { reject(e) }
        }
        video.onerror = () => reject(new Error('비디오 로드 실패'))
        video.load()
      })
    } catch (err) {
      setError('프레임 추출 실패: ' + (err.message || ''))
    } finally {
      setExtracting(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedFrame || generating) return
    setGenerating(true)
    setVideoUrl(null)
    setUploadedImage(null)
    setExtractedFrames([])
    setError(null)
    try {
      const { videoUrl: url } = await api.post(
        `/admin/video-frames/${selectedFrame.id}/generate-video-seedance`,
        { prompt }
      )
      setVideoUrl(url)
      extractFrames(url)
    } catch (err) {
      setError(err.message || '생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const handleUpload = async () => {
    if (uploading || !videoUrl) return
    setUploading(true)
    setError(null)
    try {
      const { image: newImage } = await api.post(`/admin/styles/${styleId}/upload-video-to-emotion`, {
        videoUrl,
        emotion,
      })
      setUploadedImage(newImage)
      onAdd({ ...newImage, emotion })
    } catch (err) {
      setError('업로드 실패: ' + (err.message || ''))
    } finally {
      setUploading(false)
    }
  }

  const savedCount = extractedFrames.filter(f => f.saved).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 overflow-y-auto py-6" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-1">🎞 Seedance 생성 — {emotionLabel}</h3>
        <p className="text-[11px] text-gray-500 mb-4">
          래퍼런스: <span className="text-indigo-300">{prevEmotionLabel}</span> 프레임 → <span className="text-white">{emotionLabel}</span> 생성
        </p>

        {/* 이전 감정 프레임 선택 */}
        {loadingFrames && <p className="text-gray-400 text-xs text-center py-4">프레임 불러오는 중...</p>}

        {!loadingFrames && frames.length === 0 && (
          <div className="py-4 px-3 bg-gray-800 rounded-xl text-center mb-4">
            <p className="text-yellow-400 text-xs">'{prevEmotionLabel}' 감정의 추출 프레임이 없습니다.</p>
            <p className="text-gray-500 text-[11px] mt-1">먼저 해당 감정에서 Seedance 비디오를 생성하고 프레임을 추출해주세요.</p>
          </div>
        )}

        {!loadingFrames && frames.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] text-gray-400 mb-1.5">{prevEmotionLabel} 프레임 {frames.length}장 — 래퍼런스로 사용할 프레임 선택</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {frames.map(frame => (
                <div
                  key={frame.id}
                  onClick={() => setSelectedFrame(frame)}
                  className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedFrame?.id === frame.id ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-500'
                  }`}
                  style={{ width: 60 }}
                >
                  <img src={frame.filePath} alt="" className="w-full object-cover" style={{ aspectRatio: '9/16' }} />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] text-white bg-black/60 py-0.5">
                    {(frame.timestampMs / 1000).toFixed(1)}s
                  </span>
                  {selectedFrame?.id === frame.id && (
                    <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 선택된 래퍼런스 + 프롬프트 */}
        {selectedFrame && (
          <div className="flex gap-3 mb-3">
            <img
              src={selectedFrame.filePath}
              alt="래퍼런스"
              className="w-16 rounded-lg object-cover border border-indigo-600/50 flex-shrink-0"
              style={{ aspectRatio: '9/16' }}
            />
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="프롬프트 (선택 — 비우면 이미지만으로 생성)"
                rows={4}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleGeneratePrompt}
                disabled={generatingPrompt || !selectedFrame}
                className="py-1.5 text-xs text-fuchsia-300 bg-fuchsia-900/40 border border-fuchsia-700/50 rounded-lg hover:bg-fuchsia-800/50 disabled:opacity-50"
                style={NO_OUTLINE}
              >
                {generatingPrompt ? '생성 중...' : '✨ 프롬프트 자동 생성'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {generating && (
          <div className="flex items-center gap-2 my-3 py-2.5 px-3 bg-gray-800 rounded-xl">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" className="animate-spin flex-shrink-0">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
            <span className="text-blue-400 text-xs">비디오 생성 중... (최대 5분)</span>
          </div>
        )}

        {videoUrl && (
          <div className="my-3 rounded-xl overflow-hidden border border-gray-700 bg-black">
            <video src={videoUrl} controls autoPlay loop playsInline className="w-full max-h-48" />
            <div className="flex border-t border-gray-700">
              <a href={videoUrl} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs text-blue-400 py-2 bg-gray-800 hover:bg-gray-700">원본 링크</a>
              <button
                onClick={handleUpload}
                disabled={uploading || !!uploadedImage}
                className="flex-1 text-xs py-2 bg-gray-800 hover:bg-gray-700 border-l border-gray-700 disabled:opacity-50"
                style={{ ...NO_OUTLINE, color: uploadedImage ? '#4ade80' : '#a78bfa' }}
              >
                {uploading ? '업로드 중...' : uploadedImage ? '✓ 감정 슬롯에 저장됨' : '↑ 감정에 업로드'}
              </button>
            </div>
          </div>
        )}

        {/* 추출 프레임 그리드 */}
        {(extractedFrames.length > 0 || extracting) && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-2">
              프레임 추출
              {extracting && <span className="ml-2 text-indigo-400">추출 중...</span>}
              {!extracting && extractedFrames.length > 0 && <span className="ml-2 text-green-400">{savedCount}/{extractedFrames.length} 저장됨</span>}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {extractedFrames.map(frame => (
                <div key={frame.timestampMs} className="relative flex-shrink-0">
                  <img src={frame.objectUrl} alt="" className="h-20 rounded-lg object-cover border border-gray-700" style={{ aspectRatio: '9/16' }} />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-white bg-black/60 rounded-b-lg py-0.5">
                    {(frame.timestampMs / 1000).toFixed(1)}s
                  </span>
                  {frame.saved && <span className="absolute top-1 right-1 text-[9px] text-green-400 bg-black/70 rounded px-0.5">✓</span>}
                  {frame.error && <span className="absolute top-1 right-1 text-[9px] text-red-400 bg-black/70 rounded px-0.5">✗</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>닫기</button>
          <button
            onClick={handleGenerate}
            disabled={generating || !selectedFrame || frames.length === 0}
            className="flex-1 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {generating ? '생성 중...' : '비디오 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// AROUSED 전 단계 자동 생성 파이프라인
// ============================================
const PIPELINE_SEQUENCE = [
  { key: 'AROUSED_TEASE', label: '도발' },
  { key: 'AROUSED_TOPLESS', label: '상의탈의' },
  { key: 'AROUSED_NUDE', label: '전라' },
  { key: 'AROUSED_FOREPLAY', label: '전희' },
  { key: 'AROUSED_INSERT', label: '삽입' },
  { key: 'AROUSED_INSERT_ALT', label: '삽입(체위2)' },
  { key: 'AROUSED_CLIMAX', label: '절정' },
  { key: 'AROUSED_AFTERGLOW', label: '여운' },
]

const STEP_LABEL = { prompt: '프롬프트', video: '비디오 생성', upload: '업로드', wan: 'WAN 이미지 생성', frames: '프레임 추출', analyze: '이미지 분석', select: '래퍼런스 선정' }

function ArousedPipelineModal({ characterId, styleId, characterName, teaseImages, onClose }) {
  const [selectedImage, setSelectedImage] = useState(teaseImages[0] || null)
  const [customUrl, setCustomUrl] = useState('')
  const [mode, setMode] = useState('image') // 'image' | 'video'
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const referenceUrl = selectedImage ? selectedImage.filePath : customUrl.trim()

  const handleStart = async () => {
    if (!referenceUrl) return setError('래퍼런스 이미지를 선택하거나 URL을 입력해주세요.')
    setStarting(true)
    setError(null)
    try {
      const endpoint = mode === 'image'
        ? `/admin/characters/${characterId}/start-aroused-image-pipeline`
        : `/admin/characters/${characterId}/start-aroused-pipeline`
      const { jobId: id } = await api.post(endpoint, { styleId, referenceImageUrl: referenceUrl })
      setJobId(id)
    } catch (err) {
      setError(err.message || '시작 실패')
    } finally {
      setStarting(false)
    }
  }

  // Poll job status every 5s
  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const { job: j } = await api.get(`/admin/jobs/${jobId}`)
        setJob(j)
        if (j.status === 'running' || j.status === 'queued') {
          pollRef.current = setTimeout(poll, 5000)
        }
      } catch {}
    }
    poll()
    return () => clearTimeout(pollRef.current)
  }, [jobId])

  const isRunning = job?.status === 'running' || job?.status === 'queued'
  const isDone = job?.status === 'completed'
  const isFailed = job?.status === 'failed'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 overflow-y-auto py-6" onClick={!isRunning ? onClose : undefined}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">🚀 전단계 자동 생성 — {characterName}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">도발 → 여운 8단계 순서대로 자동 생성</p>
          </div>
          {!isRunning && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg" style={NO_OUTLINE}>✕</button>
          )}
        </div>

        {/* 시작 전: 래퍼런스 이미지 선택 */}
        {!jobId && (
          <>
            <p className="text-xs text-gray-400 mb-2">래퍼런스 이미지 선택 <span className="text-gray-600">(도발 감정 슬롯에 있는 이미지 또는 직접 URL 입력)</span></p>

            {teaseImages.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {teaseImages.map(img => (
                  <div
                    key={img.id}
                    onClick={() => { setSelectedImage(img); setCustomUrl('') }}
                    className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedImage?.id === img.id ? 'border-amber-500' : 'border-gray-700 hover:border-gray-500'}`}
                    style={{ width: 64 }}
                  >
                    <img src={img.filePath} alt="" className="w-full object-cover" style={{ aspectRatio: '3/4' }} />
                    {selectedImage?.id === img.id && (
                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {teaseImages.length === 0 && (
              <p className="text-xs text-yellow-500 mb-2">도발 감정 슬롯에 이미지가 없습니다. 아래에 이미지 URL을 직접 입력하세요.</p>
            )}

            <input
              value={customUrl}
              onChange={e => { setCustomUrl(e.target.value); setSelectedImage(null) }}
              placeholder="또는 이미지 URL 직접 입력"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 mb-3"
            />

            {customUrl && (
              <img src={customUrl} alt="preview" className="w-20 rounded-lg mb-3 border border-gray-700 object-cover" style={{ aspectRatio: '3/4' }} onError={e => e.target.style.display = 'none'} />
            )}

            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

            {/* 모드 선택 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setMode('image')}
                className={`flex-1 py-2 text-sm rounded-xl font-semibold transition-all ${mode === 'image' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                style={NO_OUTLINE}
              >
                🖼 이미지만
              </button>
              <button
                onClick={() => setMode('video')}
                className={`flex-1 py-2 text-sm rounded-xl font-semibold transition-all ${mode === 'video' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                style={NO_OUTLINE}
              >
                🎬 비디오+이미지
              </button>
            </div>

            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-4 text-[11px] text-gray-400 leading-relaxed">
              <p className="font-semibold text-gray-300 mb-1">진행 순서</p>
              {PIPELINE_SEQUENCE.map((s, i) => (
                <span key={s.key}>{i > 0 && ' → '}<span className="text-white">{s.label}</span></span>
              ))}
              {mode === 'video' ? (
                <p className="mt-2 text-gray-500">각 단계: 프롬프트 생성 → 비디오 생성 (~5분) → 프레임 추출+분석 → 다음 단계 래퍼런스 선정</p>
              ) : (
                <p className="mt-2 text-gray-500">각 단계: WAN 이미지 생성 → 업로드 → 다음 단계 래퍼런스로 사용</p>
              )}
              <p className="mt-1 text-yellow-600">전체 소요 시간: {mode === 'video' ? '약 40~60분' : '약 5~10분'}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>취소</button>
              <button
                onClick={handleStart}
                disabled={starting || !referenceUrl}
                className="flex-1 py-2 text-sm text-white bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold disabled:opacity-50"
                style={NO_OUTLINE}
              >
                {starting ? '시작 중...' : '🚀 시작'}
              </button>
            </div>
          </>
        )}

        {/* 진행 중 / 완료 */}
        {jobId && (
          <>
            {/* 진행 단계 표시 */}
            <div className="space-y-1.5 mb-4">
              {PIPELINE_SEQUENCE.map((s, i) => {
                const isDoneEmotion = job?.completedEmotions?.includes(s.key)
                const isCurrent = job?.currentEmotion === s.key
                const isPending = !isDoneEmotion && !isCurrent
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs ${
                      isDoneEmotion ? 'bg-green-900/30 border border-green-700/40 text-green-300' :
                      isCurrent ? 'bg-blue-900/40 border border-blue-600/50 text-blue-200' :
                      'bg-gray-800/40 border border-gray-700/30 text-gray-500'
                    }`}
                  >
                    <span className="w-4 text-center flex-shrink-0">
                      {isDoneEmotion ? '✓' : isCurrent ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                        </svg>
                      ) : String(i + 1)}
                    </span>
                    <span className="font-medium">{s.label}</span>
                    {isCurrent && job?.step && (
                      <span className="text-blue-400 text-[10px]">— {STEP_LABEL[job.step] || job.step}</span>
                    )}
                    {s.key === job?.failedEmotion && (
                      <span className="text-red-400 text-[10px] ml-auto">실패</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 로그 */}
            {job?.logs?.length > 0 && (
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 max-h-40 overflow-y-auto mb-4">
                {job.logs.slice(-20).map((l, i) => (
                  <p key={i} className="text-[10px] text-gray-400 font-mono leading-relaxed">{l}</p>
                ))}
              </div>
            )}

            {isFailed && (
              <p className="text-red-400 text-xs mb-3">오류: {job.error}</p>
            )}

            {(isDone || isFailed) && (
              <button onClick={onClose} className="w-full py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>
                {isDone ? '✓ 완료 — 닫기' : '닫기'}
              </button>
            )}

            {isRunning && (
              <p className="text-center text-xs text-gray-500">실행 중... 창을 닫아도 서버에서 계속 실행됩니다.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// AI 이미지/영상 생성 — 기존 이미지 선택 → 분석 → 변형 or 영상
// ============================================
const EMOTION_LABEL_MAP = {
  NEUTRAL: '기본', HAPPY: '웃음', ANGRY: '화남', SAD: '슬픔', SHY: '설렘', WORRIED: '걱정',
  SURPRISED: '놀람', ANNOYED: '짜증', PLAYFUL: '장난', EXCITED: '신남',
  AROUSED_TEASE: '도발', AROUSED_TOPLESS: '상의탈의', AROUSED_NUDE: '전라',
  AROUSED_FOREPLAY: '전희', AROUSED_INSERT: '삽입', AROUSED_INSERT_ALT: '삽입(다른자세)',
  AROUSED_CLIMAX: '절정', AROUSED_AFTERGLOW: '여운',
}

function AiGenerationModal({ styleId, allImages, onClose, onUploaded }) {
  const [selectedImage, setSelectedImage] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [mode, setMode] = useState('image') // 'image' | 'video'
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null) // { type, url }
  const [targetEmotion, setTargetEmotion] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [error, setError] = useState('')

  const grouped = useMemo(() => {
    const map = {}
    for (const img of allImages) {
      if (!map[img.emotion]) map[img.emotion] = []
      map[img.emotion].push(img)
    }
    return map
  }, [allImages])

  const emotionOrder = Object.keys(EMOTION_LABEL_MAP)

  const selectImage = async (img) => {
    if (analyzing) return
    setSelectedImage(img)
    setAnalysis(null)
    setResult(null)
    setPrompt('')
    setError('')
    setTargetEmotion(img.emotion)
    setUploadDone(false)
    setAnalyzing(true)
    try {
      const data = await api.post(`/admin/images/${img.id}/analyze-variation`)
      setAnalysis(data)
      setPrompt(mode === 'image' ? data.imageVariationPrompt : data.videoPrompt)
    } catch (e) {
      setError(e.message || '분석 실패')
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    if (analysis) setPrompt(mode === 'image' ? analysis.imageVariationPrompt : analysis.videoPrompt)
  }, [mode]) // eslint-disable-line

  const handleGenerate = async () => {
    if (!selectedImage || !prompt.trim()) return
    setGenerating(true)
    setResult(null)
    setError('')
    setUploadDone(false)
    try {
      if (mode === 'image') {
        const data = await api.post(`/admin/images/${selectedImage.id}/generate-image-wan`, { prompt })
        setResult({ type: 'image', url: data.imageUrl })
      } else {
        const data = await api.post(`/admin/images/${selectedImage.id}/generate-video-seedance`, { prompt })
        setResult({ type: 'video', url: data.videoUrl })
      }
    } catch (e) {
      setError(e.message || '생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const handleUpload = async () => {
    if (!result || !targetEmotion) return
    setUploading(true)
    setError('')
    try {
      if (result.type === 'image') {
        const blob = await fetch(result.url).then(r => r.blob())
        const fd = new FormData()
        fd.append('image', blob, 'ai_generated.jpg')
        fd.append('emotion', targetEmotion)
        await api.post(`/admin/styles/${styleId}/images`, fd)
      } else {
        await api.post(`/admin/styles/${styleId}/upload-video-to-emotion`, { videoUrl: result.url, emotion: targetEmotion })
      }
      setUploadDone(true)
      onUploaded?.()
    } catch (e) {
      setError(e.message || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full bg-gray-900 border border-gray-700 rounded-t-2xl p-4 overflow-y-auto"
        style={{ maxWidth: 480, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">🤖 AI 이미지/영상 생성</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none" style={NO_OUTLINE}>✕</button>
        </div>

        {/* 이미지 선택 그리드 */}
        <p className="text-[11px] text-gray-400 mb-2">생성에 사용할 이미지를 선택하세요</p>
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
          {emotionOrder.filter(e => grouped[e]?.length > 0).map(emotionKey => (
            <div key={emotionKey}>
              <p className="text-[10px] text-gray-500 mb-1">{EMOTION_LABEL_MAP[emotionKey]}</p>
              <div className="flex gap-1.5 flex-wrap">
                {grouped[emotionKey].map(img => (
                  <div
                    key={img.id}
                    onClick={() => selectImage(img)}
                    className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedImage?.id === img.id ? 'border-amber-500' : 'border-gray-700 hover:border-gray-500'}`}
                    style={{ width: 52 }}
                  >
                    <img src={img.filePath} alt="" className="w-full object-cover" style={{ aspectRatio: '3/4' }} />
                    {selectedImage?.id === img.id && (
                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {allImages.length === 0 && (
            <p className="text-xs text-gray-500">이 캐릭터에 등록된 이미지가 없습니다.</p>
          )}
        </div>

        {/* 선택된 이미지 + 분석 결과 */}
        {selectedImage && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-3">
            <div className="flex gap-3 items-start">
              <img src={selectedImage.filePath} alt="" className="w-16 rounded-lg object-cover flex-shrink-0 border border-gray-600" style={{ aspectRatio: '3/4' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-400 mb-1">{EMOTION_LABEL_MAP[selectedImage.emotion] || selectedImage.emotion}</p>
                {analyzing && <p className="text-[11px] text-blue-400">이미지 분석 중...</p>}
                {analysis && !analyzing && (
                  <p className="text-[11px] text-gray-300 leading-relaxed">{analysis.description}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 분석 완료 후 생성 패널 */}
        {analysis && !analyzing && (
          <>
            {/* 모드 선택 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setMode('image')}
                className={`flex-1 py-1.5 text-xs rounded-xl font-semibold transition-all ${mode === 'image' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                style={NO_OUTLINE}
              >
                🖼 이미지 변형
              </button>
              <button
                onClick={() => setMode('video')}
                className={`flex-1 py-1.5 text-xs rounded-xl font-semibold transition-all ${mode === 'video' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                style={NO_OUTLINE}
              >
                🎬 영상 생성
              </button>
            </div>

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none mb-3"
              placeholder="프롬프트 편집 가능"
            />

            {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="w-full py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-xl disabled:opacity-50 mb-3"
              style={NO_OUTLINE}
            >
              {generating
                ? (mode === 'video' ? '영상 생성 중... (최대 5분)' : '이미지 생성 중...')
                : (mode === 'image' ? '🖼 이미지 변형 생성' : '🎬 영상 생성')}
            </button>
          </>
        )}

        {/* 생성 결과 */}
        {result && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-3">
            <p className="text-[11px] text-gray-400 mb-2">생성 결과</p>
            {result.type === 'image' ? (
              <img src={result.url} alt="generated" className="w-full rounded-lg object-cover mb-3" style={{ maxHeight: 240 }} />
            ) : (
              <video src={result.url} autoPlay loop muted playsInline className="w-full rounded-lg mb-3" style={{ maxHeight: 240 }} />
            )}

            {/* 업로드 감정 선택 + 업로드 버튼 */}
            <div className="flex gap-2 items-center">
              <select
                value={targetEmotion}
                onChange={e => setTargetEmotion(e.target.value)}
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
              >
                {Object.entries(EMOTION_LABEL_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={handleUpload}
                disabled={uploading || uploadDone}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl ${uploadDone ? 'bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'}`}
                style={NO_OUTLINE}
              >
                {uploadDone ? '✓ 업로드됨' : uploading ? '업로드 중...' : '슬롯에 업로드'}
              </button>
            </div>
          </div>
        )}

        <button onClick={onClose} className="w-full py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>닫기</button>
      </div>
    </div>
  )
}

function VideoFrameGalleryModal({ characterId, characterName, onClose }) {
  const [frames, setFrames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    api.get(`/admin/characters/${characterId}/video-frames`)
      .then(({ frames }) => setFrames(frames))
      .catch((err) => setError(err.message || '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [characterId])

  const handleDelete = async (id) => {
    if (deletingId) return
    setDeletingId(id)
    try {
      await api.delete(`/admin/video-frames/${id}`)
      setFrames(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      alert('삭제 실패: ' + (err.message || ''))
    } finally {
      setDeletingId(null)
    }
  }

  // Group by emotion
  const grouped = useMemo(() => {
    const map = {}
    for (const f of frames) {
      if (!map[f.emotion]) map[f.emotion] = []
      map[f.emotion].push(f)
    }
    return map
  }, [frames])

  const emotionKeys = Object.keys(grouped)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 overflow-y-auto py-6" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">🎞 추출 프레임 — {characterName}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Seedance 비디오에서 추출한 프레임 이미지</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none" style={NO_OUTLINE}>✕</button>
        </div>

        {loading && <p className="text-gray-400 text-sm text-center py-8">불러오는 중...</p>}
        {error && <p className="text-red-400 text-sm text-center py-8">{error}</p>}

        {!loading && !error && emotionKeys.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">추출된 프레임이 없습니다.</p>
        )}

        {!loading && emotionKeys.map((emotion) => (
          <div key={emotion} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-white">{EMOTION_LABEL_MAP[emotion] || emotion}</span>
              <span className="text-[10px] text-gray-500">{grouped[emotion].length}장</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {grouped[emotion].map((frame) => (
                <div key={frame.id} className="relative flex-shrink-0 group" style={{ width: 80 }}>
                  <img
                    src={frame.filePath}
                    alt={`${frame.timestampMs}ms`}
                    className="w-full rounded-lg object-cover border border-gray-700"
                    style={{ aspectRatio: '9/16' }}
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-white bg-black/60 rounded-b-lg py-0.5">
                    {(frame.timestampMs / 1000).toFixed(1)}s
                  </span>
                  {/* 호버 오버레이: description + tags */}
                  <div className="absolute inset-0 bg-black/85 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity overflow-y-auto p-1.5 flex flex-col gap-1">
                    {frame.description && (
                      <p className="text-[9px] text-gray-200 leading-tight">{frame.description}</p>
                    )}
                    {frame.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-auto">
                        {frame.tags.map((tag) => (
                          <span key={tag} className="text-[8px] bg-indigo-900/70 text-indigo-300 px-1 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => handleDelete(frame.id)}
                      disabled={deletingId === frame.id}
                      className="mt-1 w-full text-[9px] text-red-400 bg-red-900/40 hover:bg-red-900/70 rounded py-0.5 disabled:opacity-50"
                      style={NO_OUTLINE}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-end mt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>닫기</button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 기존 저장된 표정 이미지의 chroma key 배경 제거 모달 (시안 #00FFFF)
// 원본 + 처리 결과를 나란히 보여주고, 슬라이더로 임계값 조정 후 "교체"로 새 이미지로 업로드.
// 교체 시 새 이미지를 업로드한 뒤 원본을 삭제 (실패해도 새 이미지는 살아남음).
// ============================================
function BackgroundRemovalModal({ image, styleId, emotion, emotionLabel, onClose, onReplaced }) {
  const [tolerance, setTolerance] = useState(80)
  const [processedUrl, setProcessedUrl] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [detectedBg, setDetectedBg] = useState(null) // { r, g, b } — 코너에서 감지된 실제 배경색
  const processedBlobRef = useRef(null)
  const processedObjectUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setProcessing(true)
    setError(null)
    removeChromaBackground(image.filePath, { tolerance })
      .then(({ blob, bgColor }) => {
        if (cancelled) return
        if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current)
        const url = URL.createObjectURL(blob)
        processedBlobRef.current = blob
        processedObjectUrlRef.current = url
        setProcessedUrl(url)
        setDetectedBg(bgColor)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || '처리 실패')
      })
      .finally(() => {
        if (!cancelled) setProcessing(false)
      })
    return () => {
      cancelled = true
    }
  }, [image.filePath, tolerance])

  useEffect(() => () => {
    if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current)
  }, [])

  const replace = async () => {
    if (!processedBlobRef.current || processing || saving) return
    setSaving(true)
    setError(null)
    try {
      const file = new File(
        [processedBlobRef.current],
        `bg-removed-${emotion.toLowerCase()}-${Date.now()}.png`,
        { type: 'image/png' },
      )
      const fd = new FormData()
      fd.append('image', file)
      fd.append('emotion', emotion)
      fd.append('description', '배경 제거 처리')
      const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, fd)
      try {
        await api.delete(`/admin/images/${image.id}`)
      } catch (delErr) {
        // 삭제 실패해도 새 이미지는 살려두고 사용자에게 알림
        console.error('원본 이미지 삭제 실패:', delErr)
        setError('새 이미지는 저장됐지만 원본 삭제에 실패했습니다. 수동으로 삭제하세요.')
      }
      onReplaced(image.id, uploaded)
      onClose()
    } catch (e) {
      setError(e.message || '교체 실패')
    } finally {
      setSaving(false)
    }
  }

  const download = () => {
    if (!processedObjectUrlRef.current) return
    const a = document.createElement('a')
    a.href = processedObjectUrlRef.current
    a.download = `bg-removed-${emotion.toLowerCase()}-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const checkerStyle = {
    backgroundColor: '#1f2937',
    backgroundImage:
      'linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">🪄 배경 제거 — {emotionLabel} <span className="text-gray-500 text-[11px]">({emotion})</span></h3>
          <p className="text-[11px] text-gray-500 mt-0.5">처리 후 새 이미지로 업로드되고 원본은 자동 삭제됩니다.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-[11px] text-gray-400 mb-1.5">원본</p>
            <div
              className="rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center"
              style={{ minHeight: 280, backgroundColor: '#00FFFF' }}
            >
              <img src={image.filePath} alt="원본" className="max-w-full object-contain" style={{ maxHeight: 380 }} />
            </div>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 mb-1.5">
              처리 결과 {processing && <span className="text-gray-500">(처리 중...)</span>}
            </p>
            <div
              className="rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center"
              style={{ minHeight: 280, ...checkerStyle }}
            >
              {processedUrl ? (
                <img src={processedUrl} alt="처리" className="max-w-full object-contain" style={{ maxHeight: 380 }} />
              ) : (
                <div className="text-gray-500 text-sm">{processing ? '처리 중...' : ''}</div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-gray-800/40 border border-gray-700/60 space-y-2">
          <div className="text-[11px] text-gray-500 leading-relaxed">
            이미지 코너에서 자동 감지한 배경색을 단색 chroma key로 제거합니다. <b className="text-gray-300">허용 오차</b>가 클수록 배경색에서 더 멀어진 픽셀도 같은 배경으로 간주합니다. 캐릭터가 함께 지워지면 낮추세요.
          </div>
          {detectedBg && (
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span>감지된 배경색:</span>
              <span
                className="inline-block w-4 h-4 rounded border border-gray-600"
                style={{ backgroundColor: `rgb(${detectedBg.r}, ${detectedBg.g}, ${detectedBg.b})` }}
              />
              <span className="font-mono text-gray-500">rgb({detectedBg.r}, {detectedBg.g}, {detectedBg.b})</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-gray-400 w-28 flex-shrink-0">허용 오차 ({tolerance})</label>
            <input
              type="range"
              min={0}
              max={441}
              value={tolerance}
              onChange={(e) => setTolerance(parseInt(e.target.value))}
              className="flex-1 accent-fuchsia-500"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            style={NO_OUTLINE}
          >
            닫기
          </button>
          <button
            onClick={download}
            disabled={!processedUrl || saving || processing}
            className="px-4 py-2 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
          >
            PC 다운로드
          </button>
          <button
            onClick={replace}
            disabled={!processedUrl || saving || processing}
            className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
          >
            {saving ? '교체 중...' : '이 이미지로 교체'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 레퍼런스 선택기 — 단일/일괄 모달 공통
// reference: { profileImage: string|null, baseImages: string[] } | null
// value: 'profile' | 'baseImages'
// onChange: (newValue) => void
// ============================================
function ReferenceSelector({ reference, value, onChange }) {
  if (!reference) {
    return <div className="mb-4 text-[11px] text-gray-500">레퍼런스 정보 확인 중...</div>
  }
  const hasProfile = !!reference.profileImage
  const hasBase = (reference.baseImages || []).length > 0

  if (!hasProfile && !hasBase) {
    return (
      <div className="mb-4 px-3 py-2 bg-red-950/40 border border-red-800/50 rounded-md text-[11px] text-red-300">
        프로필 이미지와 베이스 이미지가 모두 없습니다. AI 생성을 위해 둘 중 하나를 먼저 등록하세요.
      </div>
    )
  }

  const Option = ({ optionKey, label, urls, disabled }) => {
    const selected = value === optionKey
    return (
      <button
        type="button"
        onClick={() => !disabled && onChange(optionKey)}
        disabled={disabled}
        className={`text-left rounded-lg p-2.5 border transition-colors ${
          selected
            ? 'border-fuchsia-500 bg-fuchsia-500/10'
            : disabled
              ? 'border-gray-800 bg-gray-900/30 opacity-50 cursor-not-allowed'
              : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
        }`}
        style={NO_OUTLINE}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className={`inline-block w-3 h-3 rounded-full border ${
              selected ? 'bg-fuchsia-400 border-fuchsia-300' : 'border-gray-600'
            }`}
          />
          <span className={`text-[12px] font-medium ${selected ? 'text-fuchsia-200' : 'text-gray-200'}`}>
            {label}
          </span>
          <span className="text-[10px] text-gray-500">({urls.length}장)</span>
        </div>
        {urls.length > 0 ? (
          <div className="flex gap-1.5 flex-wrap">
            {urls.map((u, i) => (
              <div key={i} className="w-14 h-14 rounded-md overflow-hidden bg-gray-800 border border-gray-700/60">
                <img src={u} alt={`${optionKey}-${i}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 py-2">등록된 이미지 없음</div>
        )}
      </button>
    )
  }

  return (
    <div className="mb-4">
      <div className="text-[11px] text-gray-400 mb-1.5">레퍼런스 이미지 선택</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Option
          optionKey="profile"
          label="프로필 이미지"
          urls={hasProfile ? [reference.profileImage] : []}
          disabled={!hasProfile}
        />
        <Option
          optionKey="baseImages"
          label="베이스 이미지"
          urls={reference.baseImages || []}
          disabled={!hasBase}
        />
      </div>
    </div>
  )
}

// 디폴트 선택값 결정 — 둘 다 있으면 base, 하나만 있으면 그것, 아무것도 없으면 null
function pickDefaultReferenceSource(reference) {
  if (!reference) return null
  if ((reference.baseImages || []).length > 0) return 'baseImages'
  if (reference.profileImage) return 'profile'
  return null
}

// ============================================
// AI 생성 모달 — Grok image-to-image, 시안(#00FFFF) chroma key 배경 표정 이미지
// 옵션으로 구도/자세 지시문(posePrompt) 입력 가능
// ============================================

function AiExpressionGenerator({ characterId, styleId, emotion, emotionLabel, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { generatedUrl }
  const [posePrompt, setPosePrompt] = useState('')
  const [reference, setReference] = useState(null) // { profileImage, baseImages: [] }
  const [referenceSource, setReferenceSource] = useState(null) // 'profile' | 'baseImages'

  // Chroma key 배경 제거 — 단색 hard cutoff (tolerance 이내는 투명, 초과는 불투명).
  const [bgRemoveEnabled, setBgRemoveEnabled] = useState(true)
  const [tolerance, setTolerance] = useState(80)
  const [processedUrl, setProcessedUrl] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [detectedBg, setDetectedBg] = useState(null)
  const processedBlobRef = useRef(null)
  const processedObjectUrlRef = useRef(null)

  useEffect(() => {
    api
      .get(`/admin/expressions/reference-preview?characterId=${characterId}`)
      .then((ref) => {
        setReference(ref)
        setReferenceSource(pickDefaultReferenceSource(ref))
      })
      .catch(() => setReference({ profileImage: null, baseImages: [] }))
  }, [characterId])

  // 결과 또는 threshold 변경 시 배경 제거 재처리
  useEffect(() => {
    if (!result?.generatedUrl) return
    if (!bgRemoveEnabled) {
      if (processedObjectUrlRef.current) {
        URL.revokeObjectURL(processedObjectUrlRef.current)
        processedObjectUrlRef.current = null
      }
      processedBlobRef.current = null
      setProcessedUrl(null)
      return
    }
    let cancelled = false
    setProcessing(true)
    removeChromaBackground(result.generatedUrl, { tolerance })
      .then(({ blob, bgColor }) => {
        if (cancelled) return
        if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current)
        const url = URL.createObjectURL(blob)
        processedBlobRef.current = blob
        processedObjectUrlRef.current = url
        setProcessedUrl(url)
        setDetectedBg(bgColor)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '배경 제거 실패')
      })
      .finally(() => {
        if (!cancelled) setProcessing(false)
      })
    return () => {
      cancelled = true
    }
  }, [result?.generatedUrl, bgRemoveEnabled, tolerance])

  // 모달 닫힐 때 ObjectURL 정리
  useEffect(() => {
    return () => {
      if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current)
    }
  }, [])

  const generate = async () => {
    if (!referenceSource) {
      setError('레퍼런스 이미지를 선택하세요.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.post('/admin/expressions/generate', {
        characterId,
        styleId,
        emotion,
        posePrompt: posePrompt.trim(),
        referenceSource,
      })
      setResult(data)
    } catch (err) {
      setError(err.message || '생성 실패')
    } finally {
      setLoading(false)
    }
  }

  // 배경 제거가 활성화돼 있으면 처리된 blob을, 아니면 원본을 가져온다.
  const getSaveBlob = async () => {
    if (bgRemoveEnabled && processedBlobRef.current) return processedBlobRef.current
    const res = await fetch(result.generatedUrl)
    return res.blob()
  }

  const save = async () => {
    if (!result?.generatedUrl) return
    if (bgRemoveEnabled && processing) {
      setError('배경 제거 처리 중입니다. 잠시 후 다시 시도하세요.')
      return
    }
    setSaving(true)
    try {
      const blob = await getSaveBlob()
      const file = new File([blob], `ai-${emotion.toLowerCase()}-${Date.now()}.png`, { type: 'image/png' })
      const fd = new FormData()
      fd.append('image', file)
      fd.append('emotion', emotion)
      fd.append('description', bgRemoveEnabled ? 'AI 생성 (Grok, 배경 제거)' : 'AI 생성 (Grok)')
      const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, fd)
      onSaved(uploaded)
      onClose()
    } catch (err) {
      setError(err.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const download = async () => {
    if (!result?.generatedUrl) return
    try {
      const blob = await getSaveBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ai-${emotion.toLowerCase()}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || '다운로드 실패')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              ✨ AI 표정 생성 — {emotionLabel}{' '}
              <span className="text-gray-500 text-[11px]">({emotion})</span>
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              NEUTRAL(기본) 이미지를 레퍼런스로 Grok이 시안(#00FFFF) 배경 표정 이미지를 생성합니다.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={loading || saving || !referenceSource}
            className="px-4 py-2 text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-md disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {loading ? '생성 중...' : result?.generatedUrl ? '다시 생성' : '생성'}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-[11px] text-gray-400 mb-1.5">구도 / 자세</label>
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-md px-3 py-2 text-[11px] text-gray-400 mb-2">
            <span className="text-gray-500">디폴트 (항상 적용):</span> {DEFAULT_COMPOSITION_KO}
          </div>
          <textarea
            value={posePrompt}
            onChange={(e) => setPosePrompt(e.target.value)}
            placeholder="추가 지시 (선택) — 입력 시 디폴트보다 우선합니다. 예: 전신 구도 / 측면 각도 / 손을 흔드는 자세"
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 resize-y"
            style={NO_OUTLINE}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            {error}
          </div>
        )}

        <ReferenceSelector
          reference={reference}
          value={referenceSource}
          onChange={setReferenceSource}
        />

        {(result?.generatedUrl || loading) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-400">생성 결과</div>
              {result?.generatedUrl && (
                <label className="flex items-center gap-2 text-[12px] text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bgRemoveEnabled}
                    onChange={(e) => setBgRemoveEnabled(e.target.checked)}
                    className="accent-fuchsia-500"
                  />
                  배경 제거 (시안)
                  {processing && <span className="text-gray-500">(처리 중...)</span>}
                </label>
              )}
            </div>

            {result?.generatedUrl && bgRemoveEnabled && (
              <div className="mb-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/60 space-y-2">
                <div className="text-[11px] text-gray-400 leading-relaxed">
                  이미지 코너에서 자동 감지한 배경색을 단색 chroma key로 제거합니다. <b className="text-gray-300">허용 오차</b>가 클수록 배경색에서 더 멀어진 픽셀도 같은 배경으로 간주합니다. 캐릭터가 함께 지워지면 낮추세요.
                </div>
                {detectedBg && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <span>감지된 배경색:</span>
                    <span
                      className="inline-block w-4 h-4 rounded border border-gray-600"
                      style={{ backgroundColor: `rgb(${detectedBg.r}, ${detectedBg.g}, ${detectedBg.b})` }}
                    />
                    <span className="font-mono text-gray-500">rgb({detectedBg.r}, {detectedBg.g}, {detectedBg.b})</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-gray-400 w-28 flex-shrink-0">허용 오차 ({tolerance})</label>
                  <input
                    type="range"
                    min={0}
                    max={441}
                    value={tolerance}
                    onChange={(e) => setTolerance(parseInt(e.target.value))}
                    className="flex-1 accent-fuchsia-500"
                  />
                </div>
              </div>
            )}

            <div
              className="rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center"
              style={{
                minHeight: 320,
                // 배경 제거 시 투명 영역 확인용 체커보드, 아니면 원본 시안 배경
                backgroundColor: bgRemoveEnabled ? '#1f2937' : '#00FFFF',
                backgroundImage: bgRemoveEnabled
                  ? 'linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)'
                  : undefined,
                backgroundSize: bgRemoveEnabled ? '16px 16px' : undefined,
                backgroundPosition: bgRemoveEnabled ? '0 0, 0 8px, 8px -8px, -8px 0px' : undefined,
              }}
            >
              {result?.generatedUrl ? (
                bgRemoveEnabled && processedUrl ? (
                  <img src={processedUrl} alt="generated" className="max-w-full max-h-[480px] object-contain" />
                ) : (
                  <img src={result.generatedUrl} alt="generated" className="max-w-full max-h-[480px] object-contain" />
                )
              ) : (
                <div className="text-gray-500 text-sm py-16">{loading ? '생성 중...' : ''}</div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            style={NO_OUTLINE}
          >
            닫기
          </button>
          <button
            onClick={download}
            disabled={!result?.generatedUrl || saving || loading}
            className="px-4 py-2 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
          >
            PC 다운로드
          </button>
          <button
            onClick={save}
            disabled={!result?.generatedUrl || saving || loading}
            className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
            style={NO_OUTLINE}
          >
            {saving ? '저장 중...' : '이 이미지로 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 일괄 AI 생성 모달 — SFW emotion을 병렬 생성 + ZIP 다운로드 + 일괄 저장
// NEUTRAL(기본)은 레퍼런스로 쓰이고, ANGRY(화남)는 사용 빈도가 낮아 일괄 생성에서 제외.
// ============================================
const BATCH_EMOTIONS = SFW_EMOTIONS.filter((e) => e.key !== 'NEUTRAL' && e.key !== 'ANGRY')

function BatchExpressionGenerator({ characterId, styleId, characterName, onClose, onSaved }) {
  const [posePrompt, setPosePrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zipping, setZipping] = useState(false)
  // results: { [emotionKey]: { status: 'idle'|'loading'|'done'|'failed', generatedUrl?, error? } }
  const [results, setResults] = useState({})
  const [reference, setReference] = useState(null)
  const [referenceSource, setReferenceSource] = useState(null)

  // 일괄 생성은 검정 배경으로 바로 받는다. 별도 chroma key 후처리 없음.
  const getEmotionBlob = async (generatedUrl) => {
    const res = await fetch(generatedUrl)
    return res.blob()
  }

  useEffect(() => {
    api
      .get(`/admin/expressions/reference-preview?characterId=${characterId}`)
      .then((ref) => {
        setReference(ref)
        setReferenceSource(pickDefaultReferenceSource(ref))
      })
      .catch(() => setReference({ profileImage: null, baseImages: [] }))
  }, [characterId])

  const doneCount = Object.values(results).filter((r) => r?.status === 'done').length
  const anyLoading = loading || Object.values(results).some((r) => r?.status === 'loading')

  const generate = async () => {
    if (!referenceSource) return
    setLoading(true)
    const initial = {}
    for (const e of BATCH_EMOTIONS) initial[e.key] = { status: 'loading' }
    setResults(initial)

    await Promise.all(
      BATCH_EMOTIONS.map(async (e) => {
        try {
          const data = await api.post('/admin/expressions/generate', {
            characterId,
            styleId,
            emotion: e.key,
            posePrompt: posePrompt.trim(),
            referenceSource,
            background: 'black',
          })
          setResults((prev) => ({
            ...prev,
            [e.key]: { status: 'done', generatedUrl: data.generatedUrl },
          }))
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [e.key]: { status: 'failed', error: err.message || '생성 실패' },
          }))
        }
      }),
    )
    setLoading(false)
  }

  const downloadZip = async () => {
    setZipping(true)
    try {
      const zip = new JSZip()
      for (const e of BATCH_EMOTIONS) {
        const r = results[e.key]
        if (r?.status !== 'done' || !r.generatedUrl) continue
        const blob = await getEmotionBlob(r.generatedUrl)
        zip.file(`${e.key}.png`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${characterName || 'expressions'}-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP 생성 실패:', err)
    } finally {
      setZipping(false)
    }
  }

  const saveAll = async () => {
    setSaving(true)
    const newImages = []
    for (const e of BATCH_EMOTIONS) {
      const r = results[e.key]
      if (r?.status !== 'done' || !r.generatedUrl) continue
      try {
        const blob = await getEmotionBlob(r.generatedUrl)
        const file = new File([blob], `ai-${e.key.toLowerCase()}-${Date.now()}.png`, {
          type: 'image/png',
        })
        const fd = new FormData()
        fd.append('image', file)
        fd.append('emotion', e.key)
        fd.append('description', 'AI 일괄 생성 (Grok, 검정 배경)')
        const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, fd)
        newImages.push({ ...uploaded, emotion: e.key })
      } catch (err) {
        console.error(`${e.key} 저장 실패:`, err)
      }
    }
    if (newImages.length) onSaved(newImages)
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-5xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              ✨ 일괄 AI 표정 생성 — {characterName}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              NEUTRAL을 레퍼런스로 {BATCH_EMOTIONS.length}종({BATCH_EMOTIONS.map((e) => e.label).join('·')})을 병렬 생성. 검정 배경.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={anyLoading || saving || !referenceSource}
            className="px-4 py-2 text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-md disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {anyLoading ? '생성 중...' : doneCount > 0 ? '다시 생성' : `${BATCH_EMOTIONS.length}종 생성`}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-[11px] text-gray-400 mb-1.5">구도 / 자세 ({BATCH_EMOTIONS.length}종 모두 공통 적용)</label>
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-md px-3 py-2 text-[11px] text-gray-400 mb-2">
            <span className="text-gray-500">디폴트 (항상 적용):</span> {DEFAULT_COMPOSITION_KO}
          </div>
          <textarea
            value={posePrompt}
            onChange={(e) => setPosePrompt(e.target.value)}
            placeholder="추가 지시 (선택) — 입력 시 디폴트보다 우선합니다. 예: 전신 구도 / 측면 각도 / 팔짱 자세"
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 resize-y"
            style={NO_OUTLINE}
          />
        </div>

        <ReferenceSelector
          reference={reference}
          value={referenceSource}
          onChange={setReferenceSource}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {BATCH_EMOTIONS.map((e) => {
            const r = results[e.key]
            return (
              <div key={e.key} className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 flex items-center justify-between bg-gray-800/70">
                  <span className="text-xs text-white">{e.label}</span>
                  <span className="text-[10px] text-gray-500">{e.key}</span>
                </div>
                <div
                  className="aspect-[3/4] flex items-center justify-center"
                  style={{ backgroundColor: '#000000' }}
                >
                  {!r ? (
                    <span className="text-[10px] text-gray-600">대기</span>
                  ) : r.status === 'loading' ? (
                    <span className="text-[10px] text-gray-400 animate-pulse">생성 중...</span>
                  ) : r.status === 'failed' ? (
                    <span
                      className="text-[10px] text-red-400 px-2 text-center"
                      title={r.error}
                    >
                      실패{r.error ? `: ${r.error.slice(0, 40)}` : ''}
                    </span>
                  ) : r.generatedUrl ? (
                    <img src={r.generatedUrl} alt={e.key} className="w-full h-full object-contain" />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving || zipping}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            style={NO_OUTLINE}
          >
            닫기
          </button>
          <button
            onClick={downloadZip}
            disabled={doneCount === 0 || anyLoading || zipping || saving}
            className="px-4 py-2 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
            title="완성된 결과만 ZIP으로 묶어 다운로드"
          >
            {zipping ? 'ZIP 생성 중...' : `ZIP 다운로드 (${doneCount})`}
          </button>
          <button
            onClick={saveAll}
            disabled={doneCount === 0 || anyLoading || saving || zipping}
            className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
          >
            {saving ? '저장 중...' : `모두 저장 (${doneCount})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 배경 탭 — 라이브러리(전역 풀) + 캐릭터별 할당
// ============================================

// 자동 생성 배경은 server/lib/backgroundGen.js가 description을 "[auto] ..." 로 prefix해서 저장.
const isAutoGenerated = (bg) => typeof bg?.description === 'string' && bg.description.startsWith('[auto]')
const stripAutoPrefix = (desc) => (desc || '').replace(/^\[auto\]\s*/, '')

function BackgroundsTab() {
  const [library, setLibrary] = useState(null)
  const [assignments, setAssignments] = useState(null) // [{id, name, profileImage, backgrounds: [{id, order, background:{id,filePath,tags}}]}]
  const [pickerForCharacter, setPickerForCharacter] = useState(null)
  const [libraryDragOver, setLibraryDragOver] = useState(false)
  const [batchUploading, setBatchUploading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all') // 'all' | 'manual' | 'auto'

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

  const autoCount = library.filter(isAutoGenerated).length
  const manualCount = library.length - autoCount
  const filteredLibrary = library.filter((bg) => {
    if (sourceFilter === 'auto') return isAutoGenerated(bg)
    if (sourceFilter === 'manual') return !isAutoGenerated(bg)
    return true
  })

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
              전역 풀 · {library.length}개 (수동 {manualCount} / AI 생성 {autoCount}) · 이미지를 이 영역에 드래그하면 일괄 업로드
              {batchUploading && <span className="ml-2 text-amber-400">업로드 중...</span>}
            </p>
          </div>
          <LibraryUploadButton onUpload={handleUpload} />
        </div>

        <div className="flex gap-1.5 mb-3">
          {[
            { key: 'all', label: '전체', count: library.length },
            { key: 'manual', label: '수동 업로드', count: manualCount },
            { key: 'auto', label: 'AI 생성', count: autoCount },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setSourceFilter(f.key)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                sourceFilter === f.key
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {f.label} · {f.count}
            </button>
          ))}
        </div>

        {filteredLibrary.length === 0 ? (
          <div className="bg-gray-900/60 border border-dashed border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
            {library.length === 0
              ? '아직 등록된 배경이 없습니다. 우측 상단 버튼을 누르거나 이미지를 드래그해서 추가하세요.'
              : '이 필터에 해당하는 배경이 없습니다.'}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filteredLibrary.map((bg) => (
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
  const auto = isAutoGenerated(bg)
  const cleanDescription = stripAutoPrefix(bg.description)

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
      {auto && (
        <span
          className="absolute top-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-600/90 text-white shadow-sm"
          title={`AI 자동 생성${bg.createdAt ? ` · ${new Date(bg.createdAt).toLocaleString('ko-KR')}` : ''}`}
        >
          AI 생성
        </span>
      )}
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
        {cleanDescription && (
          <p
            className="text-[10px] text-gray-400 mt-1.5 line-clamp-2 leading-snug"
            title={cleanDescription}
          >
            {cleanDescription}
          </p>
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
