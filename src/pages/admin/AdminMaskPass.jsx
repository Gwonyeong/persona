import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'

const REWARD_TYPES = [
  { value: 'MASK', label: '마스크' },
  { value: 'VOICE', label: '특별 보이스' },
  { value: 'GALLERY', label: '특별 이미지/영상' },
  { value: 'PROFILE', label: '프로필 이미지' },
]

const ACCEPT_BY_TYPE = {
  GALLERY: 'image/*,video/*',
  PROFILE: 'image/*',
}

function FilePicker({ accept, file, currentUrl, onPick, label }) {
  const ref = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const isImg = currentUrl && /\.(png|jpe?g|webp|gif)$/i.test(currentUrl)
  const isVid = currentUrl && /\.(mp4|webm|mov)$/i.test(currentUrl)
  const isAudio = currentUrl && /\.(mp3|wav|m4a|ogg|aac)$/i.test(currentUrl)

  // accept 문자열을 mime/확장자 패턴으로 단순 검증
  function isAllowed(f) {
    if (!accept) return true
    return accept.split(',').some((token) => {
      const t = token.trim()
      if (!t) return false
      if (t.endsWith('/*')) return f.type.startsWith(t.slice(0, -1))
      if (t.startsWith('.')) return f.name.toLowerCase().endsWith(t.toLowerCase())
      return f.type === t
    })
  }

  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const dropped = [...e.dataTransfer.files].find(isAllowed)
          if (dropped) onPick(dropped)
        }}
        onClick={() => ref.current?.click()}
        className={`mt-1 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          dragOver ? 'border-amber-400 bg-amber-950/20' : 'border-gray-700 hover:border-gray-600'
        }`}
      >
        <p className="text-xs text-gray-400 text-center">
          {file ? file.name : currentUrl ? '기존 파일 (드래그/클릭 시 교체)' : '드래그하거나 클릭해서 파일 선택'}
        </p>
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] || null)}
      />
      {/* 미리보기 */}
      {(file || currentUrl) && (
        <div className="mt-2">
          {file?.type?.startsWith('image/') && (
            <img src={URL.createObjectURL(file)} alt="" className="max-h-32 rounded border border-gray-800" />
          )}
          {!file && isImg && <img src={currentUrl} alt="" className="max-h-32 rounded border border-gray-800" />}
          {file?.type?.startsWith('video/') && (
            <video src={URL.createObjectURL(file)} controls className="max-h-32 rounded border border-gray-800" />
          )}
          {!file && isVid && <video src={currentUrl} controls className="max-h-32 rounded border border-gray-800" />}
          {file?.type?.startsWith('audio/') && (
            <audio src={URL.createObjectURL(file)} controls className="w-full mt-1" />
          )}
          {!file && isAudio && <audio src={currentUrl} controls className="w-full mt-1" />}
        </div>
      )}
    </div>
  )
}

