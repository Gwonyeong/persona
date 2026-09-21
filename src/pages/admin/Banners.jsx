import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

const EMPTY_FORM = {
  title: '',
  linkUrl: '',
  sortOrder: 0,
  isActive: true,
  adultOnly: false,
}

// 'ko' = Banner.imageUrl (기본/폴백), 나머지는 Banner.translations[lang].imageUrl
const LANG_TABS = [
  { key: 'ko', label: '기본 (한국어)' },
  { key: 'ja', label: '日本語' },
  { key: 'en', label: 'English' },
]
const LOCALES = ['ja', 'en']

const emptyByLang = () => ({ ko: null, ja: null, en: null })

export default function Banners() {
  const [banners, setBanners] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | banner object
  const [form, setForm] = useState(EMPTY_FORM)
  const [imageFiles, setImageFiles] = useState(emptyByLang())
  const [imagePreviews, setImagePreviews] = useState(emptyByLang())
  const [removedLangs, setRemovedLangs] = useState([]) // 저장 시 번역 이미지를 지울 언어
  const [activeLang, setActiveLang] = useState('ko')
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  const load = () => {
    api.get('/admin/banners').then(({ banners }) => setBanners(banners))
  }

  useEffect(() => { load() }, [])

  const resetImageState = () => {
    setImageFiles(emptyByLang())
    setImagePreviews(emptyByLang())
    setRemovedLangs([])
    setActiveLang('ko')
    setDragOver(false)
  }

  const openNew = () => {
    setForm(EMPTY_FORM)
    resetImageState()
    setEditing('new')
  }

  const openEdit = (b) => {
    setForm({
      title: b.title || '',
      linkUrl: b.linkUrl || '',
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      adultOnly: !!b.adultOnly,
    })
    resetImageState()
    setEditing(b)
  }

  const close = () => {
    setEditing(null)
    resetImageState()
  }

  // 현재 탭에 저장되어 있는 이미지 URL (새로 고른 파일이 없을 때)
  const savedUrl = (lang) => {
    if (editing === 'new' || !editing) return null
    if (removedLangs.includes(lang)) return null
    return lang === 'ko' ? editing.imageUrl : editing.translations?.[lang]?.imageUrl || null
  }

  const baseUrl = imagePreviews.ko || savedUrl('ko')
  const currentUrl = imagePreviews[activeLang] || savedUrl(activeLang)
  const isFallback = activeLang !== 'ko' && !currentUrl

  const acceptFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageFiles((p) => ({ ...p, [activeLang]: file }))
    setImagePreviews((p) => ({ ...p, [activeLang]: URL.createObjectURL(file) }))
    setRemovedLangs((p) => p.filter((l) => l !== activeLang))
  }

  const onPickFile = (e) => {
    acceptFile(e.target.files?.[0])
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

  const removeCurrentLang = () => {
    setImageFiles((p) => ({ ...p, [activeLang]: null }))
    setImagePreviews((p) => ({ ...p, [activeLang]: null }))
    if (savedUrl(activeLang)) setRemovedLangs((p) => [...p, activeLang])
  }

  // 언어별 이미지 업로드/삭제를 한 배너에 반영
  const syncLocaleImages = async (bannerId) => {
    for (const lang of LOCALES) {
      if (imageFiles[lang]) {
        const fd = new FormData()
        fd.append('image', imageFiles[lang])
        await api.put(`/admin/banners/${bannerId}/image/${lang}`, fd)
      } else if (removedLangs.includes(lang)) {
        await api.delete(`/admin/banners/${bannerId}/image/${lang}`)
      }
    }
  }

  const save = async () => {
    if (editing === 'new' && !imageFiles.ko) {
      alert('기본 (한국어) 이미지를 선택해 주세요.')
      return
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        const fd = new FormData()
        fd.append('image', imageFiles.ko)
        if (form.title) fd.append('title', form.title)
        if (form.linkUrl) fd.append('linkUrl', form.linkUrl)
        fd.append('sortOrder', String(form.sortOrder))
        fd.append('isActive', String(form.isActive))
        fd.append('adultOnly', String(form.adultOnly))
        const { banner } = await api.post('/admin/banners', fd)
        await syncLocaleImages(banner.id)
      } else {
        await api.put(`/admin/banners/${editing.id}`, {
          title: form.title,
          linkUrl: form.linkUrl,
          sortOrder: parseInt(form.sortOrder) || 0,
          isActive: form.isActive,
          adultOnly: form.adultOnly,
        })
        if (imageFiles.ko) {
          const fd = new FormData()
          fd.append('image', imageFiles.ko)
          await api.put(`/admin/banners/${editing.id}/image`, fd)
        }
        await syncLocaleImages(editing.id)
      }
      close()
      load()
    } catch (e) {
      alert('저장 실패: ' + (e.message || ''))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await api.delete(`/admin/banners/${id}`)
    load()
  }

  const toggleActive = async (b) => {
    await api.put(`/admin/banners/${b.id}`, { isActive: !b.isActive })
    load()
  }

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">광고 배너 관리</h2>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 새 배너
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        활성화된 배너는 홈 검색바 위에 슬라이드 형태로 노출됩니다. 정렬 순서가 작은 것부터 표시됩니다.
        언어별 이미지를 등록하면 해당 언어 유저에게 그 이미지가, 없으면 기본 이미지가 나갑니다.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="admin-x-scroll">
        <table className="w-full text-sm min-w-[840px]">
          <thead className="bg-gray-800/50 text-gray-400 text-xs">
            <tr>
              <th className="text-left px-4 py-2 w-32">이미지</th>
              <th className="text-left px-4 py-2">제목</th>
              <th className="text-left px-4 py-2 w-28">언어</th>
              <th className="text-left px-4 py-2">링크</th>
              <th className="text-left px-4 py-2 w-20">순서</th>
              <th className="text-left px-4 py-2 w-20">활성</th>
              <th className="text-left px-4 py-2 w-20">대상</th>
              <th className="text-right px-4 py-2 w-32">작업</th>
            </tr>
          </thead>
          <tbody>
            {banners.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 py-10">
                  등록된 배너가 없습니다.
                </td>
              </tr>
            ) : (
              banners.map((b) => (
                <tr key={b.id} className="border-t border-gray-800">
                  <td className="px-4 py-2">
                    <img
                      src={b.imageUrl}
                      alt={b.title || ''}
                      className="w-24 h-14 object-cover rounded bg-gray-800"
                    />
                  </td>
                  <td className="px-4 py-2 text-gray-200">{b.title || <span className="text-gray-600">-</span>}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-300">KO</span>
                      {LOCALES.map((lang) =>
                        b.translations?.[lang]?.imageUrl ? (
                          <span
                            key={lang}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-600/20 text-sky-400 border border-sky-600/40"
                          >
                            {lang.toUpperCase()}
                          </span>
                        ) : null
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs truncate max-w-[240px]">
                    {b.linkUrl || <span className="text-gray-600">-</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-300">{b.sortOrder}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(b)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        b.isActive
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                          : 'bg-gray-700 text-gray-400 border border-gray-600'
                      }`}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {b.isActive ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    {b.adultOnly ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-rose-600/20 text-rose-400 border border-rose-600/40">
                        성인
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">전체</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => openEdit(b)}
                      className="text-indigo-400 hover:text-indigo-300 text-xs mr-3"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      편집
                    </button>
                    <button
                      onClick={() => remove(b.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {editing === 'new' ? '새 배너' : '배너 편집'}
              </h3>
              <button
                onClick={close}
                className="text-gray-500 hover:text-gray-300"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 이미지 — 언어 탭 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">이미지 (16:9 권장)</label>

                <div className="flex gap-1 mb-2">
                  {LANG_TABS.map((tab) => {
                    const has = !!(imagePreviews[tab.key] || savedUrl(tab.key))
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveLang(tab.key)}
                        className={`px-3 py-1.5 rounded text-xs font-medium border ${
                          activeLang === tab.key
                            ? 'bg-indigo-600/20 text-indigo-300 border-indigo-600/50'
                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {tab.label}
                        {has && <span className="ml-1.5 text-emerald-400">●</span>}
                      </button>
                    )
                  })}
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full bg-gray-800 border border-dashed rounded-lg overflow-hidden cursor-pointer relative ${
                    dragOver ? 'border-indigo-500 bg-indigo-950/30' : 'border-gray-700'
                  }`}
                  style={{ aspectRatio: '16 / 9' }}
                >
                  {currentUrl ? (
                    <img src={currentUrl} alt="" className="w-full h-full object-cover" />
                  ) : isFallback && baseUrl ? (
                    <>
                      <img src={baseUrl} alt="" className="w-full h-full object-cover opacity-30" />
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm text-center px-4">
                        이 언어는 기본 이미지로 나갑니다.
                        <br />
                        드래그하거나 클릭해서 전용 이미지를 올리세요.
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm text-center px-4">
                      이미지를 드래그하거나 클릭해서 선택하세요
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hidden"
                />

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-200"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {currentUrl ? '이미지 변경' : '이미지 선택'}
                  </button>
                  {activeLang !== 'ko' && currentUrl && (
                    <button
                      type="button"
                      onClick={removeCurrentLang}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-red-400"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      이 언어 이미지 제거
                    </button>
                  )}
                  {activeLang !== 'ko' && (
                    <span className="text-[11px] text-gray-500">
                      없으면 기본 이미지로 폴백
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">제목 (관리용)</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="예: 봄맞이 이벤트"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  클릭 시 이동할 링크 (선택)
                </label>
                <input
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  placeholder="/mask-shop?tab=subscription 또는 https://..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  / 로 시작하면 앱 내 라우트, 그 외에는 외부 URL로 새 탭에서 엽니다. 모든 언어가 같은 링크를 씁니다.
                </p>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1.5">정렬 순서</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1.5">노출</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                    className={`w-full px-3 py-2 rounded text-sm font-medium border ${
                      form.isActive
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-600/50'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {form.isActive ? '활성' : '비활성'}
                  </button>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1.5">대상</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, adultOnly: !form.adultOnly })}
                    className={`w-full px-3 py-2 rounded text-sm font-medium border ${
                      form.adultOnly
                        ? 'bg-rose-600/20 text-rose-300 border-rose-600/50'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {form.adultOnly ? '성인 전용' : '전체'}
                  </button>
                </div>
              </div>
              {form.adultOnly && (
                <p className="text-[11px] text-rose-400/80 -mt-2">
                  성인인증(19+)을 완료한 유저에게만 노출됩니다. 언어와 무관하게 모든 언어 이미지에 함께 적용됩니다.
                </p>
              )}
            </div>

            <div className="p-5 border-t border-gray-800 flex justify-end gap-2">
              <button
                onClick={close}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
