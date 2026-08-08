import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../../lib/api'

// 제작중 캐릭터 완성 워크스페이스 — voiceId · 표정 일괄 등록 · 음성 샘플 · 프로필 이미지 · 공개 전환을
// 한 화면에서 처리. 기존 어드민 API를 그대로 재사용한다(신규 API는 PATCH /production 하나뿐).

// 준비도/표정 등록 기준 감정 (Expressions.jsx SFW_EMOTIONS와 동일)
const SFW_EMOTIONS = [
  { key: 'NEUTRAL', label: '기본' },
  { key: 'HAPPY', label: '웃음' },
  { key: 'ANGRY', label: '화남' },
  { key: 'SAD', label: '슬픔' },
  { key: 'SHY', label: '설렘' },
]
const NSFW_EMOTIONS = [
  { key: 'AROUSED_TEASE', label: '도발' },
  { key: 'AROUSED_TOPLESS', label: '상의 노출' },
  { key: 'AROUSED_NUDE', label: '전라' },
  { key: 'AROUSED_FOREPLAY', label: '애무' },
  { key: 'AROUSED_INSERT', label: '삽입' },
  { key: 'AROUSED_INSERT_ALT', label: '삽입(체위2)' },
  { key: 'AROUSED_CLIMAX', label: '절정' },
  { key: 'AROUSED_AFTERGLOW', label: '여운' },
]

const isVideoUrl = (url) => /\.(mp4|webm)(\?|$)/i.test(url || '')

const truncate = (s, n) => (!s ? '' : s.length > n ? s.slice(0, n) + '…' : s)

const STATUS_LABEL = {
  IN_PRODUCTION: { label: '제작중', cls: 'bg-cyan-500/15 text-cyan-300' },
  PUBLISHED: { label: '공개', cls: 'bg-green-500/15 text-green-400' },
  HIDDEN: { label: '비공개', cls: 'bg-gray-600/40 text-gray-300' },
}

const btnStyle = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// 예약 출시 기본 공개 시각 (KST). 1일 1캐릭터 출시 슬롯 계산에 사용.
const RELEASE_HOUR_KST = 18

