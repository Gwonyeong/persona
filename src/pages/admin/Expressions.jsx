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

  // 같은 (styleId, emotion)에 여러 이미지 허용 — 추가/삭제 별도 핸들러.
  const addImage = (characterId, image) => {
    setCharacters((prev) =>
      prev.map((c) => {
        if (c.id !== characterId || !c.defaultStyle) return c
        const next = [
          ...c.defaultStyle.images,
          { id: image.id, emotion: image.emotion, filePath: image.filePath },
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

function CharacterRow({ character, emotions, onAddImage, onRemoveImage }) {
  const style = character.defaultStyle
  const [batchOpen, setBatchOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // 한 emotion에 여러 이미지 가능 — 배열로 그룹화.
  const imagesByEmotion = useMemo(() => {
    const map = {}
    if (style) for (const img of style.images) {
      if (!map[img.emotion]) map[img.emotion] = []
      map[img.emotion].push(img)
    }
    return map
  }, [style])

  const totalImages = useMemo(
    () => Object.values(imagesByEmotion).reduce((sum, arr) => sum + arr.length, 0),
    [imagesByEmotion],
  )

  // 캐릭터의 모든 표정 이미지를 emotion별 폴더로 묶어 ZIP 다운로드.
  const downloadAllZip = async () => {
    if (downloading || !style || totalImages === 0) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      for (const e of emotions) {
        const imgs = imagesByEmotion[e.key] || []
        if (imgs.length === 0) continue
        const folder = zip.folder(e.key)
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i]
          try {
            const res = await fetch(img.filePath)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const blob = await res.blob()
            let ext = 'png'
            try {
              const urlPath = new URL(img.filePath).pathname
              const last = urlPath.split('.').pop()?.toLowerCase()
              if (last && /^(png|jpg|jpeg|webp|gif)$/.test(last)) ext = last
            } catch {}
            folder.file(`${e.key}_${String(i + 1).padStart(2, '0')}.${ext}`, blob)
          } catch (err) {
            console.error(`${e.key}_${i + 1} 다운로드 실패:`, err)
          }
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const safeName = (character.name || 'character').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
      const styleName = (style.name || 'style').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeName}_${styleName}_${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('전체 다운로드 실패:', err)
      alert(`전체 다운로드 실패: ${err.message || err}`)
    } finally {
      setDownloading(false)
    }
  }

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
                      onClick={() => setBatchOpen(true)}
                      className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200"
                      style={NO_OUTLINE}
                      title="일반 표정 5종을 한 번에 AI 생성"
                    >
                      ✨ 일괄 AI 생성
                    </button>
                    <button
                      onClick={downloadAllZip}
                      disabled={downloading || totalImages === 0}
                      className="text-[10px] text-emerald-300 hover:text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={NO_OUTLINE}
                      title={totalImages === 0 ? '다운로드할 이미지가 없습니다' : `표정별 폴더로 묶어 ZIP 다운로드 (${totalImages}장)`}
                    >
                      {downloading ? '📦 압축 중...' : `📦 ZIP 다운로드 (${totalImages})`}
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
                onAdd={onAddImage}
                onRemove={onRemoveImage}
              />
            ) : (
              <div className="w-16 h-16 mx-auto rounded-md bg-gray-800/40 border border-dashed border-gray-700/50" />
            )}
          </td>
        ))}
      </tr>

      {/* fixed-positioned 모달은 table 흐름 밖(document.body)에서 렌더링한다 */}
      {batchOpen && style && createPortal(
        <BatchExpressionGenerator
          characterId={character.id}
          styleId={style.id}
          characterName={character.name}
          onClose={() => setBatchOpen(false)}
          onSaved={(images) => {
            for (const img of images) onAddImage(img)
          }}
        />,
        document.body,
      )}
    </>
  )
}

function EmotionCell({ characterId, styleId, emotion, emotionLabel, images, onAdd, onRemove }) {
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
          onClose={() => setManagerOpen(false)}
          onUpload={uploadFile}
          uploading={uploading}
          onRemove={onRemove}
          onAdd={onAdd}
        />
      )}
    </>
  )
}

function EmotionSlotManager({ characterId, styleId, emotion, emotionLabel, images, onClose, onUpload, uploading, onRemove, onAdd }) {
  const [removingId, setRemovingId] = useState(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [bgImage, setBgImage] = useState(null) // 배경 제거 모달에서 처리할 이미지

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
            <p className="text-[11px] text-gray-500 mt-0.5">총 {images.length}장 · 채팅에서 랜덤으로 1장 선택됨</p>
          </div>
          <div className="flex gap-2">
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

        {images.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">아직 이미지가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {images.map((img) => (
              <div key={img.id} className="relative group rounded-md overflow-hidden bg-gray-800">
                <div className="aspect-[3/4]">
                  <ExpressionThumb src={img.filePath} className="w-full h-full object-cover" />
                </div>
                {!isVideoUrl(img.filePath) && (
                  <button
                    onClick={() => setBgImage(img)}
                    className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-fuchsia-600 text-white text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    style={NO_OUTLINE}
                    title="배경 제거 (시안 chroma key)"
                  >
                    🪄
                  </button>
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
            ))}
          </div>
        )}

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
