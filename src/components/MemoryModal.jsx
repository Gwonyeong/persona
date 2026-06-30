import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import MaskIcon from './MaskIcon'

const MAX_FACT_LEN = 100

const factOf = (item) => (typeof item === 'string' ? item : item?.fact || '')
const pinnedOf = (item) => !!(item && typeof item === 'object' && item.pinned)
const clampLen = (v) => [...v].slice(0, MAX_FACT_LEN).join('')

// 캐릭터의 장기기억(LTM) 슬롯을 보여주고 직접 편집하는 풀페이지 뷰.
// 480px 컨테이너 안에서 absolute inset-0으로 전체를 덮음 (CLAUDE.md 정책).
// 유저는 기억을 직접 추가/수정/삭제/고정할 수 있다. 고정(🔒) 기억은 AI가 지우지 못한다.
// 채팅 페이지 '책' 버튼에서 호출. 열릴 때 최신 상태 fetch.
export default function MemoryModal({ open, conversationId, characterName, onClose, onUpdate }) {
  const { t } = useTranslation()
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)

  const [loading, setLoading] = useState(false)
  const [state, setState] = useState(null) // { slot, longTermMemory }
  const [unlocking, setUnlocking] = useState(false)
  const [toast, setToast] = useState(null) // { kind: 'success' | 'error', text }

  // 편집 상태: editingIdx = 배열 인덱스(number) | 'new' | null
  const [editingIdx, setEditingIdx] = useState(null)
  const [editText, setEditText] = useState('')
  const [editPinned, setEditPinned] = useState(true)
  const [editOrig, setEditOrig] = useState('') // race 방어용 — 편집 시작 시점의 원문
  const [saving, setSaving] = useState(false)

  const fetchState = () => {
    if (!conversationId) return
    setLoading(true)
    return api
      .get(`/memory/conversations/${conversationId}`)
      .then((res) => {
        setState(res)
        onUpdate?.(res)
      })
      .catch(() => setToast({ kind: 'error', text: t('memory.modal.unlockError') }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !conversationId) return
    let cancelled = false
    setLoading(true)
    api
      .get(`/memory/conversations/${conversationId}`)
      .then((res) => {
        if (cancelled) return
        setState(res)
        onUpdate?.(res)
      })
      .catch(() => {
        if (cancelled) return
        setToast({ kind: 'error', text: t('memory.modal.unlockError') })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, conversationId])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  if (!open) return null

  const slot = state?.slot
  const ltm = state?.longTermMemory || []
  const used = ltm.length
  const total = slot?.count ?? 10
  const capReached = slot?.capReached ?? false
  const isFull = used >= total
  const unlockCost = slot?.unlockCost ?? 5

  const applyResult = (res) => {
    const next = {
      ...state,
      longTermMemory: res.longTermMemory,
      slot: { ...state?.slot, ...(res.slot || {}), used: res.longTermMemory.length },
    }
    setState(next)
    onUpdate?.(next)
  }

  const toastFromErr = (err) => {
    const code = err?.data?.error || err?.message
    if (code === 'SLOT_FULL') return setToast({ kind: 'error', text: t('memory.modal.slotFull') })
    if (code === 'STALE_INDEX') {
      fetchState()
      return setToast({ kind: 'error', text: t('memory.modal.staleError') })
    }
    if (code === 'FACT_TOO_LONG') return setToast({ kind: 'error', text: t('memory.modal.tooLong', { max: MAX_FACT_LEN }) })
    if (code === 'MINOR_CONTENT_BLOCKED') {
      return setToast({ kind: 'error', text: t(err?.data?.warned ? 'memory.modal.minorBlockedWarned' : 'memory.modal.minorBlocked') })
    }
    setToast({ kind: 'error', text: t('memory.modal.saveError') })
  }

  const closeEdit = () => {
    setEditingIdx(null)
    setEditText('')
    setEditOrig('')
    setEditPinned(true)
  }

  const openNew = () => {
    setEditingIdx('new')
    setEditText('')
    setEditOrig('')
    setEditPinned(true)
  }

  const openEdit = (i) => {
    const item = ltm[i]
    setEditingIdx(i)
    setEditText(factOf(item))
    setEditOrig(factOf(item))
    setEditPinned(pinnedOf(item))
  }

  const handleSave = async () => {
    const text = editText.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      if (editingIdx === 'new') {
        const res = await api.post(`/memory/conversations/${conversationId}/facts`, { fact: text })
        applyResult(res)
        setToast({ kind: 'success', text: t('memory.modal.added') })
      } else {
        const res = await api.put(`/memory/conversations/${conversationId}/facts/${editingIdx}`, {
          fact: text,
          pinned: editPinned,
          expectedFact: editOrig,
        })
        applyResult(res)
        setToast({ kind: 'success', text: t('memory.modal.saved') })
      }
      closeEdit()
    } catch (err) {
      toastFromErr(err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (i) => {
    if (saving) return
    setSaving(true)
    try {
      const orig = factOf(ltm[i])
      const res = await api.delete(
        `/memory/conversations/${conversationId}/facts/${i}?expectedFact=${encodeURIComponent(orig)}`,
      )
      applyResult(res)
      closeEdit()
      setToast({ kind: 'success', text: t('memory.modal.deleted') })
    } catch (err) {
      toastFromErr(err)
    } finally {
      setSaving(false)
    }
  }

  const handleUnlock = async () => {
    if (unlocking || capReached) return
    setUnlocking(true)
    try {
      const res = await api.post(`/memory/conversations/${conversationId}/unlock`)
      if (typeof res?.masks === 'number') {
        setUser({ ...user, masks: res.masks })
      }
      setState((prev) => ({ ...prev, slot: { ...prev.slot, ...res.slot } }))
      onUpdate?.({ ...state, slot: { ...state.slot, ...res.slot } })
      setToast({ kind: 'success', text: t('memory.modal.unlockSuccess') })
    } catch (err) {
      const code = err?.data?.error || err?.message
      if (code === 'INSUFFICIENT_MASKS') {
        setToast({ kind: 'error', text: t('memory.modal.insufficientMasks') })
      } else {
        setToast({ kind: 'error', text: t('memory.modal.unlockError') })
      }
    } finally {
      setUnlocking(false)
    }
  }

  // 인라인 에디터 (추가/수정 공용)
  const editor = (
    <div className="rounded-md bg-gray-800/80 border border-indigo-500/40 px-3 py-2.5">
      <textarea
        autoFocus
        value={editText}
        onChange={(e) => setEditText(clampLen(e.target.value))}
        placeholder={t('memory.modal.newPlaceholder')}
        rows={2}
        className="w-full bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none leading-snug"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      />
      <div className="flex items-center justify-between mt-1.5">
        <button
          onClick={() => setEditPinned((v) => !v)}
          className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
            editPinned ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700/60 text-gray-400'
          }`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <LockIcon filled={editPinned} />
          {t('memory.modal.pin')}
        </button>
        <span className={`text-[10px] ${[...editText].length >= MAX_FACT_LEN ? 'text-amber-300' : 'text-gray-500'}`}>
          {[...editText].length}/{MAX_FACT_LEN}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <button
          onClick={handleSave}
          disabled={saving || !editText.trim()}
          className="flex-1 h-8 rounded-md bg-indigo-600 text-white text-xs font-medium disabled:opacity-40 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('memory.modal.save')}
        </button>
        {editingIdx !== 'new' && (
          <button
            onClick={() => handleDelete(editingIdx)}
            disabled={saving}
            className="h-8 px-3 rounded-md bg-red-500/15 text-red-300 text-xs font-medium disabled:opacity-40"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('memory.modal.delete')}
          </button>
        )}
        <button
          onClick={closeEdit}
          disabled={saving}
          className="h-8 px-3 rounded-md bg-gray-700/60 text-gray-300 text-xs font-medium disabled:opacity-40"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('memory.modal.cancel')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-gray-950">
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-4 pb-3 border-b border-gray-800/60"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button
          onClick={onClose}
          className="p-1 -ml-1 text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label="back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white text-base font-semibold leading-tight">{t('memory.modal.title', { name: characterName || '' })}</h2>
          <p className={`text-xs mt-0.5 ${isFull ? 'text-amber-300' : 'text-gray-400'}`}>
            {t('memory.modal.subtitle', { used, total })}
          </p>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {loading && !state ? (
          <div className="text-center text-gray-500 text-sm py-8">…</div>
        ) : (
          <>
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{t('memory.modal.pinHint')}</p>

            {/* 추가 버튼 / 신규 에디터 */}
            {editingIdx === 'new' ? (
              <div className="mb-2">{editor}</div>
            ) : (
              <button
                onClick={openNew}
                disabled={isFull}
                className={`w-full mb-2 h-10 rounded-md border border-dashed flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${
                  isFull
                    ? 'border-gray-800/70 bg-gray-900/40 text-gray-600 cursor-not-allowed'
                    : 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {isFull ? t('memory.modal.slotFull') : t('memory.modal.addButton')}
              </button>
            )}

            {used === 0 && editingIdx !== 'new' && (
              <p className="text-center text-gray-500 text-xs my-3">{t('memory.modal.empty')}</p>
            )}

            {/* 기억 목록 */}
            <div className="grid grid-cols-1 gap-1.5">
              {ltm.map((item, i) => {
                const fact = factOf(item)
                const pinned = pinnedOf(item)
                if (editingIdx === i) return <div key={i}>{editor}</div>
                return (
                  <button
                    key={i}
                    onClick={() => openEdit(i)}
                    className={`text-left rounded-md px-3 py-1.5 border transition-colors ${
                      pinned
                        ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
                        : 'bg-gray-800/70 border-gray-700/60 hover:bg-gray-800'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span className="flex items-start gap-1.5">
                      {pinned && <span className="mt-0.5 flex-shrink-0 text-amber-300"><LockIcon filled /></span>}
                      <span className="text-xs text-gray-100 leading-snug break-words whitespace-pre-wrap">{fact}</span>
                    </span>
                  </button>
                )
              })}

              {/* 남은 빈 슬롯 placeholder */}
              {Array.from({ length: Math.max(0, total - used) }, (_, k) => (
                <div key={`empty-${k}`} className="rounded-md bg-gray-900/40 border border-dashed border-gray-800/70 h-7" />
              ))}

              {/* 해금 버튼 / cap 도달 */}
              {capReached ? (
                <div className="rounded-md border border-dashed border-gray-800/70 bg-gray-900/40 h-14 flex items-center justify-center">
                  <span className="text-xs text-gray-500">{t('memory.modal.capReachedButton')}</span>
                </div>
              ) : (
                <button
                  onClick={handleUnlock}
                  disabled={unlocking}
                  className={`rounded-md border border-dashed h-14 flex items-center justify-center gap-2 transition-colors ${
                    unlocking
                      ? 'border-gray-800/70 bg-gray-900/40 text-gray-500 cursor-wait'
                      : 'border-gray-700/70 bg-gray-900/40 text-gray-300 hover:bg-gray-800/60 hover:border-gray-600/70'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="text-xs font-medium">{t('memory.modal.unlockButton')}</span>
                  <span className="text-[11px] text-gray-500">·</span>
                  <MaskIcon className="text-sm" />
                  <span className="text-xs font-medium">{unlockCost}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md text-xs text-white shadow-lg z-10"
          style={{
            top: 'calc(env(safe-area-inset-top) + 60px)',
            background: toast.kind === 'success' ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

function LockIcon({ filled }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
