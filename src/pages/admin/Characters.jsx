import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

function TagSelector({ tags, onChange }) {
  const [categories, setCategories] = useState([])
  const selectedTags = new Set(tags)

  useEffect(() => {
    api.get('/characters/tags').then(({ categories }) => setCategories(categories)).catch(() => {})
  }, [])

  const toggle = useCallback((value) => {
    const next = new Set(selectedTags)
    if (next.has(value)) {
      next.delete(value)
    } else {
      // 같은 카테고리의 단일 선택 (age, nationality, imageType)
      const prefix = value.split(':')[0]
      if (['age', 'nationality', 'imageType'].includes(prefix)) {
        for (const t of next) {
          if (t.startsWith(prefix + ':')) next.delete(t)
        }
      }
      next.add(value)
    }
    onChange([...next])
  }, [tags])

  if (categories.length === 0) return null

  return (
    <div className="space-y-3">
      {categories.map((cat) => (
        <div key={cat.key}>
          <p className="text-xs text-gray-500 mb-1.5">{cat.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {cat.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedTags.has(opt.value)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const V2_PLACEHOLDER = `{
  "blocks": [
    { "type": "narration", "text": "비 내리는 오후, 카페 창가에 앉은 그녀는..." },
    { "type": "image", "url": "https://..." },
    { "type": "message", "text": "어, 왔구나? 《살짝 미소》", "emotion": "HAPPY", "audioUrl": "" }
  ]
}`

const V2_LANGS = [
  { key: 'ko', label: '한국어 (기본)' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
]

const EMPTY_FORM = {
  name: '',
  description: '',
  concept: '',
  personality: '',
  promptDataV1Text: '',  // V1 채팅 MR 소스 (JSON 문자열로 편집)
  firstMessage: '',
  firstMessageV2Text: { ko: '', en: '', ja: '' },
  firstMessageV2Draft: false,
  translations: null,  // 서버 원본 보존 (V2 외 필드 유지용)
  tags: [],
  customTags: '',
  initialAffinity: 0,
  voiceId: '',
  isPublic: false,
  proactiveEnabled: false,
  proactiveMinInterval: 60,   // 분 단위로 표시
  proactiveMaxInterval: 240,  // 분 단위로 표시
  proactiveProbability: 50,   // % 단위로 표시
  proactiveMaxCount: 3,
}

function formatRelativeKst(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 0) {
    const abs = Math.abs(diffMin)
    if (abs < 60) return `${abs}분 후`
    if (abs < 60 * 24) return `${Math.floor(abs / 60)}시간 후`
    return `${Math.floor(abs / 60 / 24)}일 후`
  }
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}시간 전`
  return `${Math.floor(diffMin / 60 / 24)}일 전`
}

function formatKstDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return fmt.format(d)
}

// UTC ISO → datetime-local 입력값 (KST 기준)
function toDatetimeLocalKst(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000
  return new Date(kstMs).toISOString().slice(0, 16)
}

// datetime-local 값 (KST로 입력됨) → UTC ISO
function fromDatetimeLocalKst(value) {
  if (!value) return null
  const parsed = new Date(value + ':00+09:00')
  if (isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function NotifyCharacterModal({ character, onClose, onSent }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkPath, setLinkPath] = useState(`/characters/${character.id}`)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [peak, setPeak] = useState(null)
  const [scheduledOverride, setScheduledOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState({ broadcasts: [], notifications: [] })

  useEffect(() => {
    api.get(`/admin/characters/${character.id}/peak-chat-hour`)
      .then(setPeak)
      .catch(() => {})
    api.get(`/admin/characters/${character.id}/notifications`)
      .then(setHistory)
      .catch(() => {})
  }, [character.id])

  const handleFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) return
    setImageFile(file)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview('')
  }

  const effectiveScheduledIso = scheduledOverride
    ? fromDatetimeLocalKst(scheduledOverride)
    : peak?.scheduledAt || null

  const submit = async () => {
    if (!title.trim()) { alert('제목을 입력하세요'); return }
    if (!body.trim()) { alert('본문을 입력하세요'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('body', body.trim())
      fd.append('linkPath', linkPath.trim())
      if (effectiveScheduledIso) fd.append('scheduledAt', effectiveScheduledIso)
      if (imageFile) fd.append('image', imageFile)
      await api.post(`/admin/characters/${character.id}/notify`, fd)
      alert('알림이 예약되었습니다 (인앱은 즉시 발행, 푸시는 예약 시각에 발송)')
      onSent?.()
    } catch (e) {
      alert(`발송 실패: ${e?.message || 'unknown'}`)
    } finally {
      setBusy(false)
    }
  }

  const maxCount = peak ? Math.max(1, ...peak.distribution) : 1
  const hourMin = peak?.hourWindow?.min ?? 9
  const hourMax = peak?.hourWindow?.max ?? 22

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            푸시·인앱 알림 추가
            <span className="ml-2 text-sm text-gray-400 font-normal">{character.name}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-sm"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >닫기</button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">제목 ({title.length}/100)</label>
            <input
              type="text"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`예) ${character.name}가 새 소식을 들고 왔어요`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">본문 ({body.length}/2000)</label>
            <textarea
              value={body}
              maxLength={2000}
              rows={4}
              onChange={(e) => setBody(e.target.value)}
              placeholder="알림 본문을 입력하세요"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">링크 경로</label>
            <input
              type="text"
              value={linkPath}
              onChange={(e) => setLinkPath(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            />
          </div>
        </div>

        <div
          className={`mb-4 p-3 rounded-lg border-2 border-dashed transition-colors ${
            dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700'
          }`}
          onDragEnter={(e) => {
            if (!e.dataTransfer?.types?.includes('Files')) return
            e.preventDefault(); setDragOver(true)
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer?.types?.includes('Files')) return
            e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return
            setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFile(file)
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">이미지</div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1.5">이미지 (선택) — 드래그앤드랍 가능</p>
              <div className="flex gap-2">
                <label
                  className="px-3 py-1.5 text-xs rounded-lg cursor-pointer bg-indigo-600 text-white hover:bg-indigo-500"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  파일 선택
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files[0]) handleFile(e.target.files[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                {imageFile && (
                  <button
                    onClick={clearImage}
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-red-400 hover:text-red-300 border border-gray-700"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >제거</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-gray-950 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">
              활발 시간대 (최근 {peak?.windowDays ?? '...'}일, KST {hourMin}~{hourMax}시 윈도우)
            </p>
            {peak && (
              <p className="text-xs text-gray-500">
                샘플 {peak.sampleSize.toLocaleString()}건 · 피크 {peak.peakHour}시
              </p>
            )}
          </div>
          {peak ? (
            <div className="flex items-end gap-0.5 h-16 mb-2">
              {peak.distribution.map((count, h) => {
                const heightPct = (count / maxCount) * 100
                const inWindow = h >= hourMin && h <= hourMax
                const isPeak = h === peak.peakHour
                return (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end" title={`${h}시: ${count}건`}>
                    <div
                      className={`w-full rounded-t ${isPeak ? 'bg-indigo-500' : inWindow ? 'bg-gray-600' : 'bg-gray-800'}`}
                      style={{ height: `${heightPct}%`, minHeight: count > 0 ? 2 : 1 }}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-600 py-4 text-center">분석 중...</p>
          )}
          <div>
            <label className="text-xs text-gray-400 block mb-1">예약 시각 (KST)</label>
            <input
              type="datetime-local"
              value={scheduledOverride || (peak ? toDatetimeLocalKst(peak.scheduledAt) : '')}
              onChange={(e) => setScheduledOverride(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            />
            {effectiveScheduledIso && (
              <p className="text-xs text-gray-500 mt-1">
                → {formatKstDateTime(effectiveScheduledIso)} · {formatRelativeKst(effectiveScheduledIso)}
              </p>
            )}
          </div>
        </div>

        {(history.broadcasts.length > 0 || history.notifications.length > 0) && (
          <div className="mb-4 p-3 rounded-lg bg-gray-950 border border-gray-800">
            <p className="text-xs text-gray-400 mb-2">
              이 캐릭터의 알림 기록 (푸시 {history.broadcasts.length} · 인앱 {history.notifications.length})
            </p>
            <div className="space-y-1.5 max-h-40 overflow-auto">
              {history.broadcasts.map((b) => (
                <div key={`b-${b.id}`} className="text-xs flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    b.status === 'SENT' ? 'bg-green-900 text-green-300'
                      : b.status === 'PENDING' ? 'bg-yellow-900 text-yellow-300'
                      : b.status === 'FAILED' ? 'bg-red-900 text-red-300'
                      : 'bg-gray-800 text-gray-400'
                  }`}>{b.status}</span>
                  <span className="text-gray-300 truncate flex-1">{b.title}</span>
                  <span className="text-gray-500 flex-shrink-0">{formatKstDateTime(b.scheduledAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >취소</button>
          <button
            onClick={submit}
            disabled={busy || !peak}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >{busy ? '발송 중...' : '예약 발송'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Characters() {
  const [characters, setCharacters] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | character object
  const [notifyTarget, setNotifyTarget] = useState(null) // null | character object
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  const [tab, setTab] = useState('public') // 'public' | 'private'
  const [v2Lang, setV2Lang] = useState('ko')
  const [v2Busy, setV2Busy] = useState({ image: false, voice: false, translate: false, generate: false })
  const [v2DragOverIdx, setV2DragOverIdx] = useState(null)
  // 음성 샘플 (캐릭터 상세 페이지 버블) — character.voiceSamples Json 컬럼에 저장됨. PUT /characters와 별개 엔드포인트.
  const [voiceSamples, setVoiceSamples] = useState({ normal: { text: '', audioUrl: '' }, aroused: { text: '', audioUrl: '' } })
  // busy[kind] = null | 'text' | 'save' | 'tts'
  const [voiceSampleBusy, setVoiceSampleBusy] = useState({ normal: null, aroused: null })
  const [nationality, setNationality] = useState('all') // 'all' | 'kr' | 'jp' | 'us'
  const [sortBy, setSortBy] = useState('conversations') // 'name' | 'conversations' | 'nationality'
  const navigate = useNavigate()

  const NATIONALITY_TABS = [
    { key: 'all', label: '전체' },
    { key: 'kr', label: '🇰🇷' },
    { key: 'jp', label: '🇯🇵' },
    { key: 'us', label: '🇺🇸' },
  ]
  const NATIONALITY_ORDER = ['kr', 'jp', 'us']

  const getNationality = (c) => {
    const tag = (c.tags || []).find((t) => t.startsWith('nationality:'))
    return tag ? tag.split(':')[1] : null
  }

  // 같은 voiceId를 쓰는 캐릭터가 둘 이상이면 중복 표시
  const duplicateVoiceIds = (() => {
    const counts = new Map()
    for (const c of characters) {
      const v = (c.voiceId || '').trim()
      if (!v) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([v]) => v))
  })()

  const filteredCharacters = characters
    .filter((c) => (tab === 'public' ? c.isPublic : !c.isPublic))
    .filter((c) => (nationality === 'all' ? true : getNationality(c) === nationality))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'recentConversations') {
        return (b.recentConversations7d || 0) - (a.recentConversations7d || 0)
      }
      if (sortBy === 'conversations') {
        return (b._count?.conversations || 0) - (a._count?.conversations || 0)
      }
      if (sortBy === 'nationality') {
        const ai = NATIONALITY_ORDER.indexOf(getNationality(a))
        const bi = NATIONALITY_ORDER.indexOf(getNationality(b))
        const ax = ai === -1 ? NATIONALITY_ORDER.length : ai
        const bx = bi === -1 ? NATIONALITY_ORDER.length : bi
        if (ax !== bx) return ax - bx
        return a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })

  const load = () => {
    api.get('/admin/characters').then(({ characters }) => setCharacters(characters))
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setForm({ ...EMPTY_FORM, firstMessageV2Text: { ko: '', en: '', ja: '' } })
    setV2Lang('ko')
    setV2Busy({ image: false, voice: false, translate: false, generate: false })
    setVoiceSamples({ normal: { text: '', audioUrl: '' }, aroused: { text: '', audioUrl: '' } })
    setVoiceSampleBusy({ normal: null, aroused: null })
    setEditing('new')
  }

  const openEdit = (c) => {
    const v2Text = { ko: '', en: '', ja: '' }
    if (c.firstMessageV2) {
      try { v2Text.ko = JSON.stringify(c.firstMessageV2, null, 2) } catch { /* keep '' */ }
    }
    if (c.translations?.en?.firstMessageV2) {
      try { v2Text.en = JSON.stringify(c.translations.en.firstMessageV2, null, 2) } catch { /* keep '' */ }
    }
    if (c.translations?.ja?.firstMessageV2) {
      try { v2Text.ja = JSON.stringify(c.translations.ja.firstMessageV2, null, 2) } catch { /* keep '' */ }
    }
    let promptDataV1Text = ''
    if (c.promptDataV1) {
      try { promptDataV1Text = JSON.stringify(c.promptDataV1, null, 2) } catch { /* keep '' */ }
    }
    setForm({
      name: c.name,
      description: c.description,
      concept: c.concept || '',
      personality: c.personality,
      promptDataV1Text,
      firstMessage: c.firstMessage,
      firstMessageV2Text: v2Text,
      firstMessageV2Draft: !!c.firstMessageV2Draft,
      translations: c.translations || null,
      tags: c.tags.filter((t) => t.includes(':')),
      customTags: c.tags.filter((t) => !t.includes(':')).join(', '),
      initialAffinity: c.initialAffinity || 0,
      voiceId: c.voiceId || '',
      isPublic: c.isPublic,
      proactiveEnabled: c.proactiveEnabled || false,
      proactiveMinInterval: Math.round((c.proactiveMinInterval || 3600) / 60),
      proactiveMaxInterval: Math.round((c.proactiveMaxInterval || 14400) / 60),
      proactiveProbability: Math.round((c.proactiveProbability || 0.5) * 100),
      proactiveMaxCount: c.proactiveMaxCount || 3,
    })
    setV2Lang('ko')
    setV2Busy({ image: false, voice: false, translate: false, generate: false })
    const vs = (c.voiceSamples && typeof c.voiceSamples === 'object') ? c.voiceSamples : {}
    setVoiceSamples({
      normal: { text: vs.normal?.text || '', audioUrl: vs.normal?.audioUrl || '' },
      aroused: { text: vs.aroused?.text || '', audioUrl: vs.aroused?.audioUrl || '' },
    })
    setVoiceSampleBusy({ normal: null, aroused: null })
    setEditing(c)
  }

  // asDraft=true면 V2를 임시 저장(채팅에서 V1 폴백). 명시 안 하면 form.firstMessageV2Draft 유지.
  const save = async ({ asDraft } = {}) => {
    // V2 JSON 파싱 (빈 문자열은 null 처리)
    let firstMessageV2 = null
    const parsedByLang = { ko: null, en: null, ja: null }
    for (const lang of ['ko', 'en', 'ja']) {
      const raw = (form.firstMessageV2Text?.[lang] || '').trim()
      if (!raw) continue
      try {
        parsedByLang[lang] = JSON.parse(raw)
      } catch (e) {
        alert(`${lang.toUpperCase()} JSON 파싱 실패: ${e.message}`)
        return
      }
    }
    firstMessageV2 = parsedByLang.ko

    // translations 병합: 기존 값 유지 + V2 lang 갱신
    const existingTr = form.translations && typeof form.translations === 'object' ? form.translations : {}
    const nextTranslations = { ...existingTr }
    for (const lang of ['en', 'ja']) {
      const v2 = parsedByLang[lang]
      const langTr = { ...(existingTr[lang] || {}) }
      if (v2) langTr.firstMessageV2 = v2
      else delete langTr.firstMessageV2
      if (Object.keys(langTr).length > 0) nextTranslations[lang] = langTr
      else delete nextTranslations[lang]
    }

    // promptDataV1 JSON 파싱 (빈 문자열 → null 로 초기화)
    let promptDataV1 = null
    const pdv1Raw = (form.promptDataV1Text || '').trim()
    if (pdv1Raw) {
      try {
        promptDataV1 = JSON.parse(pdv1Raw)
      } catch (e) {
        alert(`promptDataV1 JSON 파싱 실패: ${e.message}`)
        return
      }
      if (typeof promptDataV1 !== 'object' || Array.isArray(promptDataV1)) {
        alert('promptDataV1은 JSON 객체여야 합니다.')
        return
      }
    }

    const { firstMessageV2Text, promptDataV1Text: _pdv1Unused, translations: _trUnused, firstMessageV2Draft: _draftUnused, ...rest } = form
    const draftFlag = asDraft === undefined ? !!form.firstMessageV2Draft : !!asDraft
    const data = {
      ...rest,
      promptDataV1,
      firstMessageV2,
      firstMessageV2Draft: draftFlag,
      translations: Object.keys(nextTranslations).length > 0 ? nextTranslations : null,
      tags: [
        ...form.tags,
        ...form.customTags.split(',').map((t) => t.trim()).filter(Boolean),
      ],
      proactiveMinInterval: form.proactiveMinInterval * 60,
      proactiveMaxInterval: form.proactiveMaxInterval * 60,
      proactiveProbability: form.proactiveProbability / 100,
      proactiveMaxCount: form.proactiveMaxCount,
      voiceId: form.voiceId.trim() || null,
    }

    try {
      if (editing === 'new') {
        await api.post('/admin/characters', data)
      } else {
        await api.put(`/admin/characters/${editing.id}`, data)
      }
    } catch (e) {
      alert(`저장 실패: ${e?.message || 'unknown'}`)
      return
    }

    setEditing(null)
    load()
  }

  const remove = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await api.delete(`/admin/characters/${id}`)
    load()
  }

  // 음성 샘플 — Gemini로 대사 생성 (저장 안 함)
  const generateVoiceSampleText = async (kind) => {
    if (!editing || editing === 'new') return
    setVoiceSampleBusy((prev) => ({ ...prev, [kind]: 'text' }))
    try {
      const { text } = await api.post(`/admin/characters/${editing.id}/voice-sample/generate-text`, { kind })
      setVoiceSamples((prev) => ({ ...prev, [kind]: { ...prev[kind], text } }))
    } catch (e) {
      alert(`대사 생성 실패: ${e?.message || 'unknown'}`)
    } finally {
      setVoiceSampleBusy((prev) => ({ ...prev, [kind]: null }))
    }
  }

  // 음성 샘플 저장 (generateTts=true면 TTS도 함께 생성·업로드)
  const saveVoiceSample = async (kind, { generateTts }) => {
    if (!editing || editing === 'new') return
    const text = (voiceSamples[kind]?.text || '').trim()
    if (!text) { alert('대사를 먼저 입력하세요'); return }
    setVoiceSampleBusy((prev) => ({ ...prev, [kind]: generateTts ? 'tts' : 'save' }))
    try {
      const { voiceSamples: updated } = await api.post(
        `/admin/characters/${editing.id}/voice-sample/save`,
        { kind, text, generateTts }
      )
      setVoiceSamples({
        normal: { text: updated?.normal?.text || '', audioUrl: updated?.normal?.audioUrl || '' },
        aroused: { text: updated?.aroused?.text || '', audioUrl: updated?.aroused?.audioUrl || '' },
      })
    } catch (e) {
      alert(`저장 실패: ${e?.message || 'unknown'}`)
    } finally {
      setVoiceSampleBusy((prev) => ({ ...prev, [kind]: null }))
    }
  }

  const uploadProfileImage = async (file) => {
    if (!editing || editing === 'new') return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const { character } = await api.put(`/admin/characters/${editing.id}/profile-image`, formData)
      setEditing({ ...editing, profileImage: character.profileImage })
      load()
    } catch (e) {
      alert('이미지 업로드 실패')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeProfileImage = async () => {
    if (!editing || editing === 'new') return
    setUploadingImage(true)
    try {
      await api.delete(`/admin/characters/${editing.id}/profile-image`)
      setEditing({ ...editing, profileImage: null })
      load()
    } catch (e) {
      alert('이미지 삭제 실패')
    } finally {
      setUploadingImage(false)
    }
  }

  const uploadHomeImage = async (file) => {
    if (!editing || editing === 'new') return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const { character } = await api.put(`/admin/characters/${editing.id}/home-image`, formData)
      setEditing({ ...editing, homeImage: character.homeImage })
      load()
    } catch (e) {
      alert('홈 이미지 업로드 실패')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeHomeImage = async () => {
    if (!editing || editing === 'new') return
    setUploadingImage(true)
    try {
      await api.delete(`/admin/characters/${editing.id}/home-image`)
      setEditing({ ...editing, homeImage: null })
      load()
    } catch (e) {
      alert('홈 이미지 삭제 실패')
    } finally {
      setUploadingImage(false)
    }
  }

  // 신규 컬럼(profileImageNsfw / homeImageSquare / homeImageSquareNsfw) 공용 업로더
  const uploadColumnImage = async (column, endpointPath, file) => {
    if (!editing || editing === 'new') return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const { character } = await api.put(`/admin/characters/${editing.id}/${endpointPath}`, formData)
      setEditing({ ...editing, [column]: character[column] })
      load()
    } catch (e) {
      alert('이미지 업로드 실패')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeColumnImage = async (column, endpointPath) => {
    if (!editing || editing === 'new') return
    setUploadingImage(true)
    try {
      await api.delete(`/admin/characters/${editing.id}/${endpointPath}`)
      setEditing({ ...editing, [column]: null })
      load()
    } catch (e) {
      alert('이미지 삭제 실패')
    } finally {
      setUploadingImage(false)
    }
  }

  // V2 JSON 유효성 검사 + 파싱 결과 (현재 lang)
  const { v2ParseError, v2Parsed } = (() => {
    const raw = (form.firstMessageV2Text?.[v2Lang] || '').trim()
    if (!raw) return { v2ParseError: null, v2Parsed: null }
    try { return { v2ParseError: null, v2Parsed: JSON.parse(raw) } }
    catch (e) { return { v2ParseError: e.message, v2Parsed: null } }
  })()

  // 현재 lang의 image 블록만 추출 (절대 인덱스 보존)
  const v2ImageBlocks = (() => {
    if (!v2Parsed || !Array.isArray(v2Parsed.blocks)) return []
    return v2Parsed.blocks
      .map((b, idx) => (b?.type === 'image' ? { idx, concept: b.concept || '', url: b.url || '' } : null))
      .filter(Boolean)
  })()

  // 현재 lang의 message 블록 추출 (절대 인덱스 보존)
  const v2MessageBlocks = (() => {
    if (!v2Parsed || !Array.isArray(v2Parsed.blocks)) return []
    return v2Parsed.blocks
      .map((b, idx) => (b?.type === 'message' ? {
        idx,
        text: b.text || '',
        emotion: b.emotion || 'NEUTRAL',
        audioUrl: b.audioUrl || '',
      } : null))
      .filter(Boolean)
  })()

  // 특정 image 블록의 url 업데이트 → JSON 직렬화 → textarea 갱신
  const setImageBlockUrl = (blockIdx, url) => {
    if (!v2Parsed) return
    const next = {
      ...v2Parsed,
      blocks: v2Parsed.blocks.map((b, i) => (i === blockIdx ? { ...b, url } : b)),
    }
    setForm((f) => ({
      ...f,
      firstMessageV2Text: { ...f.firstMessageV2Text, [v2Lang]: JSON.stringify(next, null, 2) },
    }))
  }

  // image 블록별 업로드 — 업로드 후 해당 블록의 url을 자동으로 채움
  const uploadV2ImageToBlock = async (blockIdx, file) => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    setV2Busy((s) => ({ ...s, image: true }))
    try {
      const fd = new FormData()
      fd.append('image', file)
      const { url } = await api.post(`/admin/characters/${editing.id}/first-message-v2/image`, fd)
      setImageBlockUrl(blockIdx, url)
    } catch (e) {
      alert(`업로드 실패: ${e?.message || 'unknown'}`)
    } finally {
      setV2Busy((s) => ({ ...s, image: false }))
    }
  }

  // V2 이미지 업로드 → URL 반환 (어드민이 직접 JSON에 붙여넣음)
  const uploadV2Image = async (file) => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    setV2Busy((s) => ({ ...s, image: true }))
    try {
      const fd = new FormData()
      fd.append('image', file)
      const { url } = await api.post(`/admin/characters/${editing.id}/first-message-v2/image`, fd)
      try { await navigator.clipboard.writeText(url) } catch { /* clipboard 권한 없을 수 있음 */ }
      alert(`업로드 완료. URL이 클립보드에 복사됨:\n${url}`)
    } catch (e) {
      alert(`업로드 실패: ${e?.message || 'unknown'}`)
    } finally {
      setV2Busy((s) => ({ ...s, image: false }))
    }
  }

  // V2 JSON 자동 생성 (Gemini) — 캐릭터 정보 기반으로 ko JSON 생성, ko 탭 textarea 덮어씀
  const generateV2WithGemini = async () => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    if (form.firstMessageV2Text.ko.trim() &&
        !confirm('현재 ko 탭의 V2 JSON을 Gemini 생성 결과로 덮어쓰시겠습니까?')) {
      return
    }
    const hint = prompt('추가 지시 (선택, 비워두면 캐릭터 정보만으로 생성):\n예) 비 오는 날 카페에서 처음 만나는 장면', '') ?? null
    if (hint === null) return  // 취소

    setV2Busy((s) => ({ ...s, generate: true }))
    try {
      const { firstMessageV2 } = await api.post(
        `/admin/characters/${editing.id}/first-message-v2/generate`,
        { hint }
      )
      setForm((f) => ({
        ...f,
        firstMessageV2Text: { ...f.firstMessageV2Text, ko: JSON.stringify(firstMessageV2, null, 2) },
      }))
      setV2Lang('ko')
      alert('Gemini 생성 완료. ko 탭에 채워졌습니다.')
    } catch (e) {
      alert(`생성 실패: ${e?.message || 'unknown'}`)
    } finally {
      setV2Busy((s) => ({ ...s, generate: false }))
    }
  }

  // V2 보이스 생성 — 현재 lang JSON의 message 블록마다 TTS 생성, audioUrl 채워서 textarea 갱신
  const generateV2Voices = async () => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    const raw = (form.firstMessageV2Text?.[v2Lang] || '').trim()
    if (!raw) { alert('JSON이 비어있습니다'); return }
    let parsed
    try { parsed = JSON.parse(raw) } catch (e) { alert(`JSON 파싱 실패: ${e.message}`); return }
    if (!confirm(`${v2Lang.toUpperCase()} message 블록들의 보이스를 생성하시겠습니까?\n(기존 audioUrl이 덮어쓰기됩니다)`)) return

    setV2Busy((s) => ({ ...s, voice: true }))
    try {
      const { firstMessageV2 } = await api.post(`/admin/characters/${editing.id}/first-message-v2/voice`, {
        lang: v2Lang,
        firstMessageV2: parsed,
      })
      setForm((f) => ({
        ...f,
        firstMessageV2Text: { ...f.firstMessageV2Text, [v2Lang]: JSON.stringify(firstMessageV2, null, 2) },
      }))
      alert('보이스 생성 완료')
    } catch (e) {
      alert(`보이스 생성 실패: ${e?.message || 'unknown'}`)
    } finally {
      setV2Busy((s) => ({ ...s, voice: false }))
    }
  }

  // 단일 message 블록만 보이스 재생성
  const [v2VoiceBusyIdx, setV2VoiceBusyIdx] = useState(null)
  const regenerateV2Voice = async (blockIdx) => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    const raw = (form.firstMessageV2Text?.[v2Lang] || '').trim()
    if (!raw) { alert('JSON이 비어있습니다'); return }
    let parsed
    try { parsed = JSON.parse(raw) } catch (e) { alert(`JSON 파싱 실패: ${e.message}`); return }

    setV2VoiceBusyIdx(blockIdx)
    try {
      const { firstMessageV2 } = await api.post(`/admin/characters/${editing.id}/first-message-v2/voice`, {
        lang: v2Lang,
        firstMessageV2: parsed,
        blockIdx,
      })
      setForm((f) => ({
        ...f,
        firstMessageV2Text: { ...f.firstMessageV2Text, [v2Lang]: JSON.stringify(firstMessageV2, null, 2) },
      }))
    } catch (e) {
      alert(`보이스 생성 실패: ${e?.message || 'unknown'}`)
    } finally {
      setV2VoiceBusyIdx(null)
    }
  }

  // 특정 message 블록의 audioUrl 비우기 (재생성 전 클리어 등)
  const clearV2BlockAudio = (blockIdx) => {
    if (!v2Parsed) return
    const next = {
      ...v2Parsed,
      blocks: v2Parsed.blocks.map((b, i) => (i === blockIdx ? { ...b, audioUrl: '' } : b)),
    }
    setForm((f) => ({
      ...f,
      firstMessageV2Text: { ...f.firstMessageV2Text, [v2Lang]: JSON.stringify(next, null, 2) },
    }))
  }

  // 자동 번역 트리거 — 현재 ko 데이터 기준으로 en/ja translations 재생성
  const triggerTranslate = async () => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    if (!confirm('ko 기준으로 en/ja 자동 번역을 실행합니다. 기존 번역(translations)이 덮어쓰기되며,\nV2의 image url은 보존되지만 audioUrl은 비워집니다. 계속할까요?')) return

    setV2Busy((s) => ({ ...s, translate: true }))
    try {
      const { translations } = await api.post(`/admin/characters/${editing.id}/translate`, {})
      const next = { ko: form.firstMessageV2Text.ko, en: '', ja: '' }
      for (const lang of ['en', 'ja']) {
        const v2 = translations?.[lang]?.firstMessageV2
        if (v2) {
          try { next[lang] = JSON.stringify(v2, null, 2) } catch { /* keep '' */ }
        }
      }
      setForm((f) => ({ ...f, firstMessageV2Text: next, translations }))
      alert('자동 번역 완료')
    } catch (e) {
      alert(`자동 번역 실패: ${e?.message || 'unknown'}`)
    } finally {
      setV2Busy((s) => ({ ...s, translate: false }))
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">캐릭터 관리</h2>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 새 캐릭터
        </button>
      </div>

      {/* 정렬 */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-400">정렬</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <option value="name">이름순</option>
          <option value="conversations">대화 수 (내림차)</option>
          <option value="recentConversations">최근 1주 대화 수</option>
          <option value="nationality">국적</option>
        </select>
      </div>

      {/* 공개/비공개 탭 */}
      <div className="flex gap-1 mb-3 border-b border-gray-800">
        {[
          { key: 'public', label: '공개' },
          { key: 'private', label: '비공개' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t.label} ({characters.filter((c) => (t.key === 'public' ? c.isPublic : !c.isPublic)).length})
          </button>
        ))}
      </div>

      {/* 국적 탭 */}
      <div className="flex gap-1 mb-4">
        {NATIONALITY_TABS.map((n) => {
          const count = characters
            .filter((c) => (tab === 'public' ? c.isPublic : !c.isPublic))
            .filter((c) => (n.key === 'all' ? true : getNationality(c) === n.key)).length
          return (
            <button
              key={n.key}
              onClick={() => setNationality(n.key)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                nationality === n.key
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {n.label} ({count})
            </button>
          )
        })}
      </div>

      {/* 캐릭터 목록 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {filteredCharacters.length === 0 ? (
          <p className="p-4 text-gray-500">
            {tab === 'public' ? '공개된 캐릭터가 없습니다.' : '비공개 캐릭터가 없습니다.'}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">이름</th>
                <th className="p-3">대화 수</th>
                <th className="p-3">최근 1주</th>
                <th className="p-3">V2 첫인사</th>
                <th className="p-3">선제</th>
                <th className="p-3">TTS</th>
                <th className="p-3">푸시</th>
                <th className="p-3">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredCharacters.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 text-sm">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                        {(() => {
                          const src = c.profileImage || c.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')?.filePath
                          return src ? (
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
                          )
                        })()}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="p-3">{c._count.conversations}</td>
                  <td className="p-3">
                    {c.recentConversations7d > 0 ? (
                      <span className="text-indigo-300 font-medium">{c.recentConversations7d}</span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const hasKo = !!c.firstMessageV2
                      const isDraft = !!c.firstMessageV2Draft
                      if (!hasKo) return <span className="text-gray-600 text-xs">—</span>
                      const langs = ['ko']
                      if (c.translations?.en?.firstMessageV2) langs.push('en')
                      if (c.translations?.ja?.firstMessageV2) langs.push('ja')
                      const tooltip = `언어: ${langs.join(' · ')}${isDraft ? ' (초안 — 채팅에선 V1 폴백)' : ''}`
                      return isDraft ? (
                        <span className="text-yellow-400 text-xs" title={tooltip}>📝 초안</span>
                      ) : (
                        <span className="text-green-400 text-xs" title={tooltip}>✅ {langs.join('·')}</span>
                      )
                    })()}
                  </td>
                  <td className="p-3">
                    <span className={c.proactiveEnabled ? 'text-green-400' : 'text-gray-500'}>
                      {c.proactiveEnabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={c.voiceId ? 'text-green-400' : 'text-gray-500'}>
                      {c.voiceId ? 'ON' : 'OFF'}
                    </span>
                    {c.voiceId && duplicateVoiceIds.has(c.voiceId.trim()) && (
                      <span className="ml-1.5 text-red-400 font-semibold">(중복)</span>
                    )}
                  </td>
                  <td className="p-3">
                    {c._count?.broadcastNotifications > 0 ? (
                      <span
                        className="text-yellow-400 text-xs"
                        title={c.lastBroadcastAt ? `최근 발송: ${formatKstDateTime(c.lastBroadcastAt)}` : ''}
                      >
                        🔔 {c._count.broadcastNotifications}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => navigate(`/admin/characters/${c.id}/feeds`)}
                        className="text-purple-400 hover:text-purple-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        피드
                      </button>
                      <button
                        onClick={() => navigate(`/admin/characters/${c.id}/gifts`)}
                        className="text-pink-400 hover:text-pink-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        선물
                      </button>
                      <button
                        onClick={() => navigate(`/admin/characters/${c.id}/profile-variants`)}
                        className="text-amber-400 hover:text-amber-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        프로필
                      </button>
                      <button
                        onClick={() => setNotifyTarget(c)}
                        className="text-yellow-400 hover:text-yellow-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        알림
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 푸시·인앱 알림 모달 */}
      {notifyTarget && (
        <NotifyCharacterModal
          character={notifyTarget}
          onClose={() => setNotifyTarget(null)}
          onSent={() => { setNotifyTarget(null); load() }}
        />
      )}

      {/* 생성/수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-auto p-6">
            <h3 className="text-lg font-bold mb-4">
              {editing === 'new' ? '새 캐릭터' : '캐릭터 수정'}
            </h3>

            {/* 프로필 이미지 */}
            {editing !== 'new' && (() => {
              const isDragOver = dragOverColumn === 'profileImage'
              return (
                <div
                  className={`flex items-center gap-4 mb-4 pb-4 border-b border-gray-700 p-2 -m-2 rounded-lg border-2 border-dashed transition-colors ${
                    isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-transparent'
                  }`}
                  onDragEnter={(e) => {
                    if (!e.dataTransfer?.types?.includes('Files')) return
                    e.preventDefault()
                    setDragOverColumn('profileImage')
                  }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer?.types?.includes('Files')) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return
                    setDragOverColumn((c) => (c === 'profileImage' ? null : c))
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverColumn(null)
                    const file = e.dataTransfer.files?.[0]
                    if (file && file.type.startsWith('image/')) uploadProfileImage(file)
                  }}
                >
                  <div className="w-16 h-16 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 pointer-events-none">
                    {editing.profileImage ? (
                      <img src={editing.profileImage} alt="" className="w-full h-full object-cover" />
                    ) : (() => {
                      const img = editing.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
                      return img?.filePath ? (
                        <img src={img.filePath} alt="" className="w-full h-full object-cover opacity-50" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">?</div>
                      )
                    })()}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-gray-400">
                      {editing.profileImage ? '프로필 이미지' : '프로필 이미지 (스프라이트 사용 중)'}
                    </p>
                    <p className="text-[10px] text-gray-500">클릭 또는 드래그앤드랍</p>
                    <div className="flex gap-2">
                      <label
                        className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                          uploadingImage ? 'bg-gray-700 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {uploadingImage ? '업로드 중...' : '이미지 변경'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingImage}
                          onChange={(e) => {
                            if (e.target.files[0]) uploadProfileImage(e.target.files[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {editing.profileImage && (
                        <button
                          onClick={removeProfileImage}
                          disabled={uploadingImage}
                          className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-red-400 hover:text-red-300 border border-gray-700"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 홈 미디어 (이미지/영상 — 홈 화면에서만 노출) */}
            {editing !== 'new' && (() => {
              const isVideo = editing.homeImage && /\.(mp4|webm)(\?|$)/i.test(editing.homeImage)
              return (
                <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-700">
                  <div className="w-16 h-16 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0">
                    {editing.homeImage ? (
                      isVideo ? (
                        <video
                          src={editing.homeImage}
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img src={editing.homeImage} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">?</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-gray-400">
                      {editing.homeImage
                        ? `홈 미디어 (${isVideo ? '영상' : '이미지'})`
                        : '홈 미디어 (미설정 — 프로필 이미지 사용)'}
                    </p>
                    <p className="text-[10px] text-gray-500">MP4/WebM 권장 (GIF보다 10배 작음)</p>
                    <div className="flex gap-2">
                      <label
                        className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                          uploadingImage ? 'bg-gray-700 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {uploadingImage ? '업로드 중...' : '미디어 변경'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                          className="hidden"
                          disabled={uploadingImage}
                          onChange={(e) => {
                            if (e.target.files[0]) uploadHomeImage(e.target.files[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {editing.homeImage && (
                        <button
                          onClick={removeHomeImage}
                          disabled={uploadingImage}
                          className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-red-400 hover:text-red-300 border border-gray-700"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 1:1 홈 슬라이더 / NSFW 이미지셋 — Safety OFF + adultVerified 유저에게만 NSFW 노출 */}
            {editing !== 'new' && (
              <div className="mb-4 pb-4 border-b border-gray-700 space-y-3">
                <p className="text-xs font-semibold text-gray-300">홈 1:1 슬라이더 / NSFW 이미지셋</p>
                <p className="text-[10px] text-gray-500 -mt-2">홈 1:1 미디어는 영상(MP4/WebM, 20MB 이하)도 허용 · 클릭 또는 드래그앤드랍</p>
                {[
                  {
                    label: '홈 1:1 미디어 (SFW)',
                    column: 'homeImageSquare',
                    endpoint: 'home-image-square',
                    accept: 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm',
                    rounded: 'rounded-xl',
                  },
                  {
                    label: '홈 1:1 미디어 (NSFW)',
                    column: 'homeImageSquareNsfw',
                    endpoint: 'home-image-square-nsfw',
                    accept: 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm',
                    rounded: 'rounded-xl',
                  },
                  {
                    label: '프로필 이미지 (NSFW)',
                    column: 'profileImageNsfw',
                    endpoint: 'profile-image-nsfw',
                    accept: 'image/*',
                    rounded: 'rounded-full',
                  },
                ].map(({ label, column, endpoint, accept, rounded }) => {
                  const url = editing[column]
                  const isVideo = url && /\.(mp4|webm)(\?|$)/i.test(url)
                  const isDragOver = dragOverColumn === column
                  return (
                    <div
                      key={column}
                      className={`flex items-center gap-4 p-2 -m-2 rounded-lg border-2 border-dashed transition-colors ${
                        isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-transparent'
                      }`}
                      onDragEnter={(e) => {
                        if (!e.dataTransfer?.types?.includes('Files')) return
                        e.preventDefault()
                        setDragOverColumn(column)
                      }}
                      onDragOver={(e) => {
                        if (!e.dataTransfer?.types?.includes('Files')) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'copy'
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget)) return
                        setDragOverColumn((c) => (c === column ? null : c))
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOverColumn(null)
                        const file = e.dataTransfer.files?.[0]
                        if (file) uploadColumnImage(column, endpoint, file)
                      }}
                    >
                      <div className={`w-16 h-16 ${rounded} bg-gray-800 overflow-hidden flex-shrink-0 pointer-events-none`}>
                        {url ? (
                          isVideo ? (
                            <video src={url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                          ) : (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">?</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        <p className="text-xs text-gray-400">{label}{url ? '' : ' (미설정)'}</p>
                        <div className="flex gap-2">
                          <label
                            className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                              uploadingImage ? 'bg-gray-700 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'
                            }`}
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            {uploadingImage ? '업로드 중...' : (url ? '변경' : '업로드')}
                            <input
                              type="file"
                              accept={accept}
                              className="hidden"
                              disabled={uploadingImage}
                              onChange={(e) => {
                                if (e.target.files[0]) uploadColumnImage(column, endpoint, e.target.files[0])
                                e.target.value = ''
                              }}
                            />
                          </label>
                          {url && (
                            <button
                              onClick={() => removeColumnImage(column, endpoint)}
                              disabled={uploadingImage}
                              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-red-400 hover:text-red-300 border border-gray-700"
                              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">이름</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="캐릭터 이름"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">소개</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                  placeholder="캐릭터 한줄 소개"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">컨셉</label>
                <input
                  value={form.concept}
                  onChange={(e) => setForm({ ...form, concept: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="츤데레 소꿉친구, 차가운 천재 등"
                />
              </div>

              {(() => {
                // promptDataV1에 coreTraits가 있으면 V1 채팅이 MR 빌더를 쓰므로 personality는 미반영.
                let mrActive = false
                const raw = (form.promptDataV1Text || '').trim()
                if (raw) {
                  try { mrActive = !!JSON.parse(raw)?.coreTraits } catch { mrActive = false }
                }
                return (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <label className="text-sm text-gray-400">성격 설정 (프롬프트)</label>
                        {mrActive && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 border border-gray-600 text-gray-300 font-medium">
                            V1(MR) 캐릭터 — 채팅 미반영
                          </span>
                        )}
                      </div>
                      <textarea
                        value={form.personality}
                        onChange={(e) => setForm({ ...form, personality: e.target.value })}
                        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-64 resize-y ${mrActive ? 'opacity-60' : ''}`}
                        placeholder="캐릭터의 말투, 성격, 배경 스토리 등을 자세히 작성"
                      />
                      {mrActive && (
                        <p className="text-[10px] text-gray-500 mt-1">
                          이 캐릭터는 아래 <span className="text-gray-300">promptDataV1</span>을 채팅 소스로 사용합니다. 이 필드는 어드민 표시/레거시 폴백용이며 채팅에 반영되지 않습니다.
                        </p>
                      )}
                    </div>

                    {/* V1 채팅 데이터 (promptDataV1, JSON) */}
                    <div className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <label className="text-sm font-medium text-gray-200">V1 채팅 데이터 (promptDataV1, JSON)</label>
                        {raw && (
                          mrActive ? (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-900/60 border border-emerald-700 text-emerald-300 font-medium">
                              MR 활성 (채팅 소스)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-900/60 border border-amber-700 text-amber-300 font-medium">
                              coreTraits 없음 — MR 미활성
                            </span>
                          )
                        )}
                      </div>
                      <textarea
                        value={form.promptDataV1Text}
                        onChange={(e) => setForm({ ...form, promptDataV1Text: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono h-96 resize-y"
                        placeholder='MRPrompt 스키마 JSON. 비워두면 promptDataV1 초기화(레거시 personality 사용). 예: { "identity": {...}, "coreTraits": [...], "speechBaseline": {...}, "sceneFacets": [...] }'
                        spellCheck={false}
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        V1 채팅이 실제로 읽는 데이터. <span className="text-gray-300">coreTraits</span>가 있어야 MR 빌더가 활성화됩니다. DB가 master이며 <span className="text-gray-300">data/v1-mrprompt/</span> 파일과는 <span className="text-gray-300">rebuild-v1-mrprompt-from-db.js</span>로 동기화하세요.
                      </p>
                    </div>
                  </>
                )
              })()}

              <div>
                <label className="text-sm text-gray-400 block mb-1">
                  첫 대사 <span className="text-red-400 font-semibold">(deprecated)</span>
                </label>
                <textarea
                  value={form.firstMessage}
                  onChange={(e) => setForm({ ...form, firstMessage: e.target.value })}
                  className="w-full bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm h-20 resize-none text-gray-400"
                  placeholder="(V1) 대화 시작 시 캐릭터의 첫 메시지 — 아래 V2가 비어있을 때만 사용됩니다"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  V2 (`firstMessageV2`) 마이그레이션이 끝나면 제거 예정입니다. 신규 캐릭터는 아래 V2 사용을 권장합니다.
                </p>
              </div>

              {/* 첫 등장 V2 (JSON) */}
              <div className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-200">첫 등장 V2 (JSON)</label>
                    {form.firstMessageV2Draft && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-900/60 border border-amber-700 text-amber-300 font-medium">
                        임시 저장 (채팅에서 V1 사용 중)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {V2_LANGS.map((l) => (
                      <button
                        key={l.key}
                        type="button"
                        onClick={() => setV2Lang(l.key)}
                        className={`px-2.5 py-1 text-xs rounded-md border ${
                          v2Lang === l.key
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={form.firstMessageV2Text[v2Lang]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      firstMessageV2Text: { ...form.firstMessageV2Text, [v2Lang]: e.target.value },
                    })
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono h-56 resize-y"
                  placeholder={V2_PLACEHOLDER}
                  spellCheck={false}
                />
                {v2ParseError ? (
                  <p className="text-[11px] text-red-400 mt-1">JSON 오류: {v2ParseError}</p>
                ) : (
                  <p className="text-[10px] text-gray-500 mt-1">
                    blocks: narration / image / message. message는 emotion·audioUrl 옵션.
                  </p>
                )}

                {/* 이미지 블록별 업로드 패널 */}
                {v2ImageBlocks.length > 0 && (
                  <div className="mt-3 border border-gray-700 rounded-md bg-gray-950/40 p-2 space-y-2">
                    <p className="text-[11px] text-gray-400 font-medium">
                      이미지 블록 ({v2ImageBlocks.length}개) — 파일을 끌어다 놓거나 업로드 버튼으로 url 자동 입력
                    </p>
                    {v2ImageBlocks.map((b) => (
                      <div
                        key={b.idx}
                        onDragOver={(e) => {
                          if (Array.from(e.dataTransfer.types).includes('Files')) {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'copy'
                          }
                        }}
                        onDragEnter={(e) => {
                          if (Array.from(e.dataTransfer.types).includes('Files')) {
                            e.preventDefault()
                            setV2DragOverIdx(b.idx)
                          }
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget)) setV2DragOverIdx(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          setV2DragOverIdx(null)
                          const file = e.dataTransfer.files?.[0]
                          if (!file) return
                          if (!file.type.startsWith('image/')) { alert('이미지 파일만 가능합니다'); return }
                          uploadV2ImageToBlock(b.idx, file)
                        }}
                        className={`flex items-start gap-2 p-2 bg-gray-900 rounded border transition-colors ${
                          v2DragOverIdx === b.idx
                            ? 'border-indigo-400 bg-indigo-950/30 ring-1 ring-indigo-500/40'
                            : 'border-gray-800'
                        }`}
                      >
                        {b.url ? (
                          <img
                            src={b.url}
                            alt=""
                            className="w-14 h-14 rounded object-cover flex-shrink-0 bg-gray-800"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded flex-shrink-0 bg-gray-800 border border-dashed border-gray-700 flex items-center justify-center text-[10px] text-gray-500">
                            no img
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-300 line-clamp-2">
                            {b.concept || <span className="italic text-gray-500">(컨셉 비어있음)</span>}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">
                            {b.url ? b.url : '— url 미설정'}
                          </p>
                          <div className="flex gap-1.5 mt-1.5">
                            <label
                              className={`px-2 py-1 text-[10px] rounded border cursor-pointer ${
                                v2Busy.image
                                  ? 'bg-gray-800 border-gray-700 text-gray-500'
                                  : 'bg-gray-800 border-gray-600 text-gray-200 hover:border-indigo-500'
                              }`}
                              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                            >
                              {b.url ? '교체' : '업로드'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={v2Busy.image}
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  e.target.value = ''
                                  if (f) uploadV2ImageToBlock(b.idx, f)
                                }}
                              />
                            </label>
                            {b.url && (
                              <button
                                type="button"
                                onClick={() => setImageBlockUrl(b.idx, '')}
                                className="px-2 py-1 text-[10px] rounded border border-gray-700 bg-gray-800 text-gray-400 hover:border-red-500 hover:text-red-300"
                                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                              >
                                url 비우기
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 메시지 블록별 보이스 패널 */}
                {v2MessageBlocks.length > 0 && (
                  <div className="mt-3 border border-gray-700 rounded-md bg-gray-950/40 p-2 space-y-2">
                    <p className="text-[11px] text-gray-400 font-medium">
                      메시지 블록 ({v2MessageBlocks.length}개) — 보이스 재생성/미리듣기
                    </p>
                    {v2MessageBlocks.map((b) => {
                      const busy = v2VoiceBusyIdx === b.idx
                      return (
                        <div key={b.idx} className="flex items-start gap-2 p-2 bg-gray-900 rounded border border-gray-800">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-800 border border-gray-700 text-gray-300">
                                {b.emotion}
                              </span>
                              <span className={`text-[10px] ${b.audioUrl ? 'text-green-400' : 'text-gray-500'}`}>
                                {b.audioUrl ? '✓ 보이스 있음' : '— 보이스 없음'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-300 line-clamp-2 whitespace-pre-wrap">
                              {b.text || <span className="italic text-gray-500">(텍스트 비어있음)</span>}
                            </p>
                            {b.audioUrl && (
                              <audio
                                src={b.audioUrl}
                                controls
                                preload="none"
                                className="w-full mt-1.5 h-7"
                                style={{ filter: 'brightness(0.9)' }}
                              />
                            )}
                            <div className="flex gap-1.5 mt-1.5">
                              <button
                                type="button"
                                onClick={() => regenerateV2Voice(b.idx)}
                                disabled={busy || v2VoiceBusyIdx !== null}
                                className="px-2 py-1 text-[10px] rounded border border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-500 disabled:opacity-50"
                                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                              >
                                {busy ? '생성 중…' : (b.audioUrl ? '재생성' : '생성')}
                              </button>
                              {b.audioUrl && (
                                <button
                                  type="button"
                                  onClick={() => clearV2BlockAudio(b.idx)}
                                  disabled={v2VoiceBusyIdx !== null}
                                  className="px-2 py-1 text-[10px] rounded border border-gray-700 bg-gray-800 text-gray-400 hover:border-red-500 hover:text-red-300 disabled:opacity-50"
                                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                                >
                                  audioUrl 비우기
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    onClick={generateV2WithGemini}
                    disabled={v2Busy.generate}
                    className="px-3 py-1.5 text-xs rounded-md border border-purple-600 bg-purple-900/40 text-purple-200 hover:border-purple-400 disabled:opacity-50"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {v2Busy.generate ? 'Gemini 생성 중…' : '✨ Gemini로 V2 JSON 생성 (ko)'}
                  </button>

                  <label
                    className={`px-3 py-1.5 text-xs rounded-md border cursor-pointer ${
                      v2Busy.image ? 'bg-gray-800 border-gray-700 text-gray-500' : 'bg-gray-800 border-gray-600 text-gray-200 hover:border-indigo-500'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {v2Busy.image ? '업로드 중…' : '이미지 업로드 (URL 복사)'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={v2Busy.image}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) uploadV2Image(f)
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={generateV2Voices}
                    disabled={v2Busy.voice || !!v2ParseError}
                    className="px-3 py-1.5 text-xs rounded-md border border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-500 disabled:opacity-50"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {v2Busy.voice ? '보이스 일괄 생성 중…' : `보이스 일괄 생성 (${v2Lang.toUpperCase()})`}
                  </button>

                  <button
                    type="button"
                    onClick={triggerTranslate}
                    disabled={v2Busy.translate}
                    className="px-3 py-1.5 text-xs rounded-md border border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-500 disabled:opacity-50"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {v2Busy.translate ? '번역 중…' : '자동 번역 (ko → en/ja)'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Gemini 생성: 캐릭터 정보 기반으로 ko V2 JSON 자동 작성 (image 블록 2~3개, concept 한국어 묘사 포함, url은 비어있음).<br />
                  이미지 블록 업로드: 위 "이미지 블록" 패널에 파일을 드래그하거나 업로드 버튼 사용 → 해당 블록 url 자동 채움.<br />
                  이미지 업로드 (URL 복사): JSON 외 자유 업로드. 파일 → URL을 클립보드에 복사.<br />
                  보이스 일괄 생성: 현재 탭의 모든 message 블록에 한 번에 TTS 생성. 개별 재생성은 위 "메시지 블록" 패널의 재생성 버튼 사용.<br />
                  자동 번역: ko 기준으로 en/ja translations 재생성. 이미지 url·concept은 보존, audioUrl은 비워짐.
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">
                  시작 호감도: {form.initialAffinity}
                </label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={form.initialAffinity}
                  onChange={(e) => setForm({ ...form, initialAffinity: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                  <span>-100 (적대)</span>
                  <span>0 (중립)</span>
                  <span>100 (호감)</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                  className="rounded"
                />
                공개
              </label>

              {/* 선제 메시지 설정 */}
              <div className="border-t border-gray-700 pt-4 mt-2">
                <label className="flex items-center gap-2 text-sm mb-3">
                  <input
                    type="checkbox"
                    checked={form.proactiveEnabled}
                    onChange={(e) => setForm({ ...form, proactiveEnabled: e.target.checked })}
                    className="rounded"
                  />
                  선제 메시지 활성화
                </label>

                {form.proactiveEnabled && (
                  <div className="space-y-3 pl-1">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-gray-400 block mb-1">최소 간격 (분)</label>
                        <input
                          type="number"
                          min="1"
                          value={form.proactiveMinInterval}
                          onChange={(e) => setForm({ ...form, proactiveMinInterval: parseInt(e.target.value) || 1 })}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-400 block mb-1">최대 간격 (분)</label>
                        <input
                          type="number"
                          min="1"
                          value={form.proactiveMaxInterval}
                          onChange={(e) => setForm({ ...form, proactiveMaxInterval: parseInt(e.target.value) || 1 })}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-gray-400 block mb-1">
                          발송 확률: {form.proactiveProbability}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={form.proactiveProbability}
                          onChange={(e) => setForm({ ...form, proactiveProbability: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                      <div className="w-28">
                        <label className="text-xs text-gray-400 block mb-1">최대 연속 횟수</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={form.proactiveMaxCount}
                          onChange={(e) => setForm({ ...form, proactiveMaxCount: parseInt(e.target.value) || 1 })}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* TTS 설정 */}
              <div className="border-t border-gray-700 pt-4 mt-2">
                <label className="text-xs text-gray-400 block mb-1">ElevenLabs Voice ID (TTS)</label>
                <input
                  value={form.voiceId}
                  onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                  placeholder="ElevenLabs voice ID 입력"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1">설정하면 채팅에서 TTS 버튼이 활성화됩니다</p>
              </div>

              {/* 음성 샘플 — 캐릭터 상세 페이지 버블 (normal / aroused). 메인 저장과 별개로 즉시 저장됨 */}
              {editing !== 'new' && (
                <div className="border-t border-gray-700 pt-4 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-200">음성 샘플 (상세 페이지 버블)</label>
                    <span className="text-[10px] text-gray-500">각 카드는 독립 저장</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mb-3">'Gemini로 생성' → 텍스트 검토 → 'TTS 생성 + 저장'. aroused는 클라이언트에서 Safety Mode OFF일 때만 재생됨.</p>
                  {['normal', 'aroused'].map((kind) => {
                    const busy = voiceSampleBusy[kind]
                    const sample = voiceSamples[kind] || { text: '', audioUrl: '' }
                    const label = kind === 'normal' ? '일반' : '흥분 (TEASE)'
                    return (
                      <div key={kind} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-300">{label}</span>
                          <button
                            type="button"
                            onClick={() => generateVoiceSampleText(kind)}
                            disabled={!!busy}
                            className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            {busy === 'text' ? '생성 중…' : 'Gemini로 대사 생성'}
                          </button>
                        </div>
                        <textarea
                          value={sample.text}
                          onChange={(e) => setVoiceSamples((prev) => ({ ...prev, [kind]: { ...prev[kind], text: e.target.value } }))}
                          placeholder={kind === 'aroused' ? '살짝 유혹하는 톤의 한 줄 대사 (60자 이하)' : '일상 톤의 한 줄 대사 (60자 이하)'}
                          rows={2}
                          maxLength={300}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 resize-none"
                        />
                        {sample.audioUrl && (
                          <audio src={sample.audioUrl} controls preload="none" className="w-full mt-2 h-9" />
                        )}
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => saveVoiceSample(kind, { generateTts: false })}
                            disabled={!!busy || !sample.text.trim()}
                            className="text-[11px] px-2 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            {busy === 'save' ? '저장 중…' : '텍스트만 저장'}
                          </button>
                          <button
                            type="button"
                            onClick={() => saveVoiceSample(kind, { generateTts: true })}
                            disabled={!!busy || !sample.text.trim() || !form.voiceId.trim()}
                            className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                            title={!form.voiceId.trim() ? 'voiceId를 먼저 설정·저장하세요' : ''}
                          >
                            {busy === 'tts' ? 'TTS 생성 중…' : 'TTS 생성 + 저장'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 flex-wrap">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={() => save({ asDraft: true })}
                className="px-4 py-2 bg-amber-700 text-amber-50 text-sm rounded-lg hover:bg-amber-600"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                title="V2를 저장하되 채팅에서는 V1을 사용 (작업 중 상태)"
              >
                임시 저장 (V2)
              </button>
              <button
                onClick={() => save({ asDraft: false })}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                title="V2가 있으면 채팅에 V2 적용 (발행)"
              >
                저장 (발행)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
