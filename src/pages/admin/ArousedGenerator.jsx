import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { EMOTION_TABS, NO_OUTLINE } from './Expressions'

// 프리셋 기반 흥분 컷 생성 — 의상 선택 → 레퍼런스 선택 → 슬롯별 프리셋 랜덤 뽑기
// → 편집 모델(단일 또는 모델별 1장씩 비교)로 이미지 생성/저장 → 연결 영상 프리셋으로 MiniMax 영상 생성/저장.
// 프리셋 원본은 server/data/aroused-presets.json (고정 프롬프트, 수작업 검수).

const SLOTS = EMOTION_TABS.nsfw.emotions
const UNDERWEAR_COLORS = ['black', 'white', 'red', 'pink', 'navy', 'lavender']
const isVideoUrl = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(u || '')

let draftSeq = 0
const newDraft = (slot, presetId) => ({
  key: ++draftSeq,
  slot,
  presetId,
  imgs: {}, // modelKey → { status, url, error, saving }
  savedFrom: null, // 저장에 쓴 modelKey
  savedImage: null,
  videoPresetId: null,
  videoSource: null, // 영상 첫 프레임으로 쓸 이미지 타일(modelKey)
  videoDuration: 5,
  vid: { status: 'idle' }, // + meta: { sourceKey, sourceLabel, presetId, duration }
  savedVideo: false,
})

