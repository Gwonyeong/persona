import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }
const MAX_ROLES = 4
const LANGS = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
]

function emptyForm() {
  return {
    id: null,
    emoji: '',
    safety: 'SFW',
    status: 'DRAFT',
    order: 0,
    minRoles: 2,
    defaultLocation: '',
    userAddress: '',
    // ko(base)
    title: '',
    summary: '',
    relationFraming: '',
    roles: [
      { name: '', description: '', free: false, userAddress: '', memorySlots: 10 },
      { name: '', description: '', free: false, userAddress: '', memorySlots: 10 },
    ],
    // 번역
    tr: {
      en: { title: '', summary: '', relationFraming: '', userAddress: '', roles: [] },
      ja: { title: '', summary: '', relationFraming: '', userAddress: '', roles: [] },
    },
  }
}

function hydrateForm(c) {
  const roles = Array.isArray(c.roles) ? c.roles : []
  const trOf = (lang) => {
    const t = (c.translations && c.translations[lang]) || {}
    const trRoles = Array.isArray(t.roles) ? t.roles : []
    return {
      title: t.title || '',
      summary: t.summary || '',
      relationFraming: t.relationFraming || '',
      userAddress: t.userAddress || '',
      roles: roles.map((_, i) => ({ name: trRoles[i]?.name || '', description: trRoles[i]?.description || '', userAddress: trRoles[i]?.userAddress || '' })),
    }
  }
  return {
    id: c.id,
    emoji: c.emoji || '',
    safety: c.safety || 'SFW',
    status: c.status || 'DRAFT',
    order: c.order || 0,
    minRoles: c.minRoles || 2,
    defaultLocation: c.defaultLocation || '',
    userAddress: c.userAddress || '',
    title: c.title || '',
    summary: c.summary || '',
    relationFraming: c.relationFraming || '',
    roles: roles.map((r) => ({ name: r.name || '', description: r.description || '', free: !!r.free, userAddress: r.userAddress || '', memorySlots: r.memorySlots || 10 })),
    tr: { en: trOf('en'), ja: trOf('ja') },
  }
}