// UTC Date → KST 달력 day key 'YYYY-MM-DD'
function kstDayKey(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 이미 예약된 날짜(occupiedKeys: Set<'YYYY-MM-DD'>)를 피해, 내일(KST)부터 가장 빠른 빈 슬롯을 찾는다.
// 1일 1캐릭터 원칙 — 하루 한 명만. 반환: { n, iso } (n=며칠 뒤, iso=공개 예약 UTC ISO)
function findEarliestSlot(occupiedKeys) {
  const kn = new Date(Date.now() + 9 * 60 * 60 * 1000) // UTC 필드 = KST 벽시계
  const ty = kn.getUTCFullYear(), tm = kn.getUTCMonth(), td = kn.getUTCDate()
  for (let offset = 1; offset < 3650; offset++) {
    const candMidnight = new Date(Date.UTC(ty, tm, td + offset))
    const key = candMidnight.toISOString().slice(0, 10)
    if (!occupiedKeys.has(key)) {
      const releaseMs = Date.UTC(candMidnight.getUTCFullYear(), candMidnight.getUTCMonth(), candMidnight.getUTCDate(), RELEASE_HOUR_KST - 9, 0, 0)
      return { n: offset, iso: new Date(releaseMs).toISOString() }
    }
  }
  return { n: 1, iso: null }
}

function formatKstDateFull(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

export default function CharacterProduction() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [allCharacters, setAllCharacters] = useState([])
  const [character, setCharacter] = useState(null)

  const [voiceIdInput, setVoiceIdInput] = useState('')
  const [savingVoice, setSavingVoice] = useState(false)
  const [copied, setCopied] = useState(null) // 'desc' | 'sample'

  // ElevenLabs Voice Design — 미리듣기 3개 생성 → 하나 골라 캐릭터 이름으로 확정
  const [designBusy, setDesignBusy] = useState(false)
  const [designError, setDesignError] = useState(null)
  const [previews, setPreviews] = useState([]) // [{ generatedVoiceId, audioBase64, mediaType, ... }]
  const [designText, setDesignText] = useState('') // 미리듣기가 실제 낭독한 대사
  const [creatingId, setCreatingId] = useState(null) // 확정 중인 generatedVoiceId

  // 표정 영상 일괄 업로드 (Gemini 자동 분류)
  const [bulkScope, setBulkScope] = useState('sfw') // 'sfw' | 'nsfw'
  const [bulkFiles, setBulkFiles] = useState([])
  const [bulkItems, setBulkItems] = useState([]) // [{name, status, emotion, confidence, error}]
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkStarted, setBulkStarted] = useState(false)
  const [bulkDrag, setBulkDrag] = useState(false)

  // 음성 샘플
  const [voiceSamples, setVoiceSamples] = useState({ normal: { text: '', audioUrl: '' }, aroused: { text: '', audioUrl: '' } })
  const [voiceSampleBusy, setVoiceSampleBusy] = useState({ normal: null, aroused: null })
  // 원클릭 자동 생성 (일반·흥분 대사 생성 → TTS → 저장)
  const [autoSample, setAutoSample] = useState({ running: false, step: '', error: null })

  // 프로필/홈 이미지
  const [uploadingImage, setUploadingImage] = useState(null) // 'profile' | 'home'
  const [dragImage, setDragImage] = useState(null)

  const [statusBusy, setStatusBusy] = useState(false)

  const load = () =>
    api.get('/admin/characters').then(({ characters }) => {
      setAllCharacters(characters)
      const c = characters.find((ch) => ch.id === parseInt(id))
      setCharacter(c || null)
      if (c) {
        setVoiceIdInput(c.voiceId || '')
        setVoiceSamples({
          normal: { text: c.voiceSamples?.normal?.text || '', audioUrl: c.voiceSamples?.normal?.audioUrl || '' },
          aroused: { text: c.voiceSamples?.aroused?.text || '', audioUrl: c.voiceSamples?.aroused?.audioUrl || '' },
        })
      }
    })

  useEffect(() => { load() }, [id])

  if (!character) return <div className="p-6 text-gray-400">로딩 중...</div>

  const baseStyle = (character.styles || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0]
  const imagesFor = (emotion) => (baseStyle?.images || []).filter((img) => img.emotion === emotion)

  // 같은 voiceId를 쓰는 다른 캐릭터 목록 (중복 경고)
  const voiceDupNames = (() => {
    const v = (voiceIdInput || '').trim()
    if (!v) return []
    return allCharacters.filter((c) => c.id !== character.id && (c.voiceId || '').trim() === v).map((c) => c.name)
  })()

  // 준비도
  const readiness = {
    voice: !!(character.voiceId && character.voiceId.trim()),
    emotionCount: SFW_EMOTIONS.filter((e) => imagesFor(e.key).length > 0).length,
    sample: !!character.voiceSamples?.normal?.audioUrl,
    profile: !!character.profileImage,
  }
  const emotionDone = readiness.emotionCount >= SFW_EMOTIONS.length
  const allReady = readiness.voice && emotionDone && readiness.sample && readiness.profile
  const hasVoiceId = !!(character.voiceId && character.voiceId.trim())

  // ── voiceId 저장 ──────────────────────────────────────────
  const saveVoiceId = async () => {
    setSavingVoice(true)
    try {
      await api.patch(`/admin/characters/${character.id}/production`, { voiceId: voiceIdInput })
      await load()
    } catch (e) {
      alert(`voiceId 저장 실패: ${e?.message || 'unknown'}`)
    } finally {
      setSavingVoice(false)
    }
  }

  // ── Voice Design (미리듣기 생성 → 확정) ──────────────────
  const runVoiceDesign = async () => {
    setDesignBusy(true)
    setDesignError(null)
    setPreviews([])
    try {
      const { previews: p, text } = await api.post(`/admin/characters/${character.id}/voice-design`, {})
      setPreviews(p || [])
      setDesignText(text || '')
      if (!p || p.length === 0) setDesignError('미리듣기가 생성되지 않았습니다.')
    } catch (e) {
      setDesignError(e?.data?.error || e?.message || '생성 실패')
    } finally {
      setDesignBusy(false)
    }
  }

  // 고른 미리듣기를 캐릭터 이름으로 확정 → voiceId 저장. 나머지는 학습용(played_not_selected)으로 전달.
  const confirmVoice = async (chosen) => {
    setCreatingId(chosen.generatedVoiceId)
    setDesignError(null)
    try {
      const playedNotSelected = previews
        .filter((p) => p.generatedVoiceId !== chosen.generatedVoiceId)
        .map((p) => p.generatedVoiceId)
      const { voiceId } = await api.post(`/admin/characters/${character.id}/voice-design/create`, {
        generatedVoiceId: chosen.generatedVoiceId,
        playedNotSelected,
      })
      setVoiceIdInput(voiceId || '')
      setPreviews([])
      setDesignText('')
      await load()
    } catch (e) {
      setDesignError(e?.data?.error || e?.message || '확정 실패')
    } finally {
      setCreatingId(null)
    }
  }

  const copyText = async (which, text) => {
    try {
      await navigator.clipboard.writeText(text || '')
      setCopied(which)
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
    } catch {
      alert('복사 실패 — 직접 선택해 복사해주세요.')
    }
  }

  // ── 표정 영상 일괄 업로드 (Gemini 자동 분류) ──────────────
  // Expressions.jsx의 BulkEmotionVideoModal과 동일 파이프라인: 영상 여러 개 → 서버가 0/중간/끝 프레임을
  // Gemini로 읽어 감정별로 자동 분류·업로드 (POST /admin/styles/:styleId/emotion-videos/bulk).
  const addBulkFiles = (list) => {
    if (bulkRunning) return
    const vids = Array.from(list || []).filter((f) => (f.type || '').startsWith('video/'))
    if (!vids.length) return
    if (bulkStarted) { setBulkStarted(false); setBulkItems([]) } // 끝난 배치에 추가하면 새 배치로 리셋
    setBulkFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}_${f.size}`))
      return [...prev, ...vids.filter((f) => !seen.has(`${f.name}_${f.size}`))]
    })
  }
  const removeBulkFile = (idx) => setBulkFiles((prev) => prev.filter((_, i) => i !== idx))

  const submitBulk = async () => {
    if (!baseStyle) { alert('기본 스타일이 없습니다.'); return }
    if (!bulkFiles.length || bulkRunning) return
    setBulkRunning(true)
    setBulkStarted(true)
    // file/scope를 항목에 보관 → 실패 시 원본 파일로 개별 재시도 가능 (submit 후 bulkFiles는 비워짐).
    setBulkItems(bulkFiles.map((f) => ({ name: f.name, file: f, scope: bulkScope, status: 'pending', emotion: null, confidence: null, error: null })))
    const mark = (i, patch) => setBulkItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
    let anyDone = false
    for (let i = 0; i < bulkFiles.length; i++) {
      mark(i, { status: 'processing' })
      try {
        const fd = new FormData()
        fd.append('tab', bulkScope)
        fd.append('videos', bulkFiles[i], bulkFiles[i].name)
        const res = await api.post(`/admin/styles/${baseStyle.id}/emotion-videos/bulk`, fd)
        const r = res.results?.[0]
        const er = res.errors?.[0]
        if (r) { anyDone = true; mark(i, { status: 'done', emotion: r.emotion, confidence: r.confidence }) }
        else mark(i, { status: 'error', error: er?.error || '분류 실패' })
      } catch (e) {
        mark(i, { status: 'error', error: e?.message || '업로드 실패' })
      }
    }
    setBulkRunning(false)
    setBulkFiles([])
    if (anyDone) await load()
  }

  // 실패한 개별 항목 재시도 — 보관해둔 원본 파일을 원래 scope로 다시 업로드·분류.
  const retryBulkItem = async (idx) => {
    if (bulkRunning) return
    const item = bulkItems[idx]
    if (!item || !item.file || item.status === 'processing') return
    if (!baseStyle) { alert('기본 스타일이 없습니다.'); return }
    const mark = (patch) => setBulkItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
    mark({ status: 'processing', error: null })
    try {
      const fd = new FormData()
      fd.append('tab', item.scope || bulkScope)
      fd.append('videos', item.file, item.name)
      const res = await api.post(`/admin/styles/${baseStyle.id}/emotion-videos/bulk`, fd)
      const r = res.results?.[0]
      const er = res.errors?.[0]
      if (r) { mark({ status: 'done', emotion: r.emotion, confidence: r.confidence, error: null }); await load() }
      else mark({ status: 'error', error: er?.error || '분류 실패' })
    } catch (e) {
      mark({ status: 'error', error: e?.message || '업로드 실패' })
    }
  }

  const removeImage = async (imageId) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return
    await api.delete(`/admin/images/${imageId}`)
    await load()
  }

  // ── 음성 샘플 ─────────────────────────────────────────────
  const generateSampleText = async (kind) => {
    setVoiceSampleBusy((p) => ({ ...p, [kind]: 'text' }))
    try {
      const { text } = await api.post(`/admin/characters/${character.id}/voice-sample/generate-text`, { kind })
      setVoiceSamples((prev) => ({ ...prev, [kind]: { ...prev[kind], text } }))
    } catch (e) {
      alert(`대사 생성 실패: ${e?.message || 'unknown'}`)
    } finally {
      setVoiceSampleBusy((p) => ({ ...p, [kind]: null }))
    }
  }

  const saveSample = async (kind, generateTts) => {
    const text = (voiceSamples[kind]?.text || '').trim()
    if (!text) { alert('대사를 먼저 입력하세요'); return }
    setVoiceSampleBusy((p) => ({ ...p, [kind]: generateTts ? 'tts' : 'save' }))
    try {
      const { voiceSamples: updated } = await api.post(`/admin/characters/${character.id}/voice-sample/save`, { kind, text, generateTts })
      setVoiceSamples({
        normal: { text: updated?.normal?.text || '', audioUrl: updated?.normal?.audioUrl || '' },
        aroused: { text: updated?.aroused?.text || '', audioUrl: updated?.aroused?.audioUrl || '' },
      })
      await load()
    } catch (e) {
      alert(`저장 실패: ${e?.message || 'unknown'}`)
    } finally {
      setVoiceSampleBusy((p) => ({ ...p, [kind]: null }))
    }
  }

  // 버튼 하나로 일반·흥분 대사를 각각 LLM 생성 → 곧바로 TTS까지 만들어 저장.
  // 기존 generate-text / save 엔드포인트를 순차 호출 (한 요청에 몰면 LLM 2회 + TTS 2회라 타임아웃 위험).
  const autoGenerateSamples = async () => {
    if (!hasVoiceId) { alert('보이스 ID를 먼저 확정/저장하세요.'); return }
    if (autoSample.running) return
    if ((voiceSamples.normal?.audioUrl || voiceSamples.aroused?.audioUrl) &&
        !confirm('기존 음성 샘플을 새로 생성한 대사·음성으로 덮어씁니다. 진행할까요?')) return

    setAutoSample({ running: true, step: '', error: null })
    let updatedAll = null
    try {
      for (const { kind, label } of [{ kind: 'normal', label: '기본' }, { kind: 'aroused', label: '흥분' }]) {
        setAutoSample((p) => ({ ...p, step: `${label} 대사 생성 중...` }))
        const { text } = await api.post(`/admin/characters/${character.id}/voice-sample/generate-text`, { kind })
        setVoiceSamples((prev) => ({ ...prev, [kind]: { ...prev[kind], text } }))

        setAutoSample((p) => ({ ...p, step: `${label} 음성 생성 중...` }))
        const { voiceSamples: updated } = await api.post(`/admin/characters/${character.id}/voice-sample/save`, { kind, text, generateTts: true })
        updatedAll = updated
        setVoiceSamples({
          normal: { text: updated?.normal?.text || '', audioUrl: updated?.normal?.audioUrl || '' },
          aroused: { text: updated?.aroused?.text || '', audioUrl: updated?.aroused?.audioUrl || '' },
        })
      }
      setAutoSample({ running: false, step: '', error: null })
    } catch (e) {
      // 중간 실패 시에도 앞 단계(기본)는 이미 저장됨 — 아래 개별 편집에서 이어서 처리 가능.
      setAutoSample({ running: false, step: '', error: e?.data?.error || e?.message || '자동 생성 실패' })
    } finally {
      if (updatedAll) await load()
    }
  }

  // ── 프로필 / 홈 이미지 ────────────────────────────────────
  const uploadCharImage = async (which, file) => {
    if (!file) return
    setUploadingImage(which)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const path = which === 'profile' ? 'profile-image' : 'home-image'
      await api.put(`/admin/characters/${character.id}/${path}`, formData)
      await load()
    } catch (e) {
      alert('이미지 업로드 실패')
    } finally {
      setUploadingImage(null)
    }
  }

  const triggerCharImageUpload = (which) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/mp4,video/webm'
    input.onchange = (e) => uploadCharImage(which, e.target.files[0])
    input.click()
  }

  const removeCharImage = async (which) => {
    if (!confirm('이미지를 삭제하시겠습니까?')) return
    const path = which === 'profile' ? 'profile-image' : 'home-image'
    await api.delete(`/admin/characters/${character.id}/${path}`)
    await load()
  }

  // ── 상태 전환 ─────────────────────────────────────────────
  const setStatus = async (status) => {
    if (status === 'PUBLISHED' && !allReady) {
      if (!confirm('아직 준비가 완료되지 않았습니다(체크리스트 미완). 그래도 공개하시겠습니까?')) return
    }
    if (status === 'HIDDEN' && !confirm('이 캐릭터를 비공개로 숨기시겠습니까?')) return
    setStatusBusy(true)
    try {
      await api.patch(`/admin/characters/${character.id}/production`, { productionStatus: status })
      if (status === 'PUBLISHED') { navigate('/admin/characters'); return }
      await load()
    } catch (e) {
      alert(`상태 변경 실패: ${e?.message || 'unknown'}`)
    } finally {
      setStatusBusy(false)
    }
  }

  // 예약 출시 — 가장 빠른 빈 슬롯(1일 1캐릭터)으로 예약. 현재 캐릭터 자신의 기존 예약은 슬롯 계산에서 제외.
  const reserveRelease = async (iso) => {
    setStatusBusy(true)
    try {
      await api.patch(`/admin/characters/${character.id}/production`, { scheduledPublishAt: iso })
      navigate('/admin/characters')
    } catch (e) {
      alert(`예약 실패: ${e?.message || 'unknown'}`)
      setStatusBusy(false)
    }
  }

  const cancelReservation = async () => {
    setStatusBusy(true)
    try {
      await api.patch(`/admin/characters/${character.id}/production`, { scheduledPublishAt: null })
      await load()
    } catch (e) {
      alert(`예약 취소 실패: ${e?.message || 'unknown'}`)
    } finally {
      setStatusBusy(false)
    }
  }

  const status = character.productionStatus || (character.isPublic ? 'PUBLISHED' : 'HIDDEN')
  const statusMeta = STATUS_LABEL[status] || STATUS_LABEL.HIDDEN

  // 다른 캐릭터의 예약 날짜(미공개 + scheduledPublishAt)를 피해 가장 빠른 출시 슬롯 계산
  const occupiedKeys = new Set(
    allCharacters
      .filter((ch) => ch.id !== character.id && ch.scheduledPublishAt && !ch.isPublic)
      .map((ch) => kstDayKey(new Date(ch.scheduledPublishAt)))
  )
  const earliestSlot = findEarliestSlot(occupiedKeys)

  const ChecklistItem = ({ ok, label }) => (
    <div className={`flex items-center gap-2 text-sm ${ok ? 'text-green-400' : 'text-gray-400'}`}>
      <span>{ok ? '✅' : '⏳'}</span>
      <span>{label}</span>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/characters" className="text-gray-400 hover:text-white text-sm">← 목록</Link>
        <h2 className="text-xl font-bold">{character.name} — 제작 워크스페이스</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${statusMeta.cls}`}>{statusMeta.label}</span>
      </div>

      {/* 준비도 체크리스트 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">준비도</h3>
        <div className="grid grid-cols-2 gap-2">
          <ChecklistItem ok={readiness.voice} label="보이스 ID 등록" />
          <ChecklistItem ok={emotionDone} label={`표정 이미지 ${readiness.emotionCount}/${SFW_EMOTIONS.length}`} />
          <ChecklistItem ok={readiness.sample} label="음성 샘플(기본)" />
          <ChecklistItem ok={readiness.profile} label="프로필 이미지" />
        </div>
      </div>

      {/* 1. voiceId + 음성 샘플 */}
      <Section title="1. 보이스 (ElevenLabs) · 음성 샘플">
        {/* 보이스 생성 프롬프트 — ElevenLabs Voice Design에 복사해 사용 */}
        {character.voicePrompt && (character.voicePrompt.description || character.voicePrompt.sampleText) && (
          <div className="mb-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
            <p className="text-xs font-semibold text-indigo-300 mb-2">🎙️ ElevenLabs 보이스 생성 프롬프트</p>
            {character.voicePrompt.description && (
              <CopyField
                label="보이스 설명 (Voice description)"
                text={character.voicePrompt.description}
                copied={copied === 'desc'}
                onCopy={() => copyText('desc', character.voicePrompt.description)}
              />
            )}
            {character.voicePrompt.sampleText && (
              <CopyField
                label="예시 대사 (Preview text)"
                text={character.voicePrompt.sampleText}
                copied={copied === 'sample'}
                onCopy={() => copyText('sample', character.voicePrompt.sampleText)}
              />
            )}
            <p className="text-[11px] text-gray-500 mt-1">아래 버튼으로 미리듣기 3개를 만든 뒤, 마음에 드는 목소리를 고르면 <b className="text-gray-300">{character.name}</b> 이름으로 확정·저장됩니다.</p>

            {/* 미리듣기 생성 버튼 */}
            <button
              onClick={runVoiceDesign}
              disabled={designBusy || !!creatingId}
              className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 w-full"
              style={btnStyle}
            >
              {designBusy ? '미리듣기 생성 중...' : previews.length > 0 ? '🔄 미리듣기 다시 생성' : '🎙 보이스 미리듣기 생성 (3개)'}
            </button>

            {designError && <p className="text-[11px] text-red-400 mt-2 break-words">⚠ {designError}</p>}

            {/* 미리듣기 3개 — 재생 후 하나 선택 */}
            {previews.length > 0 && (
              <div className="mt-3 space-y-2">
                {designText && (
                  <p className="text-[11px] text-gray-500">낭독 대사: "{truncate(designText, 80)}"</p>
                )}
                {previews.map((p, i) => {
                  const busy = creatingId === p.generatedVoiceId
                  const otherBusy = !!creatingId && !busy
                  return (
                    <div key={p.generatedVoiceId} className="flex items-center gap-2 bg-gray-800/60 rounded-lg p-2">
                      <span className="text-[11px] text-gray-400 font-mono flex-shrink-0 w-10">#{i + 1}</span>
                      <audio
                        src={`data:${p.mediaType};base64,${p.audioBase64}`}
                        controls
                        className="h-8 flex-1 min-w-0"
                      />
                      <button
                        onClick={() => confirmVoice(p)}
                        disabled={otherBusy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium disabled:opacity-50 flex-shrink-0"
                        style={btnStyle}
                      >
                        {busy ? '확정 중...' : '이 목소리로 확정'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-gray-500 mb-2">일레븐랩스에서 제작한 보이스 ID를 붙여넣으세요.</p>
        <div className="flex gap-2">
          <input
            value={voiceIdInput}
            onChange={(e) => setVoiceIdInput(e.target.value)}
            placeholder="예: 21m00Tcm4TlvDq8ikWAM"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono"
            style={btnStyle}
          />
          <button
            onClick={saveVoiceId}
            disabled={savingVoice}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
            style={btnStyle}
          >
            {savingVoice ? '저장 중...' : '저장'}
          </button>
        </div>
        {voiceDupNames.length > 0 && (
          <p className="text-xs text-red-400 mt-2">⚠ 이 보이스 ID는 다른 캐릭터와 중복됩니다: {voiceDupNames.join(', ')}</p>
        )}

        {/* 음성 샘플 — 보이스 확정 후 버튼 하나로 일반·흥분 대사 생성 + TTS까지 */}
        <div className="mt-5 pt-4 border-t border-gray-800">
          <p className="text-xs font-semibold text-gray-300 mb-1">🔊 음성 샘플 (캐릭터 상세 버블)</p>
          <p className="text-[11px] text-gray-500 mb-3">
            버튼 하나로 <b className="text-gray-400">기본 / 흥분</b> 대사를 각각 생성하고, 위 보이스로 음성까지 만들어 저장합니다.
          </p>
          {!hasVoiceId && (
            <p className="text-xs text-amber-400 mb-2">⚠ 보이스 ID를 먼저 확정/저장해야 음성 생성이 가능합니다.</p>
          )}

          <button
            onClick={autoGenerateSamples}
            disabled={!hasVoiceId || autoSample.running || !!voiceSampleBusy.normal || !!voiceSampleBusy.aroused}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium disabled:opacity-50 w-full"
            style={btnStyle}
          >
            {autoSample.running ? `⏳ ${autoSample.step || '생성 중...'}` : '✨ 대사 생성 + 음성 생성 (기본·흥분 한 번에)'}
          </button>
          {autoSample.error && <p className="text-[11px] text-red-400 mt-2 break-words">⚠ {autoSample.error}</p>}

          {/* 결과 요약 */}
          <div className="mt-3 space-y-2">
            {[{ kind: 'normal', label: '기본' }, { kind: 'aroused', label: '흥분 (NSFW)' }].map(({ kind, label }) => {
              const sample = voiceSamples[kind]
              return (
                <div key={kind} className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400 flex-shrink-0 w-16">{label}</span>
                    {sample.audioUrl
                      ? <audio src={sample.audioUrl} controls className="h-8 flex-1 min-w-0" />
                      : <span className="text-[11px] text-gray-600">아직 음성 없음</span>}
                  </div>
                  {sample.text && <p className="text-[11px] text-gray-500 mt-1 break-words">{sample.text}</p>}
                </div>
              )
            })}
          </div>

          {/* 직접 수정 — 자동 생성 결과가 마음에 안 들 때만 펼쳐서 개별 처리 */}
          <details className="mt-3">
            <summary className="text-xs text-gray-400 cursor-pointer select-none">대사 직접 수정 · 개별 재생성</summary>
            <div className="space-y-4 mt-3">
              {[{ kind: 'normal', label: '기본' }, { kind: 'aroused', label: '흥분 (NSFW)' }].map(({ kind, label }) => {
                const busy = voiceSampleBusy[kind]
                const sample = voiceSamples[kind]
                return (
                  <div key={kind} className="border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{label}</span>
                      <button
                        onClick={() => generateSampleText(kind)}
                        disabled={!!busy || autoSample.running}
                        className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50"
                        style={btnStyle}
                      >
                        {busy === 'text' ? '생성 중...' : '✨ 대사 자동 생성'}
                      </button>
                    </div>
                    <textarea
                      value={sample.text}
                      onChange={(e) => setVoiceSamples((prev) => ({ ...prev, [kind]: { ...prev[kind], text: e.target.value } }))}
                      placeholder="샘플 대사"
                      rows={2}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2"
                      style={btnStyle}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => saveSample(kind, false)}
                        disabled={!!busy || autoSample.running}
                        className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                        style={btnStyle}
                      >
                        {busy === 'save' ? '저장 중...' : '텍스트만 저장'}
                      </button>
                      <button
                        onClick={() => saveSample(kind, true)}
                        disabled={!!busy || autoSample.running || !hasVoiceId}
                        className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                        style={btnStyle}
                      >
                        {busy === 'tts' ? 'TTS 생성 중...' : '🔊 저장 + 음성 생성'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </details>
        </div>
      </Section>

      {/* 2. 표정 영상 일괄 등록 (Gemini 자동 분류) */}
      <Section title="2. 표정 영상 일괄 등록">
        <p className="text-xs text-gray-500 mb-3">
          영상(mp4/webm)을 여러 개 올리면 Gemini가 0/중간/끝 프레임을 읽어 감정별로 자동 분류·등록합니다. 오분류된 항목은 아래 슬롯에서 지우고 다시 올리면 됩니다.
        </p>

        {/* 분류 범위 */}
        <div className="flex gap-2 mb-3">
          {[{ key: 'sfw', label: '일반 (SFW 5종)' }, { key: 'nsfw', label: '흥분 (NSFW 8종)' }].map((s) => (
            <button
              key={s.key}
              onClick={() => setBulkScope(s.key)}
              disabled={bulkStarted && bulkRunning}
              className={`px-3 py-1.5 text-xs rounded-md ${bulkScope === s.key ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'} disabled:opacity-50`}
              style={btnStyle}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* 드롭존 */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!bulkDrag) setBulkDrag(true) }}
          onDragLeave={() => setBulkDrag(false)}
          onDrop={(e) => { e.preventDefault(); setBulkDrag(false); addBulkFiles(e.dataTransfer?.files) }}
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'; input.accept = 'video/mp4,video/webm'; input.multiple = true
            input.onchange = (e) => addBulkFiles(e.target.files)
            input.click()
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition ${bulkDrag ? 'border-emerald-400 bg-emerald-500/10' : 'border-gray-700 hover:border-gray-600'}`}
        >
          <p className="text-xs text-gray-300">영상(mp4/webm)을 여기로 드래그하거나 클릭해서 선택</p>
          <p className="text-[10px] text-gray-500 mt-1">여러 개 한 번에 · 개당 최대 20MB</p>
        </div>

        {/* 선택된 파일 목록 + 실행 */}
        {bulkFiles.length > 0 && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {bulkFiles.map((f, i) => (
              <div key={`${f.name}_${i}`} className="flex items-center justify-between text-[11px] text-gray-300 bg-gray-800/60 rounded px-2 py-1">
                <span className="truncate">{f.name}</span>
                <button onClick={() => removeBulkFile(i)} className="text-gray-500 hover:text-rose-300 ml-2" style={btnStyle}>✕</button>
              </div>
            ))}
          </div>
        )}
        {bulkFiles.length > 0 && (
          <button
            onClick={submitBulk}
            disabled={bulkRunning}
            className="mt-3 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-50"
            style={btnStyle}
          >
            {bulkRunning ? '분류·업로드 중...' : `${bulkFiles.length}개 업로드 & 자동 분류`}
          </button>
        )}

        {/* 진행 상황 */}
        {bulkStarted && bulkItems.length > 0 && (
          <div className="mt-4">
            {/* 실패 항목 일괄 재시도 */}
            {(() => {
              const failed = bulkItems.filter((it) => it.status === 'error' && it.file)
              if (failed.length === 0) return null
              return (
                <button
                  onClick={async () => {
                    for (let i = 0; i < bulkItems.length; i++) {
                      if (bulkItems[i]?.status === 'error' && bulkItems[i]?.file) await retryBulkItem(i)
                    }
                  }}
                  disabled={bulkRunning}
                  className="mb-2 px-3 py-1.5 rounded-md bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium disabled:opacity-50"
                  style={btnStyle}
                >
                  🔄 실패 {failed.length}개 모두 재시도
                </button>
              )
            })()}
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {bulkItems.map((it, i) => (
                <div key={`${it.name}_${i}`} className="flex items-center justify-between text-[11px] bg-gray-800/60 rounded px-2 py-1">
                  <span className="truncate text-gray-300 min-w-0">{it.name}</span>
                  <span className="ml-2 flex-shrink-0 flex items-center gap-2">
                    {it.status === 'done' && (
                      <span className="text-emerald-300">
                        {emotionLabel(it.emotion)}
                        {typeof it.confidence === 'number' && <span className="text-gray-500"> · {Math.round(it.confidence * 100)}%</span>}
                      </span>
                    )}
                    {it.status === 'processing' && <span className="text-amber-300">분류 중…</span>}
                    {it.status === 'pending' && <span className="text-gray-600">대기</span>}
                    {it.status === 'error' && (
                      <>
                        <span className="text-rose-400 truncate max-w-[140px]">{it.error}</span>
                        {it.file && (
                          <button
                            onClick={() => retryBulkItem(i)}
                            disabled={bulkRunning}
                            className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 flex-shrink-0"
                            style={btnStyle}
                          >
                            재시도
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 현재 등록된 표정 (감정별) */}
        <div className="mt-5">
          <p className="text-xs font-semibold text-gray-400 mb-2">현재 등록된 표정</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SFW_EMOTIONS.map((emo) => (
              <EmotionCell key={emo.key} emo={emo} images={imagesFor(emo.key)} onRemove={removeImage} />
            ))}
          </div>
          <details className="mt-3">
            <summary className="text-xs text-gray-400 cursor-pointer select-none">흥분 표정 (NSFW)</summary>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {NSFW_EMOTIONS.map((emo) => (
                <EmotionCell key={emo.key} emo={emo} images={imagesFor(emo.key)} onRemove={removeImage} />
              ))}
            </div>
          </details>
        </div>
      </Section>

      {/* 3. 프로필 이미지 */}
      <Section title="3. 프로필 이미지">
        <div className="max-w-[220px]">
          <CharImageCell
            label="프로필 이미지 (9:16)"
            url={character.profileImage}
            aspectClass="aspect-[9/16]"
            uploading={uploadingImage === 'profile'}
            dragOver={dragImage === 'profile'}
            onDragOver={() => setDragImage('profile')}
            onDragLeave={() => setDragImage(null)}
            onDrop={(file) => { setDragImage(null); uploadCharImage('profile', file) }}
            onPick={() => triggerCharImageUpload('profile')}
            onRemove={character.profileImage ? () => removeCharImage('profile') : null}
          />
        </div>
      </Section>

      {/* 4. 공개 전환 */}
      <Section title="4. 공개 전환">
        {!allReady && (
          <p className="text-xs text-amber-400 mb-3">준비도 체크리스트가 완료되지 않았습니다. 공개는 가능하지만 확인 후 진행됩니다.</p>
        )}
        {/* 현재 예약 상태 안내 */}
        {status !== 'PUBLISHED' && character.scheduledPublishAt && (
          <div className="mb-3 flex items-center gap-3 flex-wrap p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <span className="text-sm text-purple-200">📅 <strong>{formatKstDateFull(character.scheduledPublishAt)}</strong> 공개 예약됨</span>
            <button
              onClick={cancelReservation}
              disabled={statusBusy}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
              style={btnStyle}
            >
              예약 취소
            </button>
          </div>
        )}
        <div className="flex gap-2 flex-wrap items-end">
          {status !== 'PUBLISHED' && (
            <button
              onClick={() => setStatus('PUBLISHED')}
              disabled={statusBusy}
              className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold disabled:opacity-50"
              style={btnStyle}
            >
              🚀 바로 공개하기
            </button>
          )}
          {status !== 'PUBLISHED' && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-medium text-purple-300">{earliestSlot.n}일 뒤 출시</span>
              <button
                onClick={() => reserveRelease(earliestSlot.iso)}
                disabled={statusBusy || !earliestSlot.iso}
                title={earliestSlot.iso ? `${formatKstDateFull(earliestSlot.iso)} 공개 예약` : ''}
                className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-semibold disabled:opacity-50"
                style={btnStyle}
              >
                🗓️ 예약하기
              </button>
            </div>
          )}
          {status !== 'IN_PRODUCTION' && (
            <button
              onClick={() => setStatus('IN_PRODUCTION')}
              disabled={statusBusy}
              className="px-4 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-sm font-medium disabled:opacity-50"
              style={btnStyle}
            >
              제작중으로
            </button>
          )}
          {status !== 'HIDDEN' && (
            <button
              onClick={() => setStatus('HIDDEN')}
              disabled={statusBusy}
              className="px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50"
              style={btnStyle}
            >
              비공개로 숨기기
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  )
}

// 감정 key → 한글 라벨 (SFW+NSFW)
const EMOTION_LABELS = Object.fromEntries([...SFW_EMOTIONS, ...NSFW_EMOTIONS].map((e) => [e.key, e.label]))
const emotionLabel = (key) => EMOTION_LABELS[key] || key

// 복사 가능한 텍스트 필드 (보이스 프롬프트용)
function CopyField({ label, text, copied, onCopy }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-400">{label}</span>
        <button
          onClick={onCopy}
          className={`text-[11px] px-2 py-0.5 rounded ${copied ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
          style={btnStyle}
        >
          {copied ? '복사됨 ✓' : '복사'}
        </button>
      </div>
      <div className="text-xs text-gray-200 bg-gray-800/70 border border-gray-700 rounded px-2 py-1.5 whitespace-pre-wrap break-words select-text">
        {text}
      </div>
    </div>
  )
}

// 표정 표시 셀 — 감정별 등록된 이미지/영상 썸네일 + 개별 삭제 (업로드는 상단 일괄 영상 분류로).
function EmotionCell({ emo, images, onRemove }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-300">{emo.label}</span>
        <span className={`text-[11px] ${images.length > 0 ? 'text-green-400' : 'text-gray-500'}`}>{images.length}장</span>
      </div>
      {images.length === 0 ? (
        <p className="text-[11px] text-gray-600 py-2 text-center">없음</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {images.map((img) => (
            <div key={img.id} className="relative w-12 h-12 rounded overflow-hidden bg-gray-800 group">
              {isVideoUrl(img.videoFilePath || img.filePath) ? (
                <video src={img.videoFilePath || img.filePath} muted className="w-full h-full object-cover" />
              ) : (
                <img src={img.filePath} alt="" className="w-full h-full object-cover" />
              )}
              <button
                onClick={() => onRemove(img.id)}
                className="absolute top-0 right-0 bg-black/70 text-red-300 text-[10px] w-4 h-4 leading-none opacity-0 group-hover:opacity-100"
                style={btnStyle}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CharImageCell({ label, url, uploading, dragOver, onDragOver, onDragLeave, onDrop, onPick, onRemove, aspectClass = 'aspect-square' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-[11px] text-red-400 hover:text-red-300" style={btnStyle}>삭제</button>
        )}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); onDragOver() }}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); onDrop(e.dataTransfer.files[0]) }}
        onClick={onPick}
        className={`${aspectClass} rounded-lg border-2 border-dashed cursor-pointer flex items-center justify-center overflow-hidden transition-colors ${dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}
      >
        {uploading ? (
          <span className="text-xs text-gray-400">업로드 중...</span>
        ) : url ? (
          isVideoUrl(url)
            ? <video src={url} muted loop autoPlay className="w-full h-full object-cover" />
            : <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-gray-500">클릭 또는 드래그</span>
        )}
      </div>
    </div>
  )
}
