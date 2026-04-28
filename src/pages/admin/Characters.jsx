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

const EMPTY_FORM = {
  name: '',
  description: '',
  concept: '',
  personality: '',
  firstMessage: '',
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
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  const openEdit = (c) => {
    setForm({
      name: c.name,
      description: c.description,
      concept: c.concept || '',
      personality: c.personality,
      firstMessage: c.firstMessage,
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
    setEditing(c)
  }

  const save = async () => {
    const data = {
      ...form,
      tags: [
        ...form.tags,
        ...form.customTags.split(',').map((t) => t.trim()).filter(Boolean),
      ],
      proactiveMinInterval: form.proactiveMinInterval * 60,  // 분 → 초
      proactiveMaxInterval: form.proactiveMaxInterval * 60,  // 분 → 초
      proactiveProbability: form.proactiveProbability / 100, // % → 0~1
      proactiveMaxCount: form.proactiveMaxCount,
      voiceId: form.voiceId.trim() || null,
    }

    if (editing === 'new') {
      await api.post('/admin/characters', data)
    } else {
      await api.put(`/admin/characters/${editing.id}`, data)
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
                        onClick={() => navigate(`/admin/characters/${c.id}/gallery`)}
                        className="text-pink-400 hover:text-pink-300 text-xs"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        갤러리
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
                <label className="text-sm text-gray-400 block mb-1">첫 대사</label>
                <textarea
                  value={form.firstMessage}
                  onChange={(e) => setForm({ ...form, firstMessage: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                  placeholder="대화 시작 시 캐릭터의 첫 메시지"
                />
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

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={save}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