function CharacterPicker({ characters, value, onChange, requireVoiceId = false }) {
  // 공개(isPublic) 캐릭터만 노출 — 프로필/특별 이미지/보이스 보상 대상 선택용
  const [query, setQuery] = useState('')
  const publicCharacters = characters.filter((c) => c.isPublic)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? publicCharacters.filter((c) => (c.name || '').toLowerCase().includes(q))
    : publicCharacters

  return (
    <div className="mt-1">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름으로 검색"
        className="w-full px-3 py-2 mb-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
      />
      <div className="max-h-64 overflow-y-auto flex flex-wrap gap-3 p-2 bg-gray-950 border border-gray-700 rounded-lg">
        {filtered.length === 0 && (
          <p className="w-full text-xs text-gray-500 text-center py-4">
            {publicCharacters.length === 0 ? '공개된 캐릭터가 없어요' : '검색 결과가 없어요'}
          </p>
        )}
        {filtered.map((c) => {
          const selected = String(value) === String(c.id)
          const disabled = requireVoiceId && !c.voiceId
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(c.id)}
              title={`#${c.id} ${c.name}${disabled ? ' (voiceId 없음)' : ''}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              className={`flex flex-col items-center gap-1 w-16 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div
                className={`relative w-14 h-14 rounded-full overflow-hidden border-2 transition-colors ${
                  selected ? 'border-amber-400' : 'border-transparent hover:border-gray-600'
                }`}
              >
                {c.profileImage ? (
                  <img src={c.profileImage} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-600 text-[10px]">
                    No img
                  </div>
                )}
                {selected && (
                  <div className="absolute inset-0 bg-amber-400/20 flex items-center justify-center">
                    <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-[11px] text-gray-900 font-bold">
                      ✓
                    </span>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-gray-300 truncate w-full text-center">{c.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TierForm({ initial, characters, onSubmit, onCancel, busy, onTranslationsUpdated }) {
  const [threshold, setThreshold] = useState(initial?.threshold ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [rewardType, setRewardType] = useState(initial?.rewardType || 'MASK')
  // translations 패널 — 어드민이 자동 번역 결과 확인/수정 (기존 tier에만 노출)
  const [trEn, setTrEn] = useState(initial?.translations?.en?.title || '')
  const [trJa, setTrJa] = useState(initial?.translations?.ja?.title || '')
  const [trSaving, setTrSaving] = useState(false)
  const [retranslating, setRetranslating] = useState(false)

  // 타입별 필드
  const payload = initial?.rewardPayload || {}
  const [amount, setAmount] = useState(payload.amount || '')
  const [rewardTitle, setRewardTitle] = useState(payload.title || payload.preview?.title || '')
  // 보상 제목 다국어 (GALLERY/PROFILE). 서버 preview.titleEn/Ja 로 프리필.
  const [rewardTitleEn, setRewardTitleEn] = useState(payload.preview?.titleEn || '')
  const [rewardTitleJa, setRewardTitleJa] = useState(payload.preview?.titleJa || '')
  const [rewardDescription, setRewardDescription] = useState(initial?.rewardPayload?.preview?.description || '')
  const [characterId, setCharacterId] = useState(
    payload.characterId || payload.preview?.character?.id || '',
  )
  const [voiceText, setVoiceText] = useState(payload.text || '')
  const [file, setFile] = useState(null)
  // GALLERY 다중 파일
  const [galleryFiles, setGalleryFiles] = useState([]) // 새로 추가할 파일들
  const [deleteImageIds, setDeleteImageIds] = useState([]) // 삭제 대상 기존 이미지 id
  const [dragOver, setDragOver] = useState(false)
  const galleryFileRef = useRef(null)
  const existingGalleryImages = payload.preview?.images || []
  // 클레임 조건 (AND)
  const [requirePurchase, setRequirePurchase] = useState(!!initial?.requirePurchase)
  const [requireAdultVerified, setRequireAdultVerified] = useState(!!initial?.requireAdultVerified)

  const currentUrl =
    rewardType === 'VOICE'
      ? payload.audioUrl
      : rewardType === 'GALLERY'
        ? payload.preview?.thumbnailUrl
        : rewardType === 'PROFILE'
          ? payload.preview?.imageUrl
          : null

  function submit() {
    if (!Number.isFinite(parseInt(threshold, 10))) {
      alert('임계치를 입력해주세요')
      return
    }
    const fd = new FormData()
    fd.append('threshold', String(parseInt(threshold, 10)))
    fd.append('title', title || '')
    fd.append('rewardType', rewardType)
    fd.append('requirePurchase', String(requirePurchase))
    fd.append('requireAdultVerified', String(requireAdultVerified))
    if (rewardType === 'MASK') {
      if (!amount || parseInt(amount, 10) <= 0) {
        alert('지급할 마스크 수량을 입력해주세요')
        return
      }
      fd.append('amount', String(parseInt(amount, 10)))
    } else if (rewardType === 'VOICE') {
      if (!characterId) {
        alert('캐릭터를 선택해주세요')
        return
      }
      if (!voiceText.trim()) {
        alert('대사를 입력해주세요')
        return
      }
      fd.append('characterId', String(characterId))
      fd.append('text', voiceText.trim())
      fd.append('rewardTitle', rewardTitle || '')
    } else if (rewardType === 'GALLERY') {
      if (!characterId) {
        alert('캐릭터를 선택해주세요')
        return
      }
      const remainingExisting = existingGalleryImages.filter((img) => !deleteImageIds.includes(img.id))
      const totalAfter = remainingExisting.length + galleryFiles.length
      if (totalAfter === 0) {
        alert('최소 1개 파일이 필요합니다')
        return
      }
      fd.append('characterId', String(characterId))
      fd.append('rewardTitle', rewardTitle || '')
      fd.append('rewardTitleEn', rewardTitleEn || '')
      fd.append('rewardTitleJa', rewardTitleJa || '')
      fd.append('rewardDescription', rewardDescription || '')
      if (deleteImageIds.length) fd.append('deleteImageIds', deleteImageIds.join(','))
      for (const f of galleryFiles) fd.append('files', f)
    } else if (rewardType === 'PROFILE') {
      if (!characterId) {
        alert('캐릭터를 선택해주세요')
        return
      }
      if (file) fd.append('file', file)
      else if (!currentUrl) {
        alert('프로필 이미지를 선택해주세요')
        return
      }
      fd.append('characterId', String(characterId))
      fd.append('rewardTitle', rewardTitle || '')
      fd.append('rewardTitleEn', rewardTitleEn || '')
      fd.append('rewardTitleJa', rewardTitleJa || '')
    }
    onSubmit(fd)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-400">임계치 (누적 마스크 사용)</span>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">라벨 (선택)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
          />
        </label>
      </div>

      {/* 자동 번역 미리보기 + 수정 — 기존 tier에만 노출 */}
      {initial?.id && title && (
        <div className="border border-gray-700 rounded-lg p-3 bg-gray-800/30">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-semibold text-gray-200">🌐 라벨 다국어 번역 (Gemini 자동)</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                유저에게는 user.language로 자동 픽됩니다. 직접 수정 가능.
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!confirm('한국어 원문으로 다시 번역합니다. 기존 수정 내용이 덮어쓰입니다. 계속할까요?')) return
                setRetranslating(true)
                try {
                  const { api } = await import('../../lib/api')
                  const { tier } = await api.post(`/admin/mask-pass-tiers/${initial.id}/retranslate`)
                  setTrEn(tier.translations?.en?.title || '')
                  setTrJa(tier.translations?.ja?.title || '')
                  if (onTranslationsUpdated) onTranslationsUpdated(tier)
                } catch (e) {
                  alert('재번역 실패: ' + (e.message || ''))
                } finally {
                  setRetranslating(false)
                }
              }}
              disabled={retranslating || trSaving}
              className="text-[11px] px-2 py-1 bg-amber-700/50 hover:bg-amber-700 text-amber-100 rounded disabled:opacity-50"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {retranslating ? '번역 중...' : '🔄 다시 번역'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">English</span>
              <input
                value={trEn}
                onChange={(e) => setTrEn(e.target.value)}
                placeholder="(자동 번역됨)"
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">日本語</span>
              <input
                value={trJa}
                onChange={(e) => setTrJa(e.target.value)}
                placeholder="(자동 번역됨)"
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={async () => {
              setTrSaving(true)
              try {
                const { api } = await import('../../lib/api')
                const { tier } = await api.put(`/admin/mask-pass-tiers/${initial.id}/translations`, {
                  translations: {
                    en: { title: trEn },
                    ja: { title: trJa },
                  },
                })
                if (onTranslationsUpdated) onTranslationsUpdated(tier)
                alert('번역 저장 완료')
              } catch (e) {
                alert('번역 저장 실패: ' + (e.message || ''))
              } finally {
                setTrSaving(false)
              }
            }}
            disabled={trSaving || retranslating}
            className="mt-3 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {trSaving ? '저장 중...' : '✏️ 번역 수정안 저장'}
          </button>
        </div>
      )}

      <label className="block">
        <span className="text-xs text-gray-400">보상 타입</span>
        <select
          value={rewardType}
          onChange={(e) => {
            setRewardType(e.target.value)
            setFile(null) // 타입 바꿀 때 파일 초기화
          }}
          className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
        >
          {REWARD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      {/* 클레임 조건 (모두 AND) */}
      <div className="p-3 bg-gray-950/50 rounded-lg border border-gray-800">
        <p className="text-xs text-gray-400 mb-2">클레임 조건 (선택 — 모두 만족해야 받기 가능)</p>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={requirePurchase}
            onChange={(e) => setRequirePurchase(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-sm text-gray-200">마스크 구매 이력 1회 이상</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={requireAdultVerified}
            onChange={(e) => setRequireAdultVerified(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-sm text-gray-200">성인인증 완료</span>
        </label>
      </div>

      {/* 타입별 폼 */}
      <div className="p-3 bg-gray-950/50 rounded-lg border border-gray-800 space-y-3">
        {rewardType === 'MASK' && (
          <label className="block">
            <span className="text-xs text-gray-400">지급 마스크 수량</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5"
              className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
            />
          </label>
        )}

        {rewardType === 'VOICE' && (
          <>
            <div>
              <span className="text-xs text-gray-400">대상 캐릭터 (해당 캐릭터의 voiceId로 합성)</span>
              <CharacterPicker
                characters={characters}
                value={characterId}
                onChange={setCharacterId}
                requireVoiceId
              />
            </div>
            <label className="block">
              <span className="text-xs text-gray-400">대사 (저장 시 ElevenLabs로 합성, 최대 300자)</span>
              <textarea
                rows={3}
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                maxLength={300}
                placeholder="이 대사로 음성이 생성돼요"
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
              />
              <span className="text-[10px] text-gray-500">{voiceText.length}/300</span>
            </label>
            {currentUrl && (
              <div>
                <span className="text-xs text-gray-400">현재 음성 (대사 바꾸지 않으면 재생성 안 함)</span>
                <audio src={currentUrl} controls className="w-full mt-1" />
              </div>
            )}
            <label className="block">
              <span className="text-xs text-gray-400">보상 제목 (선택)</span>
              <input
                type="text"
                value={rewardTitle}
                onChange={(e) => setRewardTitle(e.target.value)}
                placeholder="예: 캐릭터의 비밀 한마디"
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
              />
            </label>
          </>
        )}

        {rewardType === 'PROFILE' && (
          <>
            <div>
              <span className="text-xs text-gray-400">대상 캐릭터</span>
              <CharacterPicker characters={characters} value={characterId} onChange={setCharacterId} />
            </div>
            <FilePicker
              accept={ACCEPT_BY_TYPE.PROFILE}
              file={file}
              currentUrl={currentUrl}
              onPick={setFile}
              label="프로필 이미지"
            />
            <label className="block">
              <span className="text-xs text-gray-400">보상 제목</span>
              <input
                type="text"
                value={rewardTitle}
                onChange={(e) => setRewardTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-gray-500">제목 (EN)</span>
                <input
                  type="text"
                  value={rewardTitleEn}
                  onChange={(e) => setRewardTitleEn(e.target.value)}
                  placeholder="English title"
                  className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">제목 (JA)</span>
                <input
                  type="text"
                  value={rewardTitleJa}
                  onChange={(e) => setRewardTitleJa(e.target.value)}
                  placeholder="日本語タイトル"
                  className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
                />
              </label>
            </div>
          </>
        )}

        {rewardType === 'GALLERY' && (
          <>
            <div>
              <span className="text-xs text-gray-400">대상 캐릭터</span>
              <CharacterPicker characters={characters} value={characterId} onChange={setCharacterId} />
            </div>

            {/* 기존 이미지 + 새 파일 통합 그리드 */}
            {(existingGalleryImages.length > 0 || galleryFiles.length > 0) && (
              <div>
                <span className="text-xs text-gray-400">미디어 (기존 + 신규)</span>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {existingGalleryImages.map((img) => {
                    const markedDelete = deleteImageIds.includes(img.id)
                    const isVid = /\.(mp4|webm|mov)$/i.test(img.url)
                    return (
                      <div key={`ex-${img.id}`} className={`relative aspect-square rounded-lg overflow-hidden border ${markedDelete ? 'border-red-500 opacity-40' : 'border-gray-700'}`}>
                        {isVid ? (
                          <video src={img.url} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={img.url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteImageIds((prev) =>
                              markedDelete ? prev.filter((id) => id !== img.id) : [...prev, img.id],
                            )
                          }
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          title={markedDelete ? '삭제 취소' : '삭제'}
                        >
                          {markedDelete ? '↺' : '×'}
                        </button>
                      </div>
                    )
                  })}
                  {galleryFiles.map((f, idx) => {
                    const url = URL.createObjectURL(f)
                    const isVid = f.type.startsWith('video/')
                    return (
                      <div key={`new-${idx}`} className="relative aspect-square rounded-lg overflow-hidden border-2 border-amber-500/60">
                        {isVid ? (
                          <video src={url} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        )}
                        <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-amber-500 text-gray-950 font-bold py-0.5">신규</span>
                        <button
                          type="button"
                          onClick={() => setGalleryFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 드래그앤드랍 영역 */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const dropped = [...e.dataTransfer.files].filter(
                  (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
                )
                setGalleryFiles((prev) => [...prev, ...dropped])
              }}
              onClick={() => galleryFileRef.current?.click()}
              className={`p-5 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
                dragOver ? 'border-amber-400 bg-amber-950/20' : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <input
                ref={galleryFileRef}
                type="file"
                accept={ACCEPT_BY_TYPE.GALLERY}
                multiple
                className="hidden"
                onChange={(e) =>
                  setGalleryFiles((prev) => [...prev, ...[...e.target.files]])
                }
              />
              <p className="text-xs text-gray-400">
                이미지 또는 영상을 드래그하거나 클릭해서 추가 (여러 장 가능)
              </p>
            </div>

            <label className="block">
              <span className="text-xs text-gray-400">보상 제목</span>
              <input
                type="text"
                value={rewardTitle}
                onChange={(e) => setRewardTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-gray-500">제목 (EN)</span>
                <input
                  type="text"
                  value={rewardTitleEn}
                  onChange={(e) => setRewardTitleEn(e.target.value)}
                  placeholder="English title"
                  className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">제목 (JA)</span>
                <input
                  type="text"
                  value={rewardTitleJa}
                  onChange={(e) => setRewardTitleJa(e.target.value)}
                  placeholder="日本語タイトル"
                  className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-gray-400">설명 (선택)</span>
              <textarea
                rows={2}
                value={rewardDescription}
                onChange={(e) => setRewardDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm"
              />
            </label>
          </>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-2 text-xs text-gray-300 bg-gray-800 rounded-lg"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-3 py-2 text-xs font-bold text-gray-950 bg-amber-500 rounded-lg disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {busy ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

export default function AdminMaskPass() {
  const [tiers, setTiers] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [tiersRes, charsRes] = await Promise.all([
        api.get('/admin/mask-pass-tiers'),
        api.get('/admin/characters'),
      ])
      setTiers(tiersRes.tiers || [])
      setCharacters(charsRes.characters || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // tier list에 preview 정보를 부착 (어드민 UI는 maskPass.js의 enrichTierPayloads를 안 거쳐서 raw payload만 옴)
  // 간단한 lookup으로 character name 정도만 보강
  const sortedTiers = useMemo(() => {
    return [...tiers].sort((a, b) => a.threshold - b.threshold || a.id - b.id)
  }, [tiers])

  async function save(fd) {
    setBusy(true)
    try {
      if (editing === 'new') {
        await api.post('/admin/mask-pass-tiers', fd)
      } else if (editing?.id) {
        await api.put(`/admin/mask-pass-tiers/${editing.id}`, fd)
      }
      setEditing(null)
      await load()
    } catch (e) {
      alert(e.data?.error || '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  async function remove(tier) {
    if (!confirm(`임계치 ${tier.threshold} 티어 삭제? 클레임이 있으면 삭제 안 됨.`)) return
    try {
      await api.delete(`/admin/mask-pass-tiers/${tier.id}`)
      await load()
    } catch (e) {
      alert(e.data?.error || '삭제 실패')
    }
  }

  function rewardSummary(t) {
    const preview = t.rewardPayload?.preview
    const charName = preview?.character?.name
    if (t.rewardType === 'MASK') return `마스크 ${t.rewardPayload?.amount || 0}개`
    if (t.rewardType === 'VOICE') return `🎵 ${charName || '?'} — ${t.rewardPayload?.title || t.rewardPayload?.text?.slice(0, 20) || '음성'}`
    if (t.rewardType === 'GALLERY') return `🖼 ${charName || '?'} 갤러리 ${preview?.count ? `(${preview.count}장)` : ''}`
    if (t.rewardType === 'PROFILE') return `👤 ${charName || '?'} 프로필`
    return t.rewardType
  }

  function isVideoUrl(url) {
    return !!url && /\.(mp4|webm|mov)$/i.test(url)
  }
  function isImageUrl(url) {
    return !!url && /\.(png|jpe?g|webp|gif)$/i.test(url)
  }

  function RewardPreview({ tier }) {
    const payload = tier.rewardPayload || {}
    const preview = payload.preview || {}
    if (tier.rewardType === 'VOICE' && payload.audioUrl) {
      return <audio src={payload.audioUrl} controls className="w-full max-w-xs mt-2" />
    }
    if (tier.rewardType === 'PROFILE' && preview.imageUrl) {
      return (
        <img
          src={preview.imageUrl}
          alt=""
          className="mt-2 max-h-28 rounded border border-gray-800"
        />
      )
    }
    if (tier.rewardType === 'GALLERY') {
      const items = Array.isArray(preview.images) && preview.images.length > 0
        ? preview.images
        : preview.thumbnailUrl
          ? [{ id: 'thumb', url: preview.thumbnailUrl }]
          : []
      if (items.length === 0) return null
      return (
        <div className="mt-2 flex gap-1.5 flex-wrap">
          {items.slice(0, 6).map((img) => {
            const url = img.url || img.imageUrl || img.thumbnailUrl
            if (!url) return null
            return isVideoUrl(url) ? (
              <video
                key={img.id || url}
                src={url}
                controls
                muted
                className="h-20 w-20 object-cover rounded border border-gray-800 bg-black"
              />
            ) : isImageUrl(url) ? (
              <img
                key={img.id || url}
                src={url}
                alt=""
                className="h-20 w-20 object-cover rounded border border-gray-800"
              />
            ) : null
          })}
          {items.length > 6 && (
            <div className="h-20 w-20 flex items-center justify-center rounded border border-gray-800 bg-gray-950 text-xs text-gray-400">
              +{items.length - 6}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">마스크 패스 — 티어 관리</h1>
        <button
          onClick={() => setEditing('new')}
          className="px-3 py-2 text-xs font-bold bg-amber-500 text-gray-950 rounded-lg"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 티어 추가
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        정렬은 항상 임계치 오름차순입니다. 보상 타입을 선택하면 해당 타입에 맞는 파일·필드가 나타납니다.
      </p>

      {editing === 'new' && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-2">새 티어</p>
          <TierForm characters={characters} onSubmit={save} onCancel={() => setEditing(null)} busy={busy} />
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">불러오는 중...</p>}

      <div className="space-y-2">
        {sortedTiers.map((t) => (
          <div key={t.id}>
            {editing?.id === t.id ? (
              <TierForm initial={t} characters={characters} onSubmit={save} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <div className="flex items-start gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl">
                <div className="w-16 text-center flex-shrink-0">
                  <p className="text-base font-bold text-gray-100">{t.threshold.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">마스크</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-100">
                    <span className="text-xs text-amber-400 mr-2">{t.rewardType}</span>
                    {rewardSummary(t)}
                  </p>
                  {t.title && <p className="text-xs text-gray-500">{t.title}</p>}
                  {(t.requirePurchase || t.requireAdultVerified) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.requirePurchase && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">
                          🛒 마스크 1회 이상 구매 필요
                        </span>
                      )}
                      {t.requireAdultVerified && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/40">
                          🔞 성인인증 필요
                        </span>
                      )}
                    </div>
                  )}
                  <RewardPreview tier={t} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">클레임 {t._count?.claims || 0}</p>
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => setEditing(t)}
                      className="px-2 py-1 text-[10px] bg-gray-800 rounded"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove(t)}
                      className="px-2 py-1 text-[10px] bg-red-900/40 text-red-300 rounded"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