// 영상 첫 프레임/프리셋 결정 — 저장한 타일 > 직접 고른 타일 > 첫 완성 타일. 카드 UI와 일괄 생성이 공유.
function resolveVideoTarget(draft, imageModels, videoOptions) {
  const doneKeys = imageModels.filter((m) => draft.imgs[m.key]?.status === 'done').map((m) => m.key)
  const source = draft.savedFrom || (doneKeys.includes(draft.videoSource) ? draft.videoSource : doneKeys[0])
  const presetId = draft.videoPresetId || videoOptions[0]?.id || null
  return { source: source || null, presetId, doneKeys }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ArousedGenerator({ character, styles, onImageSaved }) {
  const [presets, setPresets] = useState(null)
  const [styleId, setStyleId] = useState(styles[0]?.id ?? null)
  const [referenceUrl, setReferenceUrl] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [underwearColor, setUnderwearColor] = useState(
    () => UNDERWEAR_COLORS[Math.floor(Math.random() * UNDERWEAR_COLORS.length)],
  )
  const [perSlot, setPerSlot] = useState(2)
  const [drafts, setDrafts] = useState([])
  const [genMode, setGenMode] = useState(null) // 'all' = 모델별 1장씩, 아니면 modelKey 하나. 프리셋 로드 후 기본 모델로.
  const timers = useRef(new Set())

  useEffect(() => {
    api
      .get('/admin/aroused-gen/presets')
      .then((p) => {
        setPresets(p)
        setGenMode(p.defaultImageModel)
      })
      .catch(() => setPresets({ images: [], genericVideos: [], imageModels: [] }))
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [])

  const style = styles.find((s) => s.id === styleId) || null
  const referenceCandidates = useMemo(
    () => (style?.images || []).filter((i) => i.filePath && !isVideoUrl(i.filePath)),
    [style],
  )

  // 의상이 바뀔 때만 레퍼런스 초기화 — 저장으로 이미지 목록이 늘어날 때는 선택 유지.
  useEffect(() => {
    setReferenceUrl(referenceCandidates[0]?.filePath || '')
    setCustomUrl('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId])

  const effectiveRef = customUrl.trim() || referenceUrl
  const presetsBySlot = useMemo(() => {
    const m = {}
    for (const p of presets?.images || []) (m[p.slot] ||= []).push(p)
    return m
  }, [presets])
  const imagePresetById = useMemo(() => new Map((presets?.images || []).map((p) => [p.id, p])), [presets])

  const videoOptionsFor = (draft) => {
    const p = imagePresetById.get(draft.presetId)
    const linked = p?.videos || []
    const generic = (presets?.genericVideos || []).filter((v) => v.slots?.includes(draft.slot))
    return [...linked, ...generic]
  }

  const patch = (key, fn) => setDrafts((ds) => ds.map((d) => (d.key === key ? fn(d) : d)))

  const drawRandom = () => {
    const next = []
    for (const s of SLOTS) {
      const pool = presetsBySlot[s.key] || []
      for (const p of shuffle(pool).slice(0, perSlot)) next.push(newDraft(s.key, p.id))
    }
    setDrafts(next)
  }

  const poll = (predictionId, intervalMs, onDone) => {
    const tick = async () => {
      try {
        const r = await api.get(`/admin/aroused-gen/predictions/${predictionId}`)
        if (r.status === 'completed' && r.output) return onDone({ status: 'done', url: r.output })
        if (r.status === 'failed') return onDone({ status: 'error', error: r.error || '생성 실패 (검열 가능성)' })
      } catch {
        // 일시적 네트워크 오류는 다음 tick 에서 재시도
      }
      const t = setTimeout(tick, intervalMs)
      timers.current.add(t)
    }
    const t = setTimeout(tick, intervalMs)
    timers.current.add(t)
  }

  const imageModels = presets?.imageModels || []
  const modelKeysFor = (mode) => (mode === 'all' ? imageModels.map((m) => m.key) : [mode])
  const patchImg = (key, modelKey, fn) =>
    patch(key, (d) => ({ ...d, imgs: { ...d.imgs, [modelKey]: fn(d.imgs[modelKey] || {}) } }))

  const generateImage = (draft, modelKeys) => {
    if (!effectiveRef) return alert('레퍼런스 이미지를 선택하세요.')
    for (const modelKey of modelKeys) {
      patchImg(draft.key, modelKey, () => ({ status: 'running' }))
      api
        .post('/admin/aroused-gen/image', {
          referenceUrl: effectiveRef,
          presetId: draft.presetId,
          underwearColor,
          model: modelKey,
        })
        .then(({ predictionId }) => poll(predictionId, 3000, (r) => patchImg(draft.key, modelKey, () => r)))
        .catch((e) => patchImg(draft.key, modelKey, () => ({ status: 'error', error: e.message })))
    }
  }

  const saveImage = async (draft, modelKey) => {
    patchImg(draft.key, modelKey, (r) => ({ ...r, saving: true }))
    try {
      const { image } = await api.post('/admin/aroused-gen/save-image', {
        styleId,
        emotion: draft.slot,
        url: draft.imgs[modelKey].url,
      })
      const firstVideo = videoOptionsFor(draft)[0]?.id || null
      patch(draft.key, (d) => ({
        ...d,
        imgs: { ...d.imgs, [modelKey]: { ...d.imgs[modelKey], saving: false } },
        savedFrom: modelKey,
        savedImage: image,
        videoPresetId: firstVideo,
      }))
      onImageSaved?.(styleId, image)
    } catch (e) {
      patchImg(draft.key, modelKey, (r) => ({ ...r, saving: false, error: e.message }))
    }
  }

  // 저장 전 테스트도 가능 — 첫 프레임은 저장된 이미지가 있으면 그 Supabase URL, 없으면 WaveSpeed 결과 URL.
  const generateVideo = async (draft, sourceKey, videoPresetId) => {
    const imageUrl =
      draft.savedImage && draft.savedFrom === sourceKey ? draft.savedImage.filePath : draft.imgs[sourceKey]?.url
    if (!imageUrl) return
    const meta = {
      sourceKey,
      sourceLabel: imageModels.find((m) => m.key === sourceKey)?.label,
      presetId: videoPresetId,
      duration: draft.videoDuration,
    }
    patch(draft.key, (d) => ({ ...d, vid: { status: 'running', meta }, savedVideo: false }))
    try {
      const { predictionId } = await api.post('/admin/aroused-gen/video', {
        imageUrl,
        videoPresetId,
        underwearColor,
        duration: draft.videoDuration,
      })
      poll(predictionId, 6000, (r) => patch(draft.key, (d) => ({ ...d, vid: { ...r, meta } })))
    } catch (e) {
      patch(draft.key, (d) => ({ ...d, vid: { status: 'error', error: e.message, meta } }))
    }
  }

  // 이미지가 아직 슬롯에 없으면 영상의 첫 프레임 이미지를 먼저 저장한 뒤 영상을 그 행에 연결.
  const saveVideo = async (draft) => {
    const sourceKey = draft.vid.meta?.sourceKey
    if (draft.savedImage && draft.savedFrom !== sourceKey) {
      return alert('이미 다른 모델 이미지가 저장돼 있습니다. 저장된 이미지로 영상을 다시 생성하세요.')
    }
    patch(draft.key, (d) => ({ ...d, vid: { ...d.vid, saving: true } }))
    try {
      let saved = draft.savedImage
      if (!saved) {
        ;({ image: saved } = await api.post('/admin/aroused-gen/save-image', {
          styleId,
          emotion: draft.slot,
          url: draft.imgs[sourceKey].url,
        }))
        onImageSaved?.(styleId, saved)
      }
      const { image } = await api.post('/admin/aroused-gen/save-video', { imageId: saved.id, url: draft.vid.url })
      patch(draft.key, (d) => ({
        ...d,
        vid: { ...d.vid, saving: false },
        savedVideo: true,
        savedImage: image,
        savedFrom: sourceKey,
      }))
      onImageSaved?.(styleId, image)
    } catch (e) {
      patch(draft.key, (d) => ({ ...d, vid: { ...d.vid, saving: false, error: e.message } }))
    }
  }

  // 아직 한 장도 안 뽑은 카드만 현재 모드로 생성
  const generateAllImages = () => {
    drafts.filter((d) => Object.keys(d.imgs).length === 0).forEach((d) => generateImage(d, modelKeysFor(genMode)))
  }
  // 이미지가 완성됐고 영상이 아직 없거나 실패한 카드를 한꺼번에 병렬 제출
  const videoReadyDrafts = drafts.filter((d) => {
    const { source, presetId } = resolveVideoTarget(d, imageModels, videoOptionsFor(d))
    return source && presetId && (d.vid.status === 'idle' || d.vid.status === 'error')
  })
  const generateAllVideos = () => {
    for (const d of videoReadyDrafts) {
      const { source, presetId } = resolveVideoTarget(d, imageModels, videoOptionsFor(d))
      generateVideo(d, source, presetId)
    }
  }
  const modeCost =
    genMode === 'all'
      ? imageModels.reduce((s, m) => s + m.price, 0)
      : imageModels.find((m) => m.key === genMode)?.price || 0

  if (!presets) return <div className="p-6 text-gray-400">프리셋 불러오는 중...</div>
  if (styles.length === 0) return <div className="p-6 text-gray-500">의상(스타일)이 없습니다. 먼저 의상을 추가하세요.</div>

  return (
    <div className="space-y-4">
      {/* 1. 설정 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-400">
            의상
            <select
              value={styleId ?? ''}
              onChange={(e) => {
                setStyleId(parseInt(e.target.value))
                setDrafts([])
              }}
              className="block mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || `스타일 #${s.id}`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            속옷 색 (모든 컷 공통)
            <select
              value={underwearColor}
              onChange={(e) => setUnderwearColor(e.target.value)}
              className="block mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {UNDERWEAR_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            슬롯당 개수
            <select
              value={perSlot}
              onChange={(e) => setPerSlot(parseInt(e.target.value))}
              className="block mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            이미지 모델
            <select
              value={genMode ?? ''}
              onChange={(e) => setGenMode(e.target.value)}
              className="block mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="all">전 모델 비교 (모델별 1장씩)</option>
              {imageModels.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} · ${m.price}
                  {m.key === presets.defaultImageModel ? ' (기본)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">레퍼런스 이미지 — 모든 컷이 이 한 장에서 파생됩니다 (얼굴 유지)</p>
          {referenceCandidates.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {referenceCandidates.map((img) => (
                <button
                  key={img.id}
                  onClick={() => {
                    setReferenceUrl(img.filePath)
                    setCustomUrl('')
                  }}
                  className={`relative shrink-0 rounded-lg overflow-hidden border-2 ${
                    !customUrl && referenceUrl === img.filePath ? 'border-pink-500' : 'border-gray-700 hover:border-gray-500'
                  }`}
                  style={{ width: 64, ...NO_OUTLINE }}
                  title={img.emotion}
                >
                  <img src={img.filePath} alt="" className="w-full object-cover" style={{ aspectRatio: '3/4' }} />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-gray-200 truncate px-1">
                    {img.emotion}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-yellow-500">이 의상에 이미지가 없습니다. 아래에 URL을 입력하세요.</p>
          )}
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="또는 이미지 URL 직접 입력"
            className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={drawRandom}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-pink-600 hover:bg-pink-500 text-white"
            style={NO_OUTLINE}
          >
            🎲 프리셋 랜덤 뽑기
          </button>
          <button
            onClick={generateAllImages}
            disabled={drafts.length === 0 || !effectiveRef}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40"
            style={NO_OUTLINE}
          >
            ▶ 대기 중인 이미지 전부 생성
          </button>
          <button
            onClick={generateAllVideos}
            disabled={videoReadyDrafts.length === 0}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40"
            style={NO_OUTLINE}
            title="이미지가 완성된 카드의 영상을 동시에 생성합니다 (카드별 길이·프리셋 설정 사용)"
          >
            🎬 영상 일괄 생성 ({videoReadyDrafts.length})
          </button>
          <span className="self-center text-[11px] text-gray-500">
            컷당 이미지 ${modeCost.toFixed(3)} · 영상(5초) $0.20
          </span>
        </div>
      </div>

      {/* 2. 슬롯별 드래프트 */}
      {drafts.length > 0 &&
        SLOTS.map((s) => {
          const slotDrafts = drafts.filter((d) => d.slot === s.key)
          return (
            <div key={s.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-baseline gap-2 mb-3">
                <h3 className="text-sm font-semibold text-pink-200">{s.label}</h3>
                <span className="text-[11px] text-gray-500">{s.key}</span>
                <button
                  onClick={() => {
                    const pool = presetsBySlot[s.key] || []
                    if (pool.length) setDrafts((ds) => [...ds, newDraft(s.key, shuffle(pool)[0].id)])
                  }}
                  disabled={!presetsBySlot[s.key]?.length}
                  className="ml-auto text-xs text-gray-400 hover:text-white disabled:opacity-30"
                  style={NO_OUTLINE}
                >
                  + 컷 추가
                </button>
              </div>
              {slotDrafts.length === 0 ? (
                <p className="text-xs text-gray-600">이 슬롯에 프리셋이 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {slotDrafts.map((d) => (
                    <DraftCard
                      key={d.key}
                      draft={d}
                      slotPresets={presetsBySlot[s.key] || []}
                      preset={imagePresetById.get(d.presetId)}
                      imageModels={imageModels}
                      videoOptions={videoOptionsFor(d)}
                      onChangePreset={(presetId) =>
                        patch(d.key, (x) => ({ ...newDraft(x.slot, presetId), key: x.key }))
                      }
                      onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                      onGenerate={() => generateImage(d, modelKeysFor(genMode))}
                      onRegenerateModel={(modelKey) => generateImage(d, [modelKey])}
                      onSaveImage={(modelKey) => saveImage(d, modelKey)}
                      onChangeVideoPreset={(id) => patch(d.key, (x) => ({ ...x, videoPresetId: id }))}
                      onChangeVideoSource={(k) => patch(d.key, (x) => ({ ...x, videoSource: k }))}
                      onChangeVideoDuration={(n) => patch(d.key, (x) => ({ ...x, videoDuration: n }))}
                      onGenerateVideo={(sourceKey, presetId) => generateVideo(d, sourceKey, presetId)}
                      onSaveVideo={() => saveVideo(d)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}

function DraftCard({
  draft,
  slotPresets,
  preset,
  imageModels,
  videoOptions,
  onChangePreset,
  onRemove,
  onGenerate,
  onRegenerateModel,
  onSaveImage,
  onChangeVideoPreset,
  onChangeVideoSource,
  onChangeVideoDuration,
  onGenerateVideo,
  onSaveVideo,
}) {
  const { imgs, vid, savedImage, savedVideo, savedFrom } = draft
  const btn = 'px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40'
  const anyRunning = Object.values(imgs).some((r) => r.status === 'running')
  // 생성 이력이 있는 모델만 타일로, 모델 목록 순서대로
  const tiles = imageModels.filter((m) => imgs[m.key])
  const doneTiles = tiles.filter((m) => imgs[m.key].status === 'done')
  const { source: videoSource, presetId: videoPresetId } = resolveVideoTarget(draft, imageModels, videoOptions)
  const videoPreset = videoOptions.find((v) => v.id === videoPresetId)

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={draft.presetId}
          onChange={(e) => onChangePreset(e.target.value)}
          disabled={anyRunning}
          className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
        >
          {slotPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} — {p.desc.slice(0, 30)}
            </option>
          ))}
        </select>
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-sm px-1" style={NO_OUTLINE} title="컷 제거">
          ✕
        </button>
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">{preset?.desc}</p>

      {/* 이미지 — 모델별 타일 */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tiles.map((m) => {
            const r = imgs[m.key]
            const isSaved = savedFrom === m.key
            return (
              <div
                key={m.key}
                className={`rounded-lg overflow-hidden border ${isSaved ? 'border-green-500' : 'border-gray-700'} bg-gray-900 flex flex-col`}
              >
                <div className="px-2 py-1 bg-black/40 flex items-baseline justify-between gap-1">
                  <span className="text-[11px] font-semibold text-white truncate">{m.label}</span>
                  <span className="text-[10px] text-gray-500 shrink-0">${m.price}</span>
                </div>
                <div className="flex items-center justify-center" style={{ aspectRatio: '3/4' }}>
                  {r.status === 'done' ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="w-full h-full">
                      <img src={r.url} alt={m.label} className="w-full h-full object-cover" />
                    </a>
                  ) : r.status === 'running' ? (
                    <span className="text-[11px] text-blue-300 animate-pulse">생성 중...</span>
                  ) : (
                    <span className="text-[11px] text-red-400 px-2 text-center break-words">{r.error}</span>
                  )}
                </div>
                <div className="flex gap-1 p-1">
                  <button
                    onClick={() => onRegenerateModel(m.key)}
                    disabled={r.status === 'running' || r.saving}
                    className="flex-1 py-1 text-[11px] rounded bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40"
                    style={NO_OUTLINE}
                  >
                    재생성
                  </button>
                  {r.status === 'done' && !savedImage && (
                    <button
                      onClick={() => onSaveImage(m.key)}
                      disabled={r.saving}
                      className="flex-1 py-1 text-[11px] rounded bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-40"
                      style={NO_OUTLINE}
                    >
                      {r.saving ? '저장 중' : '저장'}
                    </button>
                  )}
                  {isSaved && <span className="flex-1 text-center text-[11px] text-green-400 self-center">✓ 저장됨</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <button
          onClick={onGenerate}
          disabled={anyRunning}
          className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}
          style={NO_OUTLINE}
        >
          {tiles.length === 0 ? '이미지 생성' : '다시 생성 (현재 모델 설정)'}
        </button>
        {savedImage && (
          <span className="text-[11px] text-green-400">
            ✓ #{savedImage.id} 저장 ({imageModels.find((m) => m.key === savedFrom)?.label})
          </span>
        )}
      </div>

      {/* 영상 — 완성된 이미지 타일이 하나라도 있으면 저장 전에도 테스트 가능 */}
      {doneTiles.length > 0 && (
        <div className="border-t border-gray-700 pt-2 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-gray-300">🎬 영상 (MiniMax H3 spicy · 768p)</p>
          {videoOptions.length === 0 ? (
            <p className="text-[11px] text-gray-500">연결된 영상 프리셋이 없습니다.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <label className="text-[10px] text-gray-500 flex-1 min-w-0">
                  첫 프레임 이미지
                  <select
                    value={videoSource || ''}
                    onChange={(e) => onChangeVideoSource(e.target.value)}
                    disabled={savedImage || vid.status === 'running'}
                    className="block w-full mt-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  >
                    {doneTiles.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                        {savedFrom === m.key ? ' (저장됨)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] text-gray-500">
                  길이
                  <select
                    value={draft.videoDuration}
                    onChange={(e) => onChangeVideoDuration(parseInt(e.target.value))}
                    disabled={vid.status === 'running'}
                    className="block mt-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  >
                    <option value={5}>5초 · ~$0.20</option>
                    <option value={10}>10초 · ~$0.40</option>
                  </select>
                </label>
              </div>
              <select
                value={videoPresetId || ''}
                onChange={(e) => onChangeVideoPreset(e.target.value)}
                disabled={vid.status === 'running'}
                className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
              >
                {videoOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.draft ? '[초안] ' : ''}
                    {v.id} — {v.desc.replace(/^\[초안\]\s*/, '').slice(0, 28)}
                  </option>
                ))}
              </select>
              {videoPreset && <p className="text-[11px] text-gray-400 leading-snug">{videoPreset.desc}</p>}
              {vid.status === 'done' && (
                <>
                  <video src={vid.url} controls loop muted playsInline className="w-full rounded-lg" />
                  <p className="text-[10px] text-gray-500">
                    {vid.meta?.sourceLabel} · {vid.meta?.presetId} · {vid.meta?.duration}초
                  </p>
                </>
              )}
              {vid.status === 'running' && <p className="text-xs text-blue-300 animate-pulse">영상 생성 중... (약 3~5분)</p>}
              {vid.status === 'error' && <p className="text-xs text-red-400">{vid.error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => onGenerateVideo(videoSource, videoPresetId)}
                  disabled={vid.status === 'running' || vid.saving || !videoPresetId || !videoSource}
                  className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}
                  style={NO_OUTLINE}
                >
                  {vid.status === 'idle' ? '영상 생성' : '영상 재생성'}
                </button>
                {vid.status === 'done' && !savedVideo && (
                  <button
                    onClick={onSaveVideo}
                    disabled={vid.saving}
                    className={`${btn} bg-pink-600 hover:bg-pink-500 text-white`}
                    style={NO_OUTLINE}
                    title={savedImage ? '' : '이미지도 함께 슬롯에 저장됩니다'}
                  >
                    {vid.saving ? '저장 중...' : savedImage ? '영상 저장' : '이미지+영상 저장'}
                  </button>
                )}
                {savedVideo && <span className="self-center text-[11px] text-green-400">✓ 영상 연결됨</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
