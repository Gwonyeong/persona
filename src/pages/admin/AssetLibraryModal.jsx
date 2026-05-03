import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

// 스토리 에셋 라이브러리 모달 — 배경/캐릭터 이미지 카탈로그 관리 + 피커 모드 겸용
//
// Props:
// - storylineId: number
// - assetLibrary: { backgrounds, characters }
// - onLibraryChange(newLibrary): 부모 storyline state에 라이브러리 갱신 반영
// - mode: 'manage' | 'pick'
// - pickKind?: 'background' | 'character'  (pick 모드에서 노출할 카테고리 강제)
// - pickContext?: { scriptLength, defaultIndex }  (pick 모드에서 적용 범위 입력에 사용)
// - onPick?(url, indices): 피커 클릭 + 범위 확정 시 호출 → 부모가 모달 닫음
//   - indices는 적용 대상 script 아이템 인덱스 배열 (오름차순, 중복 제거)
//   - pickContext 없을 시 indices = [] (단일 적용을 부모가 알아서 처리)
// - onClose(): 닫기

// kind별 메타 — 라벨/accept 타입/카테고리 구분
// background는 image와 video 모두 허용 (영상 배경 지원). 항목별 mediaType으로 구분.
const KIND_META = {
  background: { label: '🏞 배경', short: '배경', accept: 'image/*,video/*', isAudio: false, isVideo: false, mixedMedia: true, bucket: 'backgrounds' },
  character:  { label: '👤 캐릭터', short: '캐릭터', accept: 'image/*', isAudio: false, isVideo: false, bucket: 'characters' },
  bgm:        { label: '🎵 BGM', short: 'BGM', accept: 'audio/*', isAudio: true, isVideo: false, bucket: 'bgm' },
  bgs:        { label: '🌧️ BGS', short: 'BGS', accept: 'audio/*', isAudio: true, isVideo: false, bucket: 'bgs' },
  chatImage:  { label: '📷 채팅이미지', short: '채팅이미지', accept: 'image/*', isAudio: false, isVideo: false, bucket: 'chatImage' },
  chatVideo:  { label: '🎬 채팅영상', short: '채팅영상', accept: 'video/*', isAudio: false, isVideo: true, bucket: 'chatVideo' },
}
const ALL_KINDS = ['background', 'character', 'bgm', 'bgs', 'chatImage', 'chatVideo']

function fileMatchesKind(file, kind) {
  if (!file?.type) return false
  const m = KIND_META[kind]
  if (!m) return false
  if (m.isAudio) return file.type.startsWith('audio/')
  if (m.isVideo) return file.type.startsWith('video/')
  if (m.mixedMedia) return file.type.startsWith('image/') || file.type.startsWith('video/')
  return file.type.startsWith('image/')
}

// URL 확장자로 영상 여부 추론 (mediaType이 없는 레거시 항목용)
function isVideoSrc(url) {
  if (!url || typeof url !== 'string') return false
  const cleaned = url.split(/[?#]/)[0].toLowerCase()
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(cleaned)
}
function isVideoLibraryItem(it) {
  if (!it) return false
  if (it.mediaType === 'video') return true
  if (it.mediaType === 'image') return false
  return isVideoSrc(it.url)
}

// "0-3,5,7~9" 같은 다중 범위 표현을 인덱스 배열로 파싱
function parseRangeInput(input, max) {
  if (!input || typeof input !== 'string') return []
  const result = new Set()
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (m) {
      let a = parseInt(m[1], 10)
      let b = parseInt(m[2], 10)
      if (Number.isNaN(a) || Number.isNaN(b)) continue
      if (a > b) [a, b] = [b, a]
      for (let i = a; i <= b; i++) {
        if (i >= 0 && i < max) result.add(i)
      }
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10)
      if (n >= 0 && n < max) result.add(n)
    }
  }
  return Array.from(result).sort((a, b) => a - b)
}

