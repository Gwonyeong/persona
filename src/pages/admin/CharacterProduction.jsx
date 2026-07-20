import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../../lib/api'

// 제작중 캐릭터 완성 워크스페이스 — voiceId · 표정 일괄 등록 · 음성 샘플 · 프로필/홈 이미지 · 공개 전환을
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

const STATUS_LABEL = {
  IN_PRODUCTION: { label: '제작중', cls: 'bg-cyan-500/15 text-cyan-300' },
  PUBLISHED: { label: '공개', cls: 'bg-green-500/15 text-green-400' },
  HIDDEN: { label: '비공개', cls: 'bg-gray-600/40 text-gray-300' },
}

const btnStyle = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

export default function CharacterProduction() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [allCharacters, setAllCharacters] = useState([])
  const [character, setCharacter] = useState(null)

  const [voiceIdInput, setVoiceIdInput] = useState('')
  const [savingVoice, setSavingVoice] = useState(false)
  const [copied, setCopied] = useState(null) // 'desc' | 'sample'

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
    setBulkItems(bulkFiles.map((f) => ({ name: f.name, status: 'pending', emotion: null, confidence: null, error: null })))
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

  const status = character.productionStatus || (character.isPublic ? 'PUBLISHED' : 'HIDDEN')
  const statusMeta = STATUS_LABEL[status] || STATUS_LABEL.HIDDEN

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

      {/* 1. voiceId */}
      <Section title="1. 보이스 ID (ElevenLabs)">
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
            <p className="text-[11px] text-gray-500 mt-1">이 둘을 ElevenLabs Voice Design에 붙여넣어 보이스를 만들고, 생성된 voiceId를 아래에 입력하세요.</p>
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
          <div className="mt-4 space-y-1 max-h-56 overflow-y-auto">
            {bulkItems.map((it, i) => (
              <div key={`${it.name}_${i}`} className="flex items-center justify-between text-[11px] bg-gray-800/60 rounded px-2 py-1">
                <span className="truncate text-gray-300 min-w-0">{it.name}</span>
                <span className="ml-2 flex-shrink-0">
                  {it.status === 'done' && (
                    <span className="text-emerald-300">
                      {emotionLabel(it.emotion)}
                      {typeof it.confidence === 'number' && <span className="text-gray-500"> · {Math.round(it.confidence * 100)}%</span>}
                    </span>
                  )}
                  {it.status === 'processing' && <span className="text-amber-300">분류 중…</span>}
                  {it.status === 'pending' && <span className="text-gray-600">대기</span>}
                  {it.status === 'error' && <span className="text-rose-400">{it.error}</span>}
                </span>
              </div>
            ))}
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

      {/* 3. 음성 샘플 */}
      <Section title="3. 음성 샘플">
        {!hasVoiceId && (
          <p className="text-xs text-amber-400 mb-3">⚠ 보이스 ID를 먼저 등록해야 TTS 생성이 가능합니다.</p>
        )}
        <div className="space-y-4">
          {[{ kind: 'normal', label: '기본' }, { kind: 'aroused', label: '흥분 (NSFW)' }].map(({ kind, label }) => {
            const busy = voiceSampleBusy[kind]
            const sample = voiceSamples[kind]
            return (
              <div key={kind} className="border border-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{label}</span>
                  <button
                    onClick={() => generateSampleText(kind)}
                    disabled={!!busy}
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
                    disabled={!!busy}
                    className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                    style={btnStyle}
                  >
                    {busy === 'save' ? '저장 중...' : '텍스트만 저장'}
                  </button>
                  <button
                    onClick={() => saveSample(kind, true)}
                    disabled={!!busy || !hasVoiceId}
                    className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                    style={btnStyle}
                  >
                    {busy === 'tts' ? 'TTS 생성 중...' : '🔊 저장 + 음성 생성'}
                  </button>
                  {sample.audioUrl && <audio src={sample.audioUrl} controls className="h-8" />}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 4. 프로필 / 홈 이미지 */}
      <Section title="4. 프로필 / 홈 이미지">
        <div className="grid grid-cols-2 gap-4">
          <CharImageCell
            label="프로필 이미지"
            url={character.profileImage}
            uploading={uploadingImage === 'profile'}
            dragOver={dragImage === 'profile'}
            onDragOver={() => setDragImage('profile')}
            onDragLeave={() => setDragImage(null)}
            onDrop={(file) => { setDragImage(null); uploadCharImage('profile', file) }}
            onPick={() => triggerCharImageUpload('profile')}
            onRemove={character.profileImage ? () => removeCharImage('profile') : null}
          />
          <CharImageCell
            label="홈 이미지 (선택)"
            url={character.homeImage}
            uploading={uploadingImage === 'home'}
            dragOver={dragImage === 'home'}
            onDragOver={() => setDragImage('home')}
            onDragLeave={() => setDragImage(null)}
            onDrop={(file) => { setDragImage(null); uploadCharImage('home', file) }}
            onPick={() => triggerCharImageUpload('home')}
            onRemove={character.homeImage ? () => removeCharImage('home') : null}
          />
        </div>
      </Section>

      {/* 5. 공개 전환 */}
      <Section title="5. 공개 전환">
        {!allReady && (
          <p className="text-xs text-amber-400 mb-3">준비도 체크리스트가 완료되지 않았습니다. 공개는 가능하지만 확인 후 진행됩니다.</p>
        )}
        <div className="flex gap-2 flex-wrap">
          {status !== 'PUBLISHED' && (
            <button
              onClick={() => setStatus('PUBLISHED')}
              disabled={statusBusy}
              className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold disabled:opacity-50"
              style={btnStyle}
            >
              🚀 공개하기
            </button>
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

function CharImageCell({ label, url, uploading, dragOver, onDragOver, onDragLeave, onDrop, onPick, onRemove }) {
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
        className={`aspect-square rounded-lg border-2 border-dashed cursor-pointer flex items-center justify-center overflow-hidden transition-colors ${dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}
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
