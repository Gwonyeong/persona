import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

const LINK_OPTIONS = [
  { value: '', label: '이동 없음' },
  { value: '/', label: '홈' },
  { value: '/feed', label: '피드' },
  { value: '/chats', label: '채팅 목록' },
  { value: '/my', label: '마이페이지' },
  { value: '/mask-shop?tab=subscription', label: '구독' },
  { value: '/mask-shop', label: '마스크 샵' },
  { value: '/feedback', label: '피드백' },
]

const STATUS_LABEL = {
  PENDING: { text: '대기', cls: 'bg-amber-600/20 text-amber-300 border-amber-600/40' },
  SENDING: { text: '발송 중', cls: 'bg-blue-600/20 text-blue-300 border-blue-600/40' },
  SENT: { text: '발송 완료', cls: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40' },
  FAILED: { text: '실패', cls: 'bg-red-600/20 text-red-300 border-red-600/40' },
  CANCELED: { text: '취소', cls: 'bg-gray-700 text-gray-400 border-gray-600' },
}

const EMPTY_FORM = {
  title: '',
  body: '',
  linkPath: '',
  scheduledAt: '',
}

function localToISO(local) {
  if (!local) return null
  const d = new Date(local)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function isoToLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatKST(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', { hour12: false })
}

const EMPTY_TR = {
  en: { title: '', body: '' },
  ja: { title: '', body: '' },
}

export default function Broadcasts() {
  const [broadcasts, setBroadcasts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [trForm, setTrForm] = useState(EMPTY_TR)
  const [trSaving, setTrSaving] = useState(false)
  const [retranslating, setRetranslating] = useState(false)
  const fileInputRef = useRef(null)

  const load = () => {
    api.get('/admin/broadcasts').then(({ broadcasts }) => setBroadcasts(broadcasts))
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setForm(EMPTY_FORM)
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(false)
    setEditing('new')
  }

  const openEdit = (b) => {
    setForm({
      title: b.title || '',
      body: b.body || '',
      linkPath: b.linkPath || '',
      scheduledAt: isoToLocal(b.scheduledAt),
    })
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(false)
    setTrForm({
      en: { title: b.translations?.en?.title || '', body: b.translations?.en?.body || '' },
      ja: { title: b.translations?.ja?.title || '', body: b.translations?.ja?.body || '' },
    })
    setEditing(b)
  }

  const close = () => {
    setEditing(null)
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(false)
    setTrForm(EMPTY_TR)
  }

  // 자동 번역 결과를 어드민 수정안으로 저장
  const saveTranslations = async () => {
    if (!editing || editing === 'new') return
    setTrSaving(true)
    try {
      const { broadcast } = await api.put(`/admin/broadcasts/${editing.id}/translations`, {
        translations: trForm,
      })
      setEditing(broadcast)
      load()
      alert('번역 저장 완료')
    } catch (e) {
      alert('번역 저장 실패: ' + (e.message || ''))
    } finally {
      setTrSaving(false)
    }
  }

  // 현재 한국어 원문으로 재번역
  const retranslate = async () => {
    if (!editing || editing === 'new') return
    if (!confirm('한국어 원문으로 다시 번역합니다. 기존 수정 내용이 덮어쓰입니다. 계속할까요?')) return
    setRetranslating(true)
    try {
      const { broadcast } = await api.post(`/admin/broadcasts/${editing.id}/retranslate`)
      setEditing(broadcast)
      setTrForm({
        en: { title: broadcast.translations?.en?.title || '', body: broadcast.translations?.en?.body || '' },
        ja: { title: broadcast.translations?.ja?.title || '', body: broadcast.translations?.ja?.body || '' },
      })
      load()
    } catch (e) {
      alert('재번역 실패: ' + (e.message || ''))
    } finally {
      setRetranslating(false)
    }
  }

  const onPickFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setRemoveImage(false)
  }

  const isReadOnly = editing && editing !== 'new' && editing.status !== 'PENDING'

  const save = async () => {
    if (!form.title.trim() || !form.body.trim() || !form.scheduledAt) {
      alert('제목, 본문, 발송 예약 시각을 모두 입력해 주세요.')
      return
    }
    const iso = localToISO(form.scheduledAt)
    if (!iso) {
      alert('발송 예약 시각이 올바르지 않습니다.')
      return
    }
    if (editing === 'new' && new Date(iso).getTime() < Date.now() - 60_000) {
      if (!confirm('예약 시각이 과거입니다. 다음 cron 실행 시 즉시 발송됩니다. 계속할까요?')) {
        return
      }
    }

    setSaving(true)
    try {
      let saved
      if (editing === 'new') {
        const fd = new FormData()
        fd.append('title', form.title)
        fd.append('body', form.body)
        if (form.linkPath) fd.append('linkPath', form.linkPath)
        fd.append('scheduledAt', iso)
        if (imageFile) fd.append('image', imageFile)
        const res = await api.post('/admin/broadcasts', fd)
        saved = res.broadcast
      } else {
        const res = await api.put(`/admin/broadcasts/${editing.id}`, {
          title: form.title,
          body: form.body,
          linkPath: form.linkPath,
          scheduledAt: iso,
        })
        saved = res.broadcast
        if (imageFile) {
          const fd = new FormData()
          fd.append('image', imageFile)
          const r = await api.put(`/admin/broadcasts/${editing.id}/image`, fd)
          saved = r.broadcast || saved
        } else if (removeImage && editing.imageUrl) {
          const r = await api.delete(`/admin/broadcasts/${editing.id}/image`)
          saved = r.broadcast || saved
        }
      }
      // 저장 후 모달 유지 → 번역 결과 미리보기/수정 가능
      if (saved) {
        setEditing(saved)
        setTrForm({
          en: { title: saved.translations?.en?.title || '', body: saved.translations?.en?.body || '' },
          ja: { title: saved.translations?.ja?.title || '', body: saved.translations?.ja?.body || '' },
        })
      }
      load()
    } catch (e) {
      alert('저장 실패: ' + (e.message || ''))
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (b) => {
    if (!confirm('이 알림 발송을 취소하시겠습니까?')) return
    try {
      await api.post(`/admin/broadcasts/${b.id}/cancel`)
      load()
    } catch (e) {
      alert('취소 실패: ' + (e.message || ''))
    }
  }

  const sendNow = async (b) => {
    if (!confirm(`"${b.title}" 알림을 지금 즉시 모든 유저에게 발송할까요?`)) return
    try {
      const { result } = await api.post(`/admin/broadcasts/${b.id}/send-now`)
      alert(`발송 완료\n대상: ${result.total ?? 0}\n성공: ${result.sent ?? 0}\n실패: ${result.failed ?? 0}`)
      load()
    } catch (e) {
      alert('발송 실패: ' + (e.message || ''))
    }
  }

  const remove = async (b) => {
    if (!confirm('정말 삭제하시겠습니까? 발송 기록도 함께 삭제됩니다.')) return
    try {
      await api.delete(`/admin/broadcasts/${b.id}`)
      load()
    } catch (e) {
      alert('삭제 실패: ' + (e.message || ''))
    }
  }

  // 어드민에게만 테스트 발송 (현재 폼의 내용으로)
  const sendTest = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      alert('제목과 본문을 먼저 입력해 주세요.')
      return
    }
    setTesting(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title)
      fd.append('body', form.body)
      if (form.linkPath) fd.append('linkPath', form.linkPath)
      if (imageFile) {
        fd.append('image', imageFile)
      } else if (editing && editing !== 'new' && editing.imageUrl && !removeImage) {
        fd.append('imageUrl', editing.imageUrl)
      }
      const { result, recipients } = await api.post('/admin/broadcasts/test', fd)
      alert(`테스트 발송 완료 (어드민 ${recipients}명)\n성공: ${result.sent ?? 0}\n실패: ${result.failed ?? 0}`)
    } catch (e) {
      alert('테스트 발송 실패: ' + (e.message || ''))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">푸시 알림 관리</h2>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          + 새 알림
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        예약된 알림은 매분 cron(/api/cron/proactive)이 도래한 시각의 PENDING 항목을 전체 유저에게 발송합니다.
        제작 후 어드민에게만 테스트 발송도 가능합니다.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50 text-gray-400 text-xs">
            <tr>
              <th className="text-left px-4 py-2 w-24">상태</th>
              <th className="text-left px-4 py-2 w-20">이미지</th>
              <th className="text-left px-4 py-2">제목 / 본문</th>
              <th className="text-left px-4 py-2 w-44">예약 시각</th>
              <th className="text-left px-4 py-2 w-32">결과</th>
              <th className="text-right px-4 py-2 w-44">작업</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-10">
                  등록된 알림이 없습니다.
                </td>
              </tr>
            ) : (
              broadcasts.map((b) => {
                const status = STATUS_LABEL[b.status] || STATUS_LABEL.PENDING
                return (
                  <tr key={b.id} className="border-t border-gray-800 align-top">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {b.imageUrl ? (
                        <img src={b.imageUrl} alt="" className="w-16 h-16 object-cover rounded bg-gray-800" />
                      ) : (
                        <div className="w-16 h-16 rounded bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 text-[10px]">
                          없음
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-100 font-medium">{b.title}</div>
                      <div className="text-gray-400 text-xs mt-1 line-clamp-2">{b.body}</div>
                      {b.linkPath && (
                        <div className="text-gray-500 text-[11px] mt-1">→ {b.linkPath}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      {formatKST(b.scheduledAt)}
                      {b.sentAt && (
                        <div className="text-gray-500 mt-1">발송: {formatKST(b.sentAt)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-300">
                      {b.status === 'SENT' || b.status === 'FAILED' ? (
                        <>
                          <div>대상 {b.totalCount}</div>
                          <div className="text-emerald-400">성공 {b.sentCount}</div>
                          {b.failedCount > 0 && (
                            <div className="text-red-400">실패 {b.failedCount}</div>
                          )}
                          {b.errorMessage && (
                            <div className="text-red-400 mt-1 truncate max-w-[180px]" title={b.errorMessage}>
                              {b.errorMessage}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {b.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => sendNow(b)}
                            className="text-emerald-400 hover:text-emerald-300 text-xs"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            즉시 발송
                          </button>
                          <button
                            onClick={() => openEdit(b)}
                            className="text-indigo-400 hover:text-indigo-300 text-xs"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            편집
                          </button>
                          <button
                            onClick={() => cancel(b)}
                            className="text-amber-400 hover:text-amber-300 text-xs"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            취소
                          </button>
                        </>
                      )}
                      {b.status !== 'PENDING' && b.status !== 'SENDING' && (
                        <button
                          onClick={() => openEdit(b)}
                          className="text-gray-400 hover:text-gray-200 text-xs"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          상세
                        </button>
                      )}
                      {b.status !== 'SENDING' && (
                        <button
                          onClick={() => remove(b)}
                          className="text-red-400 hover:text-red-300 text-xs"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {editing === 'new' ? '새 알림' : isReadOnly ? '알림 상세' : '알림 편집'}
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
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">이미지 (선택)</label>
                <div className="w-full bg-gray-800 border border-dashed border-gray-700 rounded-lg overflow-hidden aspect-square max-h-64 flex items-center justify-center">
                  {imagePreview || (editing !== 'new' && editing.imageUrl && !removeImage) ? (
                    <img
                      src={imagePreview || editing.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-600 text-sm">이미지 없음</div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hidden"
                />
                {!isReadOnly && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-200"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      이미지 선택
                    </button>
                    {(imagePreview || (editing !== 'new' && editing.imageUrl && !removeImage)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                          setRemoveImage(true)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-red-300"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        이미지 제거
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">제목</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  disabled={isReadOnly}
                  placeholder="예: 새로운 캐릭터를 만나보세요!"
                  maxLength={60}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">본문</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  disabled={isReadOnly}
                  placeholder="유저에게 보낼 메시지를 입력하세요"
                  rows={3}
                  maxLength={200}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none disabled:text-gray-500 resize-none"
                />
              </div>

              {/* 자동 번역 미리보기 + 수정 — 저장된 broadcast에만 노출 */}
              {editing && editing !== 'new' && (
                <div className="border border-gray-700 rounded-lg p-3 bg-gray-800/30">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs font-semibold text-gray-200">🌐 다국어 번역 (Gemini 자동 번역)</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        한국어 원문 저장 시 자동 생성됩니다. 직접 수정하거나 다시 번역할 수 있어요.
                      </div>
                    </div>
                    {!isReadOnly && (
                      <button
                        onClick={retranslate}
                        disabled={retranslating || trSaving}
                        className="text-[11px] px-2 py-1 bg-amber-700/50 hover:bg-amber-700 text-amber-100 rounded disabled:opacity-50"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {retranslating ? '번역 중...' : '🔄 다시 번역'}
                      </button>
                    )}
                  </div>
                  {[
                    { lang: 'en', label: 'English' },
                    { lang: 'ja', label: '日本語' },
                  ].map(({ lang, label }) => (
                    <div key={lang} className="mt-3 first:mt-2">
                      <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{label}</div>
                      <input
                        value={trForm[lang].title}
                        onChange={(e) => setTrForm({ ...trForm, [lang]: { ...trForm[lang], title: e.target.value } })}
                        disabled={isReadOnly}
                        placeholder="(자동 번역됨)"
                        maxLength={60}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none mb-1.5 disabled:text-gray-500"
                      />
                      <textarea
                        value={trForm[lang].body}
                        onChange={(e) => setTrForm({ ...trForm, [lang]: { ...trForm[lang], body: e.target.value } })}
                        disabled={isReadOnly}
                        rows={2}
                        maxLength={200}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none resize-none disabled:text-gray-500"
                      />
                    </div>
                  ))}
                  {!isReadOnly && (
                    <button
                      onClick={saveTranslations}
                      disabled={trSaving || retranslating}
                      className="mt-3 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded disabled:opacity-50"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {trSaving ? '저장 중...' : '✏️ 번역 수정안 저장'}
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">탭 시 이동할 페이지</label>
                <select
                  value={form.linkPath}
                  onChange={(e) => setForm({ ...form, linkPath: e.target.value })}
                  disabled={isReadOnly}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none disabled:text-gray-500"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {LINK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">발송 예약 시각 (KST)</label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  disabled={isReadOnly}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none disabled:text-gray-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  매분 실행되는 cron이 이 시각이 지나면 자동으로 전체 유저에게 발송합니다.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-gray-800 flex justify-between items-center">
              <button
                onClick={sendTest}
                disabled={testing || saving}
                className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/40 text-amber-300 rounded text-xs font-medium disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                title="현재 폼 내용으로 어드민 계정에만 푸시 발송"
              >
                {testing ? '테스트 발송 중...' : '🛠 어드민에게 테스트 발송'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={close}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {isReadOnly ? '닫기' : '취소'}
                </button>
                {!isReadOnly && (
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded text-sm font-medium"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {saving ? '저장 중...' : (editing === 'new' ? '예약 등록' : '저장')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