export default function AssetLibraryModal({
  storylineId,
  assetLibrary,
  onLibraryChange,
  mode = 'manage',
  pickKind = 'background',
  pickContext = null,
  onPick,
  onClose,
}) {
  const isPick = mode === 'pick'
  const [activeKind, setActiveKind] = useState(isPick ? pickKind : 'background')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [labelInput, setLabelInput] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  // 피커 모드: 이미지 클릭 후 범위 입력 단계
  const [pendingPick, setPendingPick] = useState(null) // { url, label, idx }
  const [rangeInput, setRangeInput] = useState('')
  const [rangeError, setRangeError] = useState(null)
  const fileRef = useRef(null)

  // 피커 모드에서 썸네일 클릭 → pickContext 있으면 범위 확정 단계, 없으면 즉시 onPick
  const handlePickThumb = (it, idx) => {
    if (!isPick) return
    if (pickContext) {
      setPendingPick({ url: it.url, label: it.label, idx })
      setRangeInput(String(pickContext.defaultIndex ?? 0))
      setRangeError(null)
    } else if (onPick) {
      onPick(it.url, [])
    }
  }

  const confirmPickRange = () => {
    if (!pendingPick || !pickContext) return
    const indices = parseRangeInput(rangeInput, pickContext.scriptLength)
    if (indices.length === 0) {
      setRangeError(`유효한 인덱스를 입력하세요 (0~${pickContext.scriptLength - 1})`)
      return
    }
    if (onPick) onPick(pendingPick.url, indices)
    setPendingPick(null)
    setRangeInput('')
  }

  useEffect(() => {
    if (isPick) setActiveKind(pickKind)
  }, [isPick, pickKind])

  const lib = assetLibrary || { backgrounds: [], characters: [], bgm: [], bgs: [] }
  const meta = KIND_META[activeKind] || KIND_META.background
  const items = lib[meta.bucket] || []

  // URL-only 등록용 입력 상태
  const [urlInput, setUrlInput] = useState('')
  const [urlSubmitting, setUrlSubmitting] = useState(false)

  // 한 개씩 업로드 (라벨은 첫 파일에만 적용 — 다중 업로드 시 두 번째 이상은 라벨 없음)
  const uploadOne = async (file, label) => {
    const form = new FormData()
    form.append('image', file)
    form.append('kind', activeKind)
    if (label) form.append('label', label)
    const res = await api.post(`/admin/storylines/${storylineId}/assets`, form)
    return res.assetLibrary
  }

  const handleUpload = async (filesIn) => {
    const files = Array.isArray(filesIn) ? filesIn : (filesIn ? [filesIn] : [])
    const valid = files.filter((f) => fileMatchesKind(f, activeKind))
    if (valid.length === 0) {
      if (files.length > 0) setError(`${meta.isAudio ? '오디오' : '이미지'} 파일만 업로드 가능합니다.`)
      return
    }
    setUploading(true)
    setError(null)
    try {
      let latestLib = null
      const trimmedLabel = labelInput.trim()
      for (let i = 0; i < valid.length; i++) {
        latestLib = await uploadOne(valid[i], i === 0 ? trimmedLabel : '')
      }
      if (latestLib) onLibraryChange(latestLib)
      setLabelInput('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(e?.data?.error || e?.message || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  const handleUrlSubmit = async () => {
    const url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setError('http 또는 https로 시작하는 URL이어야 합니다.')
      return
    }
    setUrlSubmitting(true)
    setError(null)
    try {
      const res = await api.post(`/admin/storylines/${storylineId}/assets/url`, {
        kind: activeKind,
        url,
        label: labelInput.trim() || null,
      })
      onLibraryChange(res.assetLibrary)
      setUrlInput('')
      setLabelInput('')
    } catch (e) {
      setError(e?.data?.error || e?.message || 'URL 등록 실패')
    } finally {
      setUrlSubmitting(false)
    }
  }

  // 드래그앤드롭 상태/핸들러
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (uploading) return
    dragDepthRef.current += 1
    setDragOver(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setDragOver(false)
    if (uploading) return
    const dropped = Array.from(e.dataTransfer?.files || [])
    if (dropped.length > 0) handleUpload(dropped)
  }

  const handleDelete = async (assetId) => {
    setError(null)
    try {
      const res = await api.delete(`/admin/storylines/${storylineId}/assets/${assetId}`)
      onLibraryChange(res.assetLibrary)
      setConfirmDeleteId(null)
    } catch (e) {
      setError(e?.data?.error || e?.message || '삭제 실패')
    }
  }

  const handleLabelEdit = async (assetId, currentLabel) => {
    const next = window.prompt('라벨 (최대 80자)', currentLabel || '')
    if (next == null) return
    try {
      const res = await api.patch(`/admin/storylines/${storylineId}/assets/${assetId}`, { label: next })
      onLibraryChange(res.assetLibrary)
    } catch (e) {
      setError(e?.data?.error || e?.message || '라벨 수정 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`relative bg-gray-900 rounded-2xl border w-full max-w-4xl max-h-[90vh] flex flex-col transition-colors ${
          dragOver ? 'border-indigo-400 ring-2 ring-indigo-500/40' : 'border-gray-700'
        }`}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 드래그 오버 시 풀-모달 오버레이 */}
        {dragOver && (
          <div className="absolute inset-0 z-30 bg-indigo-950/70 backdrop-blur-sm rounded-2xl border-2 border-dashed border-indigo-400 flex flex-col items-center justify-center pointer-events-none">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300 mb-3">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-base font-semibold text-indigo-100">
              {meta.short}{meta.isAudio ? '(으)로' : '(으)로'} 추가
            </p>
            <p className="text-xs text-indigo-300 mt-1">
              {meta.isAudio ? '오디오 파일을 놓으면 업로드됩니다' : '이미지를 놓으면 업로드됩니다 (여러 장 OK)'}
            </p>
          </div>
        )}
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center gap-3">
          <h3 className="text-base font-bold text-white flex-1">
            {isPick ? `${meta.short} 선택` : '📁 미디어 라이브러리'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
            style={{ outline: 'none' }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 카테고리 탭 (manage 모드는 4가지, pick 모드는 pickKind 강제) */}
        <div className="px-5 pt-3 flex gap-1 border-b border-gray-800 overflow-x-auto">
          {!isPick && ALL_KINDS.map((k) => (
            <KindTab
              key={k}
              kind={k}
              label={KIND_META[k].label}
              count={(lib[KIND_META[k].bucket] || []).length}
              active={activeKind}
              onClick={setActiveKind}
            />
          ))}
          {isPick && (
            <div className="px-3 py-2 text-sm text-gray-300">
              {meta.label} 중에서 선택
            </div>
          )}
        </div>

        {/* 그리드 */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 p-2.5 bg-red-900/30 border border-red-800/60 rounded text-xs text-red-300">
              {error}
            </div>
          )}
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              등록된 {meta.short}{meta.isAudio ? '' : ' 이미지'}가 없습니다. 아래에서 업로드하거나 URL을 등록하세요.
            </div>
          ) : meta.isAudio ? (
            // 오디오 카드 레이아웃 — 가로형 카드
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className={`relative rounded-lg bg-gray-800 border p-3 ${
                    isPick ? 'border-gray-700 hover:border-indigo-500 cursor-pointer' : 'border-gray-700'
                  }`}
                  onClick={() => handlePickThumb(it, idx)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-600/95 text-white text-[11px] font-bold leading-none">
                      #{idx}
                    </span>
                    <p className="text-sm text-white flex-1 truncate font-medium" title={it.label || ''}>
                      {it.label || <span className="text-gray-500 italic">(라벨 없음)</span>}
                    </p>
                    {it.external && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-700/80 text-white" title="외부 URL">EXT</span>
                    )}
                  </div>
                  <audio
                    src={it.url}
                    controls
                    preload="none"
                    className="w-full h-9"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {!isPick && (
                    <div className="flex justify-end gap-1.5 mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleLabelEdit(it.id, it.label) }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded"
                        style={{ outline: 'none' }}
                      >
                        라벨
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(it.id) }}
                        className="px-2 py-1 bg-red-600/90 hover:bg-red-500 text-white text-[10px] rounded"
                        style={{ outline: 'none' }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // 이미지/영상 카드 레이아웃 — 9:16
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className={`relative group rounded-lg overflow-hidden bg-gray-800 border ${
                    isPick
                      ? 'border-gray-700 hover:border-indigo-500 cursor-pointer'
                      : 'border-gray-700'
                  } aspect-[9/16]`}
                  onClick={() => handlePickThumb(it, idx)}
                >
                  {(meta.isVideo || isVideoLibraryItem(it)) ? (
                    <video
                      src={it.url}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
                    />
                  ) : (
                    <img src={it.url} alt={it.label || ''} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {(meta.isVideo || isVideoLibraryItem(it)) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none group-hover:opacity-0 transition-opacity">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="white" opacity="0.9"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </div>
                  )}
                  <div
                    className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-indigo-600/95 text-white text-[11px] font-bold leading-none shadow"
                  >
                    #{idx}
                  </div>
                  {it.external && (
                    <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-amber-700/90 text-white text-[9px] leading-none" title="외부 URL">
                      EXT
                    </div>
                  )}
                  {it.label && (
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/85 to-transparent">
                      <p className="text-[11px] text-white line-clamp-2">{it.label}</p>
                    </div>
                  )}
                  {!isPick && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleLabelEdit(it.id, it.label) }}
                        className="px-2 py-1 bg-gray-700/90 hover:bg-gray-600 text-white text-[11px] rounded"
                        style={{ outline: 'none' }}
                      >
                        라벨
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(it.id) }}
                        className="px-2 py-1 bg-red-600/90 hover:bg-red-500 text-white text-[11px] rounded"
                        style={{ outline: 'none' }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 삭제 확인 */}
          {confirmDeleteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirmDeleteId(null)}>
              <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm text-gray-200 mb-2 font-semibold">라이브러리에서 제거할까요?</p>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  이 이미지를 사용 중인 script 아이템은 URL을 그대로 들고 있어 재생에는 영향이 없지만, 라이브러리 목록에서는 사라집니다.
                  Supabase 원본 파일은 보존됩니다.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded"
                    style={{ outline: 'none' }}
                  >
                    취소
                  </button>
                  <button
                    onClick={() => handleDelete(confirmDeleteId)}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded"
                    style={{ outline: 'none' }}
                  >
                    제거
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 업로드 + URL 등록 영역 */}
        <div className="border-t border-gray-700 px-5 py-3 bg-gray-950/50 space-y-2">
          <p className="text-[11px] text-gray-400">
            새 {meta.short} 추가
            <span className="ml-2 text-gray-500">
              (파일 업로드 또는 외부 URL 등록 — {meta.isAudio ? '오디오 파일' : meta.mixedMedia ? '이미지/영상' : meta.isVideo ? '영상' : '이미지'} 드래그&드롭 가능)
            </span>
          </p>
          {/* 파일 업로드 */}
          <div className="flex gap-2 items-center">
            <input
              ref={fileRef}
              type="file"
              accept={meta.accept}
              multiple={!meta.isAudio}
              disabled={uploading}
              onChange={(e) => handleUpload(Array.from(e.target.files || []))}
              className="text-xs text-gray-300 file:mr-2 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-indigo-600 file:text-white file:text-xs hover:file:bg-indigo-500 file:cursor-pointer flex-1"
            />
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="라벨 (선택)"
              maxLength={80}
              disabled={uploading || urlSubmitting}
              className="bg-gray-950 border border-gray-700 rounded p-1.5 text-xs text-gray-200 focus:border-indigo-500 focus:outline-none w-40"
            />
          </div>
          {/* URL 직접 등록 */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSubmit() }}
              placeholder={meta.isAudio ? 'https://....mp3 (외부 호스팅 URL)' : 'https://....jpg (외부 호스팅 URL)'}
              disabled={urlSubmitting || uploading}
              className="bg-gray-950 border border-gray-700 rounded p-1.5 text-xs font-mono text-gray-200 focus:border-indigo-500 focus:outline-none flex-1"
            />
            <button
              onClick={handleUrlSubmit}
              disabled={urlSubmitting || uploading || !urlInput.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded font-semibold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              style={{ outline: 'none' }}
            >
              {urlSubmitting ? '등록 중...' : 'URL 등록'}
            </button>
          </div>
          {(uploading || urlSubmitting) && (
            <p className="text-[11px] text-indigo-300">{uploading ? '업로드 중...' : 'URL 등록 중...'}</p>
          )}
        </div>

        {/* 피커 모드 — 이미지 선택 후 범위 확정 단계 */}
        {pendingPick && pickContext && (
          <RangeConfirmOverlay
            pendingPick={pendingPick}
            pickContext={pickContext}
            kind={activeKind}
            rangeInput={rangeInput}
            setRangeInput={setRangeInput}
            rangeError={rangeError}
            parsedIndices={parseRangeInput(rangeInput, pickContext.scriptLength)}
            onConfirm={confirmPickRange}
            onCancel={() => { setPendingPick(null); setRangeInput(''); setRangeError(null) }}
          />
        )}
      </div>
    </div>
  )
}

// 이미지/오디오 선택 후 적용 인덱스 범위를 받는 오버레이
function RangeConfirmOverlay({ pendingPick, pickContext, kind, rangeInput, setRangeInput, rangeError, parsedIndices, onConfirm, onCancel }) {
  const max = pickContext.scriptLength - 1
  const meta = KIND_META[kind] || KIND_META.background
  return (
    <div
      className="absolute inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {meta.isAudio ? (
            <div className="w-16 h-16 rounded overflow-hidden bg-indigo-900/40 border border-indigo-700/50 flex items-center justify-center flex-shrink-0 text-2xl">
              {kind === 'bgm' ? '🎵' : '🌧️'}
            </div>
          ) : (meta.isVideo || isVideoSrc(pendingPick.url)) ? (
            <div className="w-16 aspect-[9/16] rounded overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0">
              <video src={pendingPick.url} className="w-full h-full object-cover" muted autoPlay loop playsInline />
            </div>
          ) : (
            <div className="w-16 aspect-[9/16] rounded overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0">
              <img src={pendingPick.url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-400 mb-0.5">선택한 {meta.short}</p>
            <p className="text-sm text-white truncate">{pendingPick.label || `#${pendingPick.idx}`}</p>
            <p className="text-[10px] text-indigo-300 mt-1">라이브러리 #{pendingPick.idx}</p>
            {meta.isAudio && (
              <audio src={pendingPick.url} controls preload="none" className="w-full h-7 mt-1.5" />
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-300 mb-1.5 font-medium">
            적용할 script 아이템 인덱스 (0~{max})
          </label>
          <input
            type="text"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onConfirm() }}
            placeholder={`예: 0-${Math.min(max, 5)}, 또는 0,2,5`}
            autoFocus
            className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none font-mono"
          />
          <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
            형식: <code className="text-gray-400">0-10</code> (범위) · <code className="text-gray-400">0,2,5</code> (개별) · <code className="text-gray-400">0-3,5,7-9</code> (혼합)
          </p>
          {parsedIndices.length > 0 && (
            <p className="text-[11px] text-emerald-300 mt-1.5">
              ✓ {parsedIndices.length}개 아이템에 적용:{' '}
              <span className="font-mono text-gray-300">
                [{parsedIndices.length > 12
                  ? `${parsedIndices.slice(0, 8).join(', ')}, ..., ${parsedIndices.slice(-2).join(', ')}`
                  : parsedIndices.join(', ')}]
              </span>
            </p>
          )}
          {rangeError && (
            <p className="text-[11px] text-red-400 mt-1.5">{rangeError}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded"
            style={{ outline: 'none' }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={parsedIndices.length === 0}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ outline: 'none' }}
          >
            {parsedIndices.length > 0 ? `${parsedIndices.length}개에 적용` : '적용'}
          </button>
        </div>
      </div>
    </div>
  )
}

function KindTab({ kind, label, count, active, onClick }) {
  const isActive = active === kind
  return (
    <button
      onClick={() => onClick(kind)}
      className={`px-3 py-2 text-sm transition-colors ${
        isActive ? 'text-white border-b-2 border-indigo-500 font-medium' : 'text-gray-500 hover:text-gray-300'
      }`}
      style={{ outline: 'none' }}
    >
      {label} <span className="text-[10px] text-gray-500 ml-1">({count})</span>
    </button>
  )
}
