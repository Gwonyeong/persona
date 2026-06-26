import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'

export default function AdminSpecialVoices() {
  const [voices, setVoices] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCharId, setFilterCharId] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [{ voices }, { characters }] = await Promise.all([
        api.get(`/admin/gacha/special-voices${filterCharId ? `?characterId=${filterCharId}` : ''}`),
        api.get('/admin/characters'),
      ])
      setVoices(voices)
      setCharacters(characters)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [filterCharId])

  if (loading && !voices.length) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">특별 보이스 관리</h1>
        <Link to="/admin/gacha" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← 가챠로 돌아가기
        </Link>
      </div>

      <NewVoiceForm characters={characters} onCreated={load} />

      <div className="mt-6 mb-3 flex items-center gap-2">
        <span className="text-xs text-gray-400">캐릭터 필터:</span>
        <select
          value={filterCharId}
          onChange={(e) => setFilterCharId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <option value="">전체</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {voices.length === 0 && (
          <p className="text-gray-500 text-sm">등록된 특별 보이스가 없습니다.</p>
        )}
        {voices.map((v) => (
          <VoiceRow key={v.id} voice={v} onChanged={load} />
        ))}
      </div>
    </div>
  )
}

function NewVoiceForm({ characters, onCreated }) {
  const [characterId, setCharacterId] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [title, setTitle] = useState('')
  const [emotion, setEmotion] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!characterId || !audioUrl || !transcript) {
      alert('캐릭터, 오디오 URL, 자막은 필수입니다.')
      return
    }
    setSaving(true)
    try {
      await api.post('/admin/gacha/special-voices', {
        characterId: Number(characterId),
        audioUrl,
        transcript,
        title: title || null,
        emotion: emotion || null,
      })
      setCharacterId('')
      setAudioUrl('')
      setTranscript('')
      setTitle('')
      setEmotion('')
      onCreated()
    } catch (err) {
      alert('생성 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">새 특별 보이스 추가</h3>
      <p className="text-[11px] text-gray-500 mb-3">
        ElevenLabs 등으로 미리 만든 mp3 파일을 Supabase Storage에 올린 뒤 URL을 입력하세요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="">— 캐릭터 선택 —</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목 (선택)"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <input
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          placeholder="audio URL (mp3)"
          className="col-span-2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="자막 (필수)"
          rows={2}
          className="col-span-2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <input
          value={emotion}
          onChange={(e) => setEmotion(e.target.value)}
          placeholder="감정 라벨 (선택)"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <button
          disabled={saving}
          onClick={submit}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          추가
        </button>
      </div>
    </div>
  )
}

function VoiceRow({ voice, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    audioUrl: voice.audioUrl,
    transcript: voice.transcript,
    title: voice.title || '',
    emotion: voice.emotion || '',
  })

  const save = async () => {
    try {
      await api.put(`/admin/gacha/special-voices/${voice.id}`, {
        audioUrl: form.audioUrl,
        transcript: form.transcript,
        title: form.title || null,
        emotion: form.emotion || null,
      })
      setEditing(false)
      onChanged()
    } catch (err) {
      alert('저장 실패: ' + (err?.data?.error || err?.message))
    }
  }

  const remove = async () => {
    if (!confirm('삭제하시겠습니까?')) return
    await api.delete(`/admin/gacha/special-voices/${voice.id}`)
    onChanged()
  }

  if (editing) {
    return (
      <div className="bg-gray-900 border border-indigo-700/40 rounded-lg p-3 space-y-2">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="제목"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <input
          value={form.audioUrl}
          onChange={(e) => setForm({ ...form, audioUrl: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <textarea
          value={form.transcript}
          onChange={(e) => setForm({ ...form, transcript: e.target.value })}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <input
          value={form.emotion}
          onChange={(e) => setForm({ ...form, emotion: e.target.value })}
          placeholder="감정"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-white rounded"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            취소
          </button>
          <button
            onClick={save}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs text-white rounded"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            저장
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-300">
              {voice.character?.name || `Character#${voice.characterId}`}
            </span>
            {voice.title && <span className="text-sm text-white">{voice.title}</span>}
            {voice.emotion && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                {voice.emotion}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{voice.transcript}</p>
          <audio
            controls
            src={voice.audioUrl}
            className="mt-2 w-full max-w-md"
            style={{ height: 28 }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            편집
          </button>
          <button
            onClick={remove}
            className="text-xs text-red-400 hover:text-red-300"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}
