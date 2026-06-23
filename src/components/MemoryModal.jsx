import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import MaskIcon from './MaskIcon'

// 캐릭터의 장기기억(LTM) 슬롯을 보여주는 풀페이지 뷰.
// 480px 컨테이너 안에서 absolute inset-0으로 전체를 덮음 (CLAUDE.md 정책).
// 슬롯 수만큼 그리드 셀을 렌더 — fact가 없는 빈 슬롯도 placeholder로 표시.
// 채팅 페이지 '책' 버튼에서 호출. 열릴 때 최신 상태 fetch.
export default function MemoryModal({ open, conversationId, characterName, onClose, onUpdate }) {
  const { t } = useTranslation()
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)

  const [loading, setLoading] = useState(false)
  const [state, setState] = useState(null) // { slot, longTermMemory }
  const [unlocking, setUnlocking] = useState(false)
  const [toast, setToast] = useState(null) // { kind: 'success' | 'error', text }

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
  const used = slot?.used ?? ltm.length
  const total = slot?.count ?? 10
  const capReached = slot?.capReached ?? false
  const isFull = used >= total // 슬롯 100% 사용 — 새 fact 추가 시 오래된 게 잘림
  const unlockCost = slot?.unlockCost ?? 5

  const handleUnlock = async () => {
    if (unlocking || capReached) return
    setUnlocking(true)
    try {
      const res = await api.post(`/memory/conversations/${conversationId}/unlock`)
      if (typeof res?.masks === 'number') {
        setUser({ ...user, masks: res.masks })
      }
      setState((prev) => ({
        ...prev,
        slot: { ...prev.slot, ...res.slot },
      }))
      onUpdate?.({ ...state, slot: { ...state.slot, ...res.slot } })
      setToast({ kind: 'success', text: t('memory.modal.unlockSuccess') })
    } catch (err) {
      const code = err?.body?.error || err?.message
      if (code === 'INSUFFICIENT_MASKS') {
        setToast({ kind: 'error', text: t('memory.modal.insufficientMasks') })
      } else {
        setToast({ kind: 'error', text: t('memory.modal.unlockError') })
      }
    } finally {
      setUnlocking(false)
    }
  }

  // 슬롯 그리드: 총 슬롯 수만큼 셀 생성. ltm 배열은 가장 오래된 → 최신 순으로 누적된다고 가정.
  // 채워진 슬롯은 앞쪽부터 ltm을 매핑, 나머지는 빈 placeholder.
  const slotCells = Array.from({ length: total }, (_, i) => {
    const item = ltm[i]
    const fact = typeof item === 'string' ? item : item?.fact
    return { idx: i, fact, filled: !!fact }
  })

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

      {/* 가득 찼을 때 경고 */}
      {isFull && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px]">
          {t('memory.modal.capWarning')}
        </div>
      )}

      {/* 본문 — 슬롯 그리드 (해금 버튼은 그리드 마지막 셀로 통합) */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {loading && !state ? (
          <div className="text-center text-gray-500 text-sm py-8">…</div>
        ) : (
          <>
            {used === 0 && (
              <p className="text-center text-gray-500 text-xs mb-3">{t('memory.modal.empty')}</p>
            )}
            <div className="grid grid-cols-1 gap-1.5">
              {slotCells.map(({ idx, fact, filled }) => (
                <div
                  key={idx}
                  className={`rounded-md ${
                    filled
                      ? 'bg-gray-800/70 border border-gray-700/60 px-3 py-1.5'
                      : 'bg-gray-900/40 border border-dashed border-gray-800/70 h-7'
                  }`}
                >
                  {filled && (
                    <p className="text-xs text-gray-100 leading-snug break-words whitespace-pre-wrap">
                      {fact}
                    </p>
                  )}
                </div>
              ))}

              {/* 그리드 마지막 셀 — 추가 해금 버튼 또는 cap 도달 안내. 빈 슬롯과 같은 톤, 높이만 키움. */}
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
