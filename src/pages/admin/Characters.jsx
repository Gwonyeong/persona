import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

const EMPTY_FORM = {
  name: '',
  description: '',
  concept: '',
  personality: '',
  firstMessage: '',
  tags: '',
  initialAffinity: 0,
  followerCount: 0,
  followingCount: 0,
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
  const navigate = useNavigate()

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
      tags: c.tags.join(', '),
      initialAffinity: c.initialAffinity || 0,
      followerCount: c.followerCount || 0,
      followingCount: c.followingCount || 0,
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
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      proactiveMinInterval: form.proactiveMinInterval * 60,  // 분 → 초
      proactiveMaxInterval: form.proactiveMaxInterval * 60,  // 분 → 초
      proactiveProbability: form.proactiveProbability / 100, // % → 0~1
      proactiveMaxCount: form.proactiveMaxCount,
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">캐릭터 관리</h2>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 새 캐릭터
        </button>
      </div>

      {/* 캐릭터 목록 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {characters.length === 0 ? (
          <p className="p-4 text-gray-500">등록된 캐릭터가 없습니다.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">이름</th>
                <th className="p-3">태그</th>
                <th className="p-3">스타일</th>
                <th className="p-3">대화 수</th>
                <th className="p-3">공개</th>
                <th className="p-3">관리</th>
              </tr>
            </thead>
            <tbody>
              {characters.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 text-sm">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                        {(() => {
                          const img = c.styles?.[0]?.images?.find((i) => i.emotion === 'NEUTRAL')
                          return img?.filePath ? (
                            <img src={img.filePath} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
                          )
                        })()}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">{c.styles.length}개</td>
                  <td className="p-3">{c._count.conversations}</td>
                  <td className="p-3">
                    <span className={c.isPublic ? 'text-green-400' : 'text-gray-500'}>
                      {c.isPublic ? '공개' : '비공개'}
                    </span>
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
                <label className="text-sm text-gray-400 block mb-1">태그 (쉼표 구분)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="로맨스, 학원, 츤데레"
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
