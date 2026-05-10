import { useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'

// 키 접두사 → 타입 메타. 그룹 헤더 + 카드 배지에 함께 사용.
const TYPE_GROUPS = [
  { id: 'BG',    label: '배경',           emoji: '🌆', color: 'bg-blue-900/40 text-blue-300',       match: (k) => k.startsWith('BG_') },
  { id: 'CHAR',  label: '캐릭터',         emoji: '🧍', color: 'bg-purple-900/40 text-purple-300',   match: (k) => k.startsWith('CHAR_') },
  { id: 'CG',    label: '컬렉터블',       emoji: '🎞', color: 'bg-pink-900/40 text-pink-300',       match: (k) => k.startsWith('CG_') },
  { id: 'MEDIA', label: '채팅 미디어',    emoji: '🖼', color: 'bg-emerald-900/40 text-emerald-300', match: (k) => k.startsWith('MEDIA_') },
  { id: 'BGM',   label: 'BGM',            emoji: '🎵', color: 'bg-amber-900/40 text-amber-300',     match: (k) => k.startsWith('BGM_') },
  { id: 'BGS',   label: 'BGS (앰비언트)', emoji: '🌧', color: 'bg-orange-900/40 text-orange-300',   match: (k) => k.startsWith('BGS_') },
  { id: 'THUMB', label: '썸네일',         emoji: '📱', color: 'bg-cyan-900/40 text-cyan-300',       match: (k) => k.startsWith('THUMB') },
  { id: 'COVER', label: '커버',           emoji: '📰', color: 'bg-teal-900/40 text-teal-300',       match: (k) => k.startsWith('COVER') },
  { id: 'OTHER', label: '기타',           emoji: '❓', color: 'bg-gray-800 text-gray-400',          match: () => true },
]

function detectType(key) {
  return TYPE_GROUPS.find((g) => g.match(key)) || TYPE_GROUPS[TYPE_GROUPS.length - 1]
}

// URL 확장자 → 미리보기 미디어 타입
function detectMediaType(url) {
  if (!url) return 'image'
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase()
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus'].includes(ext)) return 'audio'
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video'
  return 'image'
}

export default function AssetPromptsTab({ storyline, onAssetUploaded }) {
  const prompts = storyline?.assetPrompts && typeof storyline.assetPrompts === 'object' ? storyline.assetPrompts : null
  const urls = storyline?.assetUrls && typeof storyline.assetUrls === 'object' ? storyline.assetUrls : {}

  // 타입별로 그룹핑 — TYPE_GROUPS 순서를 유지
  const groups = useMemo(() => {
    if (!prompts) return []
    const keys = Object.keys(prompts).sort()
    const used = new Set()
    const result = []
    for (const g of TYPE_GROUPS) {
      const matched = []
      for (const k of keys) {
        if (used.has(k)) continue
        if (g.match(k)) {
          matched.push(k)
          used.add(k)
        }
      }
      if (matched.length > 0) result.push({ ...g, keys: matched })
    }
    return result
  }, [prompts])

  if (!prompts || Object.keys(prompts).length === 0) {
    return (
      <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-lg text-center">
        <p className="text-sm text-gray-400">등록된 자산 프롬프트가 없습니다.</p>
        <p className="text-[11px] text-gray-500 mt-1">
          JSON 탭에서 top-level <code className="text-gray-300">assetPrompts</code> 객체에 키별 프롬프트를 등록하면 카드가 표시됩니다.
        </p>
      </div>
    )
  }

  const totalKeys = Object.keys(prompts).length
  const filled = Object.keys(prompts).filter((k) => typeof urls[k] === 'string' && urls[k]).length

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-300 font-medium">
            자산 프롬프트 — {filled}/{totalKeys} 업로드 완료
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            카드 영역에 파일을 <strong className="text-gray-300">드래그</strong>하거나 버튼으로 업로드 → 같은 키를 참조하는 모든 위치에 자동 적용.
          </p>
        </div>
      </div>

      {groups.map((group) => {
        const groupFilled = group.keys.filter((k) => typeof urls[k] === 'string' && urls[k]).length
        return (
          <section key={group.id} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-base">{group.emoji}</span>
              <h3 className="text-sm font-semibold text-gray-200">{group.label}</h3>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${group.color}`}>{group.id}</span>
              <span className="text-[11px] text-gray-500">
                {groupFilled}/{group.keys.length}
              </span>
              <div className="flex-1 h-px bg-gray-800 ml-1" />
            </div>
            <ul className="space-y-2">
              {group.keys.map((key) => (
                <AssetPromptRow
                  key={key}
                  storylineId={storyline.id}
                  promptKey={key}
                  prompt={prompts[key]}
                  url={urls[key] || null}
                  group={group}
                  onAssetUploaded={onAssetUploaded}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function AssetPromptRow({ storylineId, promptKey, prompt, url, group, onAssetUploaded }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [lastReplacements, setLastReplacements] = useState(null)
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const mediaType = url ? detectMediaType(url) : null
  const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2)
  const truncated = promptText.length > 220 && !showFullPrompt
  const displayPrompt = truncated ? promptText.slice(0, 220) + '…' : promptText

  const uploadFile = async (file) => {
    if (!file) return
    setUploading(true)
    setError(null)
    setLastReplacements(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(`/admin/storylines/${storylineId}/asset-prompts/${promptKey}/upload`, fd)
      setLastReplacements(res.replacements)
      // 응답을 부모로 넘겨 storyline state 부분 패치 — 전체 reload 안 함 (스크롤 유지)
      onAssetUploaded?.(res)
    } catch (err) {
      setError(err?.data?.error || err?.message || '업로드 실패')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragActive) setDragActive(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // 자식으로 이동하는 경우는 무시 — relatedTarget이 컨테이너 안이면 leave 아님
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragActive(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <li
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative bg-gray-900/60 border rounded-lg transition-colors ${
        dragActive
          ? 'border-indigo-500 bg-indigo-900/20'
          : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      {/* 드래그 오버레이 */}
      {dragActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-900/40 backdrop-blur-sm border-2 border-dashed border-indigo-400 rounded-lg pointer-events-none">
          <p className="text-sm font-bold text-indigo-200">
            ⬇ 여기에 놓아서 <code className="font-mono">{promptKey}</code> 업로드
          </p>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 p-3">
        {/* 좌측 — 키 + 프롬프트 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${group.color}`}>{group.id}</span>
            <code className="text-xs text-gray-200 font-mono break-all flex-1">{promptKey}</code>
            {url ? (
              <span className="text-[10px] text-emerald-400 whitespace-nowrap">✓ 업로드됨</span>
            ) : (
              <span className="text-[10px] text-amber-400 whitespace-nowrap">미업로드</span>
            )}
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded p-2">
            <p className="text-[11px] text-gray-300 whitespace-pre-wrap leading-relaxed">{displayPrompt}</p>
            <div className="mt-1.5 flex gap-2">
              {promptText.length > 220 && (
                <button
                  onClick={() => setShowFullPrompt(!showFullPrompt)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                  style={{ outline: 'none' }}
                >
                  {showFullPrompt ? '접기' : '더 보기'}
                </button>
              )}
              <button
                onClick={handleCopyPrompt}
                className="text-[10px] text-gray-500 hover:text-gray-300"
                style={{ outline: 'none' }}
              >
                {copied ? '✓ 복사됨' : '📋 프롬프트 복사'}
              </button>
            </div>
          </div>

          {/* 결과 / 에러 */}
          {lastReplacements != null && (
            <p className="text-[10px] text-emerald-400 mt-1.5">
              ✓ {lastReplacements}곳 치환 완료
            </p>
          )}
          {error && (
            <p className="text-[10px] text-red-400 mt-1.5 break-all">⚠️ {error}</p>
          )}
          {url && (
            <p className="text-[10px] text-gray-500 mt-1.5 break-all">{url}</p>
          )}
        </div>

        {/* 우측 — 미리보기 + 업로드. 오디오는 컴팩트, 그 외(이미지/영상/빈 슬롯)는 9:16 고정 */}
        <div className="md:w-40 flex-shrink-0 flex flex-col gap-2">
          {url && mediaType === 'audio' ? (
            <div className="bg-black/40 rounded border border-gray-800 p-2">
              <audio src={url} controls className="w-full h-9" />
            </div>
          ) : (
            <div className="bg-black/40 rounded overflow-hidden border border-gray-800 aspect-[9/16] flex items-center justify-center">
              {url ? (
                <>
                  {mediaType === 'image' && (
                    <img src={url} alt={promptKey} className="w-full h-full object-cover" />
                  )}
                  {mediaType === 'video' && (
                    <video src={url} controls className="w-full h-full object-cover bg-black" />
                  )}
                </>
              ) : (
                <div className="text-center text-gray-600 text-[11px] px-3">
                  <p className="text-2xl mb-1">⬇</p>
                  <p>파일을 여기에 드롭<br />또는 아래 버튼으로 선택</p>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`px-2 py-1.5 text-xs rounded transition-colors disabled:opacity-50 ${
              url
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
            style={{ outline: 'none' }}
          >
            {uploading ? '업로드 중...' : url ? '🔁 다시 업로드' : '⬆ 파일 선택'}
          </button>
        </div>
      </div>
    </li>
  )
}
