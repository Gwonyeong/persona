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
  firstMessage: '',
  firstMessageV2Text: { ko: '', en: '', ja: '' },
  firstMessageV2Draft: false,
  translations: null,  // 서버 원본 보존 (V2 외 필드 유지용)
  tags: [],
  customTags: '',
  initialAffinity: 0,
  followerCount: 0,
  followingCount: 0,
  voiceId: '',
  isPublic: false,
  proactiveEnabled: false,
  proactiveMinInterval: 60,   // 분 단위로 표시
  proactiveMaxInterval: 240,  // 분 단위로 표시
  proactiveProbability: 50,   // % 단위로 표시
  proactiveMaxCount: 3,
}

export default function Characters() {
  const [characters, setCharacters] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | character object
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [tab, setTab] = useState('public') // 'public' | 'private'
  const [v2Lang, setV2Lang] = useState('ko')
  const [v2Busy, setV2Busy] = useState({ image: false, voice: false, translate: false, generate: false })
  const [v2DragOverIdx, setV2DragOverIdx] = useState(null)
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
    setForm({
      name: c.name,
      description: c.description,
      concept: c.concept || '',
      personality: c.personality,
      firstMessage: c.firstMessage,
      firstMessageV2Text: v2Text,
      firstMessageV2Draft: !!c.firstMessageV2Draft,
      translations: c.translations || null,
      tags: c.tags.filter((t) => t.includes(':')),
      customTags: c.tags.filter((t) => !t.includes(':')).join(', '),
      initialAffinity: c.initialAffinity || 0,
      followerCount: c.followerCount || 0,
      followingCount: c.followingCount || 0,
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

    const { firstMessageV2Text, translations: _trUnused, firstMessageV2Draft: _draftUnused, ...rest } = form
    const draftFlag = asDraft === undefined ? !!form.firstMessageV2Draft : !!asDraft
    const data = {
      ...rest,
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

  // V2 JSON 자동 생성 (Grok) — 캐릭터 정보 기반으로 ko JSON 생성, ko 탭 textarea 덮어씀
  const generateV2WithGrok = async () => {
    if (!editing || editing === 'new') {
      alert('저장 후 사용 가능합니다 (캐릭터 ID 필요)')
      return
    }
    if (form.firstMessageV2Text.ko.trim() &&
        !confirm('현재 ko 탭의 V2 JSON을 Grok 생성 결과로 덮어쓰시겠습니까?')) {
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
      alert('Grok 생성 완료. ko 탭에 채워졌습니다.')
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
                <th className="p-3">선제</th>
                <th className="p-3">TTS</th>
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
                    <div className="flex gap-2">
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

      {/* 생성/수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-auto p-6">
            <h3 className="text-lg font-bold mb-4">
              {editing === 'new' ? '새 캐릭터' : '캐릭터 수정'}
            </h3>

            {/* 프로필 이미지 */}
            {editing !== 'new' && (
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-700">
                <div className="w-16 h-16 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
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
            )}

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

              <div>
                <label className="text-sm text-gray-400 block mb-1">성격 설정 (프롬프트)</label>
                <textarea
                  value={form.personality}
                  onChange={(e) => setForm({ ...form, personality: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-32 resize-none"
                  placeholder="캐릭터의 말투, 성격, 배경 스토리 등을 자세히 작성"
                />
              </div>

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
                    onClick={generateV2WithGrok}
                    disabled={v2Busy.generate}
                    className="px-3 py-1.5 text-xs rounded-md border border-purple-600 bg-purple-900/40 text-purple-200 hover:border-purple-400 disabled:opacity-50"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {v2Busy.generate ? 'Grok 생성 중…' : '✨ Grok로 V2 JSON 생성 (ko)'}
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
                  Grok 생성: 캐릭터 정보 기반으로 ko V2 JSON 자동 작성 (image 블록 2~3개, concept 한국어 묘사 포함, url은 비어있음).<br />
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

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm text-gray-400 block mb-1">팔로워 수</label>
                  <input
                    type="number"
                    min="0"
                    value={form.followerCount}
                    onChange={(e) => setForm({ ...form, followerCount: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-400 block mb-1">팔로잉 수</label>
                  <input
                    type="number"
                    min="0"
                    value={form.followingCount}
                    onChange={(e) => setForm({ ...form, followingCount: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
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
