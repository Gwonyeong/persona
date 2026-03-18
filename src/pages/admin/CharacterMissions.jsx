import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'

const EMPTY_FORM = {
  act: 1,
  order: 0,
  title: '',
  description: '',
  hint: '',
  aiInstruction: '',
  rewardMasks: 0,
}

export default function CharacterMissions() {
  const { id } = useParams()
  const [missions, setMissions] = useState([])
  const [character, setCharacter] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | mission object
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploading, setUploading] = useState(null) // missionId being uploaded
  const [dragOver, setDragOver] = useState(null) // missionId being dragged over

  const load = () => {
    api.get(`/admin/characters/${id}/missions`).then(({ missions }) => setMissions(missions))
  }

  useEffect(() => {
    load()
    api.get('/admin/characters').then(({ characters }) => {
      setCharacter(characters.find((c) => c.id === parseInt(id)))
    })
  }, [id])

  const openNew = (act = 1) => {
    setForm({ ...EMPTY_FORM, act })
    setEditing('new')
  }

  const openEdit = (m) => {
    setForm({
      act: m.act,
      order: m.order,
      title: m.title,
      description: m.description,
      hint: m.hint || '',
      aiInstruction: m.aiInstruction,
      rewardMasks: m.rewardMasks,
    })
    setEditing(m)
  }

  const save = async () => {
    const data = {
      ...form,
      act: parseInt(form.act),
      order: parseInt(form.order),
      rewardMasks: parseInt(form.rewardMasks),
    }

    if (editing === 'new') {
      await api.post(`/admin/characters/${id}/missions`, data)
    } else {
      await api.put(`/admin/missions/${editing.id}`, data)
    }

    setEditing(null)
    load()
  }

  const remove = async (missionId) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await api.delete(`/admin/missions/${missionId}`)
    load()
  }

  const uploadImage = async (missionId, file) => {
    setUploading(missionId)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/admin/missions/${missionId}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      })
      if (res.ok) load()
    } catch (e) {
      console.error('Image upload error:', e)
    }
    setUploading(null)
  }

  const handleDrop = (e, missionId) => {
    e.preventDefault()
    setDragOver(null)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) uploadImage(missionId, file)
  }

  const deleteImage = async (missionId) => {
    await api.delete(`/admin/missions/${missionId}/image`)
    load()
  }

  // ACT별 그룹핑
  const acts = {}
  missions.forEach((m) => {
    if (!acts[m.act]) acts[m.act] = []
    acts[m.act].push(m)
  })

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/admin/characters" className="text-gray-400 hover:text-white text-sm">
          ← 캐릭터 관리
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">{character?.name || '...'} — 미션 관리</h2>
        <button
          onClick={() => openNew()}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 새 미션
        </button>
      </div>

      {/* ACT별 미션 테이블 */}
      {Object.entries(acts)
        .sort(([a], [b]) => a - b)
        .map(([act, actMissions]) => (
          <div key={act} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-indigo-400">ACT {act}</h3>
              <button
                onClick={() => openNew(parseInt(act))}
                className="text-xs text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                + 추가
              </button>
            </div>
            <div className="bg-gray-900 rounded-lg border border-gray-800">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
                    <th className="p-3 w-12">순서</th>
                    <th className="p-3">제목</th>
                    <th className="p-3 w-20">이미지</th>
                    <th className="p-3 w-20">보상</th>
                    <th className="p-3 w-24">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {actMissions
                    .sort((a, b) => a.order - b.order)
                    .map((m) => (
                      <tr key={m.id} className="border-b border-gray-800/50 text-sm">
                        <td className="p-3 text-gray-500">{m.order}</td>
                        <td className="p-3">
                          <p className="font-medium">{m.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{m.description}</p>
                        </td>
                        <td className="p-3">
                          <label
                            className={`block w-16 h-16 rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                              dragOver === m.id
                                ? 'border-indigo-500 bg-indigo-500/10'
                                : m.imageUrl
                                ? 'border-transparent'
                                : 'border-gray-700 hover:border-gray-500'
                            }`}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(m.id) }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={(e) => handleDrop(e, m.id)}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files[0]) uploadImage(m.id, e.target.files[0])
                                e.target.value = ''
                              }}
                            />
                            {uploading === m.id ? (
                              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">...</div>
                            ) : m.imageUrl ? (
                              <img src={m.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              </div>
                            )}
                          </label>
                        </td>
                        <td className="p-3 text-yellow-400">{m.rewardMasks > 0 ? `+${m.rewardMasks}` : '-'}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEdit(m)}
                              className="text-indigo-400 hover:text-indigo-300 text-xs"
                              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                            >
                              수정
                            </button>
                            {m.imageUrl && (
                              <button
                                onClick={() => deleteImage(m.id)}
                                className="text-orange-400 hover:text-orange-300 text-xs"
                                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                              >
                                사진삭제
                              </button>
                            )}
                            <button
                              onClick={() => remove(m.id)}
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
            </div>
          </div>
        ))}

      {missions.length === 0 && (
        <p className="text-gray-500 text-sm">등록된 미션이 없습니다.</p>
      )}

      {/* 생성/수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-auto p-6">
            <h3 className="text-lg font-bold mb-4">
              {editing === 'new' ? '새 미션' : '미션 수정'}
            </h3>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm text-gray-400 block mb-1">ACT</label>
                  <select
                    value={form.act}
                    onChange={(e) => setForm({ ...form, act: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>ACT {n}</option>
                    ))}
                  </select>
                </div>
                <div className="w-20">
                  <label className="text-sm text-gray-400 block mb-1">순서</label>
                  <input
                    type="number"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-24">
                  <label className="text-sm text-gray-400 block mb-1">보상</label>
                  <input
                    type="number"
                    value={form.rewardMasks}
                    onChange={(e) => setForm({ ...form, rewardMasks: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">제목</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="미션 제목"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">설명 (유저에게 표시)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                  placeholder="미션에 대한 설명"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">힌트 (선택)</label>
                <input
                  value={form.hint}
                  onChange={(e) => setForm({ ...form, hint: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="유저에게 보여줄 힌트"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">AI 판정 기준 (유저 비공개)</label>
                <textarea
                  value={form.aiInstruction}
                  onChange={(e) => setForm({ ...form, aiInstruction: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-24 resize-none"
                  placeholder="AI가 미션 달성을 판정하는 기준을 상세히 작성"
                />
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