export default function AdminGroupConcepts() {
  const [concepts, setConcepts] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [langTab, setLangTab] = useState('ko')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/admin/group-concepts')
      .then(({ concepts }) => setConcepts(concepts || []))
      .catch(() => setError('불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm(emptyForm()); setLangTab('ko'); setError(null) }
  const openEdit = (c) => { setForm(hydrateForm(c)); setLangTab('ko'); setError(null) }
  const closeForm = () => setForm(null)

  const setBase = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setTr = (lang, patch) => setForm((f) => ({ ...f, tr: { ...f.tr, [lang]: { ...f.tr[lang], ...patch } } }))

  const addRole = () => setForm((f) => {
    if (f.roles.length >= MAX_ROLES) return f
    return {
      ...f,
      roles: [...f.roles, { name: '', description: '', free: false, userAddress: '', memorySlots: 10 }],
      tr: {
        en: { ...f.tr.en, roles: [...f.tr.en.roles, { name: '', description: '', userAddress: '' }] },
        ja: { ...f.tr.ja, roles: [...f.tr.ja.roles, { name: '', description: '', userAddress: '' }] },
      },
    }
  })
  const removeRole = (idx) => setForm((f) => {
    if (f.roles.length <= 2) return f
    return {
      ...f,
      roles: f.roles.filter((_, i) => i !== idx),
      minRoles: Math.min(f.minRoles, f.roles.length - 1),
      tr: {
        en: { ...f.tr.en, roles: f.tr.en.roles.filter((_, i) => i !== idx) },
        ja: { ...f.tr.ja, roles: f.tr.ja.roles.filter((_, i) => i !== idx) },
      },
    }
  })
  const setRole = (idx, patch) => setForm((f) => ({
    ...f,
    roles: f.roles.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
  }))
  const setTrRole = (lang, idx, patch) => setForm((f) => ({
    ...f,
    tr: {
      ...f.tr,
      [lang]: {
        ...f.tr[lang],
        roles: f.tr[lang].roles.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
      },
    },
  }))

  const buildPayload = () => {
    const roles = form.roles.map((r, i) => ({
      key: `role${i + 1}`,
      name: r.name.trim(),
      description: r.description.trim(),
      userAddress: (r.userAddress || '').trim(),
      memorySlots: Number(r.memorySlots) || 10,
      free: !!r.free,
    }))
    const trLang = (lang) => {
      const t = form.tr[lang]
      const hasAny = t.title || t.summary || t.relationFraming || t.userAddress || t.roles.some((r) => r.name || r.description || r.userAddress)
      if (!hasAny) return null
      return {
        title: t.title.trim(),
        summary: t.summary.trim(),
        relationFraming: t.relationFraming.trim(),
        userAddress: (t.userAddress || '').trim(),
        roles: roles.map((r, i) => ({ key: r.key, name: (t.roles[i]?.name || '').trim(), description: (t.roles[i]?.description || '').trim(), userAddress: (t.roles[i]?.userAddress || '').trim() })),
      }
    }
    const translations = {}
    const en = trLang('en'); if (en) translations.en = en
    const ja = trLang('ja'); if (ja) translations.ja = ja
    return {
      emoji: form.emoji.trim() || null,
      safety: form.safety,
      status: form.status,
      order: Number(form.order) || 0,
      minRoles: Number(form.minRoles) || 2,
      defaultLocation: form.defaultLocation.trim() || null,
      userAddress: form.userAddress.trim() || null,
      title: form.title.trim(),
      summary: form.summary.trim() || null,
      relationFraming: form.relationFraming.trim(),
      roles,
      translations: Object.keys(translations).length ? translations : null,
    }
  }

  const save = async () => {
    setError(null)
    if (!form.title.trim()) { setError('제목을 입력하세요'); return }
    if (!form.relationFraming.trim()) { setError('관계 프레이밍을 입력하세요'); return }
    if (form.roles.filter((r) => r.name.trim()).length < 2) { setError('배역을 2개 이상 입력하세요'); return }
    setSaving(true)
    try {
      const payload = buildPayload()
      if (form.id) await api.put(`/admin/group-concepts/${form.id}`, payload)
      else await api.post('/admin/group-concepts', payload)
      closeForm()
      load()
    } catch (err) {
      setError(err.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c) => {
    if (!window.confirm(`"${c.title}" 컨셉을 삭제할까요? (기존 방은 유지됩니다)`)) return
    try {
      await api.delete(`/admin/group-concepts/${c.id}`)
      load()
    } catch (err) {
      alert(err.message || '삭제 실패')
    }
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none'

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">단톡방 상황극 컨셉</h1>
          <p className="text-sm text-gray-500 mt-0.5">여자친구/며느리/아이돌 등 상황을 만들고 배역을 정의합니다. 유저가 배역에 캐릭터를 캐스팅합니다.</p>
        </div>
        {!form && (
          <button onClick={openNew} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold" style={NO_OUTLINE}>
            + 새 컨셉
          </button>
        )}
      </div>

      {/* 목록 */}
      {!form && (
        loading ? (
          <p className="text-gray-500 text-sm">불러오는 중...</p>
        ) : concepts.length === 0 ? (
          <p className="text-gray-500 text-sm">아직 컨셉이 없습니다. "+ 새 컨셉"으로 만들어보세요.</p>
        ) : (
          <div className="space-y-2">
            {concepts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
                <span className="text-xl">{c.emoji || '🎬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm truncate">{c.title}</span>
                    {c.safety === 'NSFW' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">19</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.status === 'PUBLISHED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>
                      {c.status === 'PUBLISHED' ? '게시됨' : '초안'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    배역 {Array.isArray(c.roles) ? c.roles.length : 0}: {(c.roles || []).map((r) => r.name).join(', ')}
                  </p>
                  {/* 이 컨셉으로 개설된 단톡방 수 — 컨셉별 실사용량 */}
                  <p className="text-xs mt-0.5">
                    <span className="text-gray-500">개설된 방 </span>
                    <span className={(c._count?.groupChats || 0) > 0 ? 'text-indigo-300 font-medium' : 'text-gray-600'}>
                      {(c._count?.groupChats || 0).toLocaleString()}
                    </span>
                  </p>
                </div>
                <button onClick={() => openEdit(c)} className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs" style={NO_OUTLINE}>수정</button>
                <button onClick={() => remove(c)} className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 text-xs" style={NO_OUTLINE}>삭제</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* 편집 폼 */}
      {form && (
        <div className="space-y-4">
          {/* 공통 설정 */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400">
              이모지
              <input value={form.emoji} onChange={(e) => setBase({ emoji: e.target.value })} placeholder="🎬" className={inputCls + ' mt-1'} />
            </label>
            <label className="text-xs text-gray-400">
              정렬 순서
              <input type="number" value={form.order} onChange={(e) => setBase({ order: e.target.value })} className={inputCls + ' mt-1'} />
            </label>
            <label className="text-xs text-gray-400">
              수위
              <select value={form.safety} onChange={(e) => setBase({ safety: e.target.value })} className={inputCls + ' mt-1'}>
                <option value="SFW">SFW</option>
                <option value="NSFW">NSFW (성인 인증 필요)</option>
              </select>
            </label>
            <label className="text-xs text-gray-400">
              상태
              <select value={form.status} onChange={(e) => setBase({ status: e.target.value })} className={inputCls + ' mt-1'}>
                <option value="DRAFT">초안</option>
                <option value="PUBLISHED">게시</option>
              </select>
            </label>
            <label className="text-xs text-gray-400">
              최소 배역 수 (캐스팅 필수)
              <input type="number" min={2} max={form.roles.length} value={form.minRoles} onChange={(e) => setBase({ minRoles: e.target.value })} className={inputCls + ' mt-1'} />
            </label>
            <label className="col-span-2 text-xs text-gray-400">
              첫 장면 장소
              <input value={form.defaultLocation} onChange={(e) => setBase({ defaultLocation: e.target.value })} placeholder="집 / 연습실 (비우면 '집')" className={inputCls + ' mt-1'} />
              <span className="block text-[11px] text-gray-500 mt-1">상황극 방은 항상 유저와 <b>같은 공간(대면)</b>에서 시작합니다 — 첫 장면이 "유저가 이 장소에 도착/귀가해 캐릭터들과 마주함"으로 열립니다.</span>
            </label>
          </div>

          {/* 언어 탭 */}
          <div className="flex gap-1 border-b border-gray-800">
            {LANGS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLangTab(l.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${langTab === l.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                style={NO_OUTLINE}
              >
                {l.label}{l.key !== 'ko' && ' (선택)'}
              </button>
            ))}
          </div>

          {/* 언어별 필드 */}
          {langTab === 'ko' ? (
            <div className="space-y-3">
              <label className="block text-xs text-gray-400">컨셉명 *<input value={form.title} onChange={(e) => setBase({ title: e.target.value })} placeholder="아이돌 그룹" className={inputCls + ' mt-1'} /></label>
              <label className="block text-xs text-gray-400">카드 설명<textarea value={form.summary} onChange={(e) => setBase({ summary: e.target.value })} rows={2} placeholder="유저에게 보이는 짧은 소개" className={inputCls + ' mt-1 resize-none'} /></label>
              <label className="block text-xs text-gray-400">
                관계 프레이밍 (LLM 프롬프트) *
                <textarea value={form.relationFraming} onChange={(e) => setBase({ relationFraming: e.target.value })} rows={5} placeholder="이 톡방의 캐릭터들이 서로/유저와 어떤 관계인지, 어떤 상황인지를 서술. 기본 '라이벌' 프레이밍을 대체합니다." className={inputCls + ' mt-1 resize-none'} />
              </label>
              <label className="block text-xs text-gray-400">
                유저 호칭 (컨셉 기본)
                <input value={form.userAddress} onChange={(e) => setBase({ userAddress: e.target.value })} placeholder="예: 사장님 (배역별 호칭이 없으면 이 값 사용, 비우면 실명)" className={inputCls + ' mt-1'} />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs text-gray-400">Title<input value={form.tr[langTab].title} onChange={(e) => setTr(langTab, { title: e.target.value })} className={inputCls + ' mt-1'} /></label>
              <label className="block text-xs text-gray-400">Summary<textarea value={form.tr[langTab].summary} onChange={(e) => setTr(langTab, { summary: e.target.value })} rows={2} className={inputCls + ' mt-1 resize-none'} /></label>
              <label className="block text-xs text-gray-400">Relation framing<textarea value={form.tr[langTab].relationFraming} onChange={(e) => setTr(langTab, { relationFraming: e.target.value })} rows={5} className={inputCls + ' mt-1 resize-none'} /></label>
              <label className="block text-xs text-gray-400">User address<input value={form.tr[langTab].userAddress} onChange={(e) => setTr(langTab, { userAddress: e.target.value })} placeholder="e.g. Boss" className={inputCls + ' mt-1'} /></label>
            </div>
          )}

          {/* 배역 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-200">배역 ({form.roles.length}/{MAX_ROLES})</span>
              {form.roles.length < MAX_ROLES && (
                <button onClick={addRole} className="text-xs text-indigo-300 hover:text-indigo-200" style={NO_OUTLINE}>+ 배역 추가</button>
              )}
            </div>
            <div className="space-y-2">
              {form.roles.map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-gray-900 border border-gray-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300">#{i + 1}</span>
                    {langTab === 'ko' ? (
                      <>
                        <input value={r.name} onChange={(e) => setRole(i, { name: e.target.value })} placeholder="배역명 (예: 메인보컬)" className={inputCls} />
                        <label className="flex items-center gap-1 text-[11px] text-gray-400 whitespace-nowrap">
                          <input type="checkbox" checked={r.free} onChange={(e) => setRole(i, { free: e.target.checked })} /> 자유
                        </label>
                        {form.roles.length > 2 && (
                          <button onClick={() => removeRole(i)} className="text-red-400 hover:text-red-300 flex-shrink-0" style={NO_OUTLINE}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        )}
                      </>
                    ) : (
                      <input value={form.tr[langTab].roles[i]?.name || ''} onChange={(e) => setTrRole(langTab, i, { name: e.target.value })} placeholder={`${r.name || 'role'} name`} className={inputCls} />
                    )}
                  </div>
                  {langTab === 'ko' ? (
                    <>
                      <textarea value={r.description} onChange={(e) => setRole(i, { description: e.target.value })} rows={2} placeholder="이 배역의 LLM 연기 지침 (예: 그룹의 리더, 유저의 매니저를 챙긴다)" className={inputCls + ' resize-none'} />
                      <input value={r.userAddress || ''} onChange={(e) => setRole(i, { userAddress: e.target.value })} placeholder="이 배역이 유저를 부르는 호칭 (예: 여보 / 아빠 — 비우면 컨셉 기본 호칭)" className={inputCls} />
                      <label className="flex items-center gap-2 text-[11px] text-gray-400">
                        <span className="whitespace-nowrap">장기기억 슬롯</span>
                        <input type="number" min={1} max={100} value={r.memorySlots} onChange={(e) => setRole(i, { memorySlots: e.target.value })} className={inputCls + ' w-24'} />
                        <span className="text-gray-500">개 (기본 10 — 이 배역 캐릭터가 기억하는 최대 개수)</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <textarea value={form.tr[langTab].roles[i]?.description || ''} onChange={(e) => setTrRole(langTab, i, { description: e.target.value })} rows={2} placeholder="role description" className={inputCls + ' resize-none'} />
                      <input value={form.tr[langTab].roles[i]?.userAddress || ''} onChange={(e) => setTrRole(langTab, i, { userAddress: e.target.value })} placeholder="user address for this role" className={inputCls} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={closeForm} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium" style={NO_OUTLINE}>취소</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50" style={NO_OUTLINE}>
              {saving ? '저장 중...' : form.id ? '저장' : '생성'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
