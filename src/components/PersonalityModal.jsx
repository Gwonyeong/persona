import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import MaskIcon from './MaskIcon'

// 캐릭터 personality 프리셋 슬롯 풀페이지 모달 (구조화 schema, v2).
// 자유 텍스트 편집은 폐지 — 1단계 노출: 관계(프리셋+커스텀) + 호칭.
// 2~3단계(취향 추가 / 말투 강도)는 schema에 자리만 두고 UI는 아직 미노출.

const MAX_NAME_LEN = 50
const MAX_CUSTOM_LABEL_LEN = 50
const MAX_USER_ADDRESS_LEN = 20

const RELATIONSHIP_PRESETS = ['friend', 'lover', 'soulmate', 'colleague', 'mentor', 'roommate']
const HONORIFIC_LEVELS = ['strict', 'mixed', 'casual']
const PHYSICAL_DISTANCES = ['professional', 'close', 'intimate']

function emptyDraft() {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    isActive: false,
    createdAt: new Date().toISOString(),
    relationship: null,
    honorificLevel: null,
    physicalDistance: null,
    userAddress: '',
    addedLikes: [],
    addedHobbies: [],
    speech: null,
  }
}

// 프리셋 한 줄 미리보기 — list 카드용
function presetPreview(preset, t) {
  const parts = []
  if (preset.relationship) {
    const label =
      preset.relationship.presetType === 'custom'
        ? preset.relationship.customLabel
        : t(`personality.edit.relationshipPresets.${preset.relationship.presetType}`)
    parts.push(label)
  }
  if (preset.honorificLevel) parts.push(t(`personality.edit.honorific.${preset.honorificLevel}`))
  if (preset.physicalDistance) parts.push(t(`personality.edit.distance.${preset.physicalDistance}`))
  if (preset.userAddress) parts.push(`"${preset.userAddress}"`)
  return parts.join(' · ')
}

function originalPreview(original, t) {
  if (!original) return null
  const parts = []
  if (original.relationship) parts.push(original.relationship)
  if (original.honorificLevel) parts.push(t(`personality.edit.honorific.${original.honorificLevel}`))
  if (original.physicalDistance) parts.push(t(`personality.edit.distance.${original.physicalDistance}`))
  if (original.defaultUserNickname) parts.push(`"${original.defaultUserNickname}"`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function PersonalityModal({ open, conversationId, characterName, onClose }) {
  const { t } = useTranslation()
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)

  const [loading, setLoading] = useState(false)
  const [state, setState] = useState(null) // { presets, original, slot }
  const [mode, setMode] = useState('list')
  const [draft, setDraft] = useState(null)
  const [isNewDraft, setIsNewDraft] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!open || !conversationId) return
    let cancelled = false
    setLoading(true)
    setMode('list')
    setDraft(null)
    api
      .get(`/personality/conversations/${conversationId}`)
      .then((res) => {
        if (!cancelled) setState(res)
      })
      .catch(() => {
        if (!cancelled) setToast({ kind: 'error', text: t('personality.modal.saveError') })
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

  const presets = state?.presets || []
  const slot = state?.slot
  const slotCount = slot?.count ?? 1
  const used = presets.length
  const unlockCost = slot?.unlockCost ?? 10
  const original = state?.original
  const activeUserPresetId = presets.find((p) => p.isActive)?.id || null
  const emptySlotCount = Math.max(0, slotCount - used)

  const persistPresets = async (newPresets) => {
    setSaving(true)
    try {
      const res = await api.put(`/personality/conversations/${conversationId}`, { presets: newPresets })
      setState((prev) => ({
        ...prev,
        presets: res.presets,
        slot: { ...prev.slot, used: res.presets.length },
      }))
      return true
    } catch {
      setToast({ kind: 'error', text: t('personality.modal.saveError') })
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (presetId) => {
    const newPresets = presets.map((p) => ({
      ...p,
      isActive: presetId !== null && p.id === presetId,
    }))
    await persistPresets(newPresets)
  }

  const handleStartEdit = (preset) => {
    // 옛 데이터 호환 — 누락 필드 채움
    setDraft({
      ...emptyDraft(),
      ...preset,
      userAddress: preset.userAddress || '',
      addedLikes: preset.addedLikes || [],
      addedHobbies: preset.addedHobbies || [],
    })
    setIsNewDraft(false)
    setMode('edit')
  }

  const handleStartNew = () => {
    setDraft(emptyDraft())
    setIsNewDraft(true)
    setMode('edit')
  }

  const handleSaveDraft = async () => {
    if (!draft || saving) return
    const cleaned = {
      ...draft,
      name: (draft.name || '').slice(0, MAX_NAME_LEN),
      userAddress: (draft.userAddress || '').trim().slice(0, MAX_USER_ADDRESS_LEN),
    }
    const next = isNewDraft
      ? [...presets, cleaned]
      : presets.map((p) => (p.id === cleaned.id ? cleaned : p))
    const ok = await persistPresets(next)
    if (ok) {
      setMode('list')
      setDraft(null)
    }
  }

  const handleDeleteDraft = async () => {
    if (!draft) return
    if (isNewDraft) {
      setMode('list')
      setDraft(null)
      return
    }
    if (!window.confirm(t('personality.edit.deleteConfirm'))) return
    const next = presets.filter((p) => p.id !== draft.id)
    const ok = await persistPresets(next)
    if (ok) {
      setMode('list')
      setDraft(null)
    }
  }

  const handleCancelEdit = () => {
    setMode('list')
    setDraft(null)
  }

  const handleUnlock = async () => {
    if (unlocking) return
    setUnlocking(true)
    try {
      const res = await api.post(`/personality/conversations/${conversationId}/unlock`)
      if (typeof res?.masks === 'number') setUser({ ...user, masks: res.masks })
      setState((prev) => ({ ...prev, slot: { ...prev.slot, ...res.slot } }))
      setToast({ kind: 'success', text: t('personality.modal.unlockSuccess') })
    } catch (err) {
      const code = err?.body?.error || err?.message
      setToast({
        kind: 'error',
        text:
          code === 'INSUFFICIENT_MASKS'
            ? t('personality.modal.insufficientMasks')
            : t('personality.modal.unlockError'),
      })
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-gray-950">
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-4 pb-3 border-b border-gray-800/60"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button
          onClick={mode === 'edit' ? handleCancelEdit : onClose}
          className="p-1 -ml-1 text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label="back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {mode === 'list' ? (
            <>
              <h2 className="text-white text-base font-semibold leading-tight">
                {t('personality.modal.title', { name: characterName || '' })}
              </h2>
              <p className="text-xs mt-0.5 text-gray-400">
                {t('personality.modal.subtitle', { used, total: slotCount })}
              </p>
            </>
          ) : (
            <h2 className="text-white text-base font-semibold leading-tight">
              {t('personality.edit.title')}
            </h2>
          )}
        </div>
      </div>

      {/* 본문 */}
      {mode === 'list' ? (
        <div
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          {loading && !state ? (
            <div className="text-center text-gray-500 text-sm py-8">…</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <PresetCard
                title={t('personality.modal.originalLabel')}
                subtitle={t('personality.modal.originalHint')}
                preview={originalPreview(original, t)}
                active={activeUserPresetId === null}
                activeLabel={t('personality.modal.activeBadge')}
                onSelect={() => handleActivate(null)}
                onEdit={null}
              />
              {presets.map((p) => (
                <PresetCard
                  key={p.id}
                  title={p.name?.trim() || t('personality.modal.untitled')}
                  preview={presetPreview(p, t)}
                  active={p.isActive}
                  activeLabel={t('personality.modal.activeBadge')}
                  onSelect={() => handleActivate(p.id)}
                  onEdit={() => handleStartEdit(p)}
                />
              ))}
              {Array.from({ length: emptySlotCount }).map((_, i) => (
                <button
                  key={`empty-${i}`}
                  onClick={handleStartNew}
                  className="rounded-md border border-dashed border-gray-700/70 bg-gray-900/40 hover:bg-gray-800/60 hover:border-gray-600/70 px-3 py-4 flex items-center justify-center gap-2 text-gray-400 transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="text-xs">{t('personality.modal.emptyPresetHint')}</span>
                </button>
              ))}
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
                <span className="text-xs font-medium">{t('personality.modal.unlockButton')}</span>
                <span className="text-[11px] text-gray-500">·</span>
                <MaskIcon className="text-sm" />
                <span className="text-xs font-medium">{unlockCost}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <EditView
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          isNewDraft={isNewDraft}
          onSave={handleSaveDraft}
          onCancel={handleCancelEdit}
          onDelete={handleDeleteDraft}
        />
      )}

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

function PresetCard({ title, subtitle, preview, active, activeLabel, onSelect, onEdit }) {
  return (
    <div
      onClick={onSelect}
      className={`rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
        active
          ? 'border-emerald-500/60 bg-emerald-500/10'
          : 'border-gray-700/60 bg-gray-800/70 hover:bg-gray-800'
      }`}
      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-gray-100 font-medium truncate">{title}</p>
            {active && (
              <span className="text-[10px] px-1.5 py-px rounded bg-emerald-500/30 text-emerald-200 font-semibold">
                {activeLabel}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
          {preview && (
            <p className="text-[11px] text-gray-300 mt-1.5 leading-snug break-words whitespace-pre-wrap">
              {preview}
            </p>
          )}
        </div>
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1 text-gray-500 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="edit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function EditView({ draft, setDraft, saving, isNewDraft, onSave, onCancel, onDelete }) {
  const { t } = useTranslation()

  const setRelationshipPreset = (presetType) => {
    if (presetType === null) {
      setDraft({ ...draft, relationship: null })
      return
    }
    if (presetType === 'custom') {
      setDraft({ ...draft, relationship: { presetType: 'custom', customLabel: draft.relationship?.customLabel || '' } })
      return
    }
    setDraft({ ...draft, relationship: { presetType } })
  }

  const isCustom = draft?.relationship?.presetType === 'custom'

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* 이름 */}
        <div>
          <input
            type="text"
            value={draft?.name || ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, MAX_NAME_LEN) })}
            placeholder={t('personality.edit.namePlaceholder')}
            className="w-full px-3 py-2 rounded-md bg-gray-800/70 border border-gray-700/60 text-sm text-gray-100 placeholder:text-gray-500"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            maxLength={MAX_NAME_LEN}
          />
        </div>

        {/* ① 관계 */}
        <section className="space-y-2">
          <div>
            <h3 className="text-sm text-white font-semibold">{t('personality.edit.relationshipLabel')}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{t('personality.edit.relationshipHint')}</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {RELATIONSHIP_PRESETS.map((p) => {
              const selected = draft?.relationship?.presetType === p
              return (
                <button
                  key={p}
                  onClick={() => setRelationshipPreset(selected ? null : p)}
                  className={`px-2 py-2 rounded-md text-xs font-medium transition-colors border ${
                    selected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700/60 bg-gray-800/60 text-gray-300 hover:bg-gray-800'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t(`personality.edit.relationshipPresets.${p}`)}
                </button>
              )
            })}
            <button
              onClick={() => setRelationshipPreset(isCustom ? null : 'custom')}
              className={`px-2 py-2 rounded-md text-xs font-medium transition-colors border ${
                isCustom
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-gray-700/60 bg-gray-800/60 text-gray-300 hover:bg-gray-800'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('personality.edit.relationshipPresets.custom')}
            </button>
          </div>
          {isCustom && (
            <input
              type="text"
              value={draft.relationship?.customLabel || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  relationship: { presetType: 'custom', customLabel: e.target.value.slice(0, MAX_CUSTOM_LABEL_LEN) },
                })
              }
              placeholder={t('personality.edit.relationshipCustomPlaceholder')}
              className="w-full px-3 py-2 rounded-md bg-gray-800/70 border border-gray-700/60 text-sm text-gray-100 placeholder:text-gray-500 mt-1.5"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              maxLength={MAX_CUSTOM_LABEL_LEN}
            />
          )}
        </section>

        {/* 존댓말 정책 */}
        <section className="space-y-2">
          <h3 className="text-sm text-white font-semibold">{t('personality.edit.honorificLabel')}</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {HONORIFIC_LEVELS.map((h) => {
              const selected = draft?.honorificLevel === h
              return (
                <button
                  key={h}
                  onClick={() => setDraft({ ...draft, honorificLevel: selected ? null : h })}
                  className={`px-2 py-2 rounded-md text-xs font-medium transition-colors border ${
                    selected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700/60 bg-gray-800/60 text-gray-300 hover:bg-gray-800'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t(`personality.edit.honorific.${h}`)}
                </button>
              )
            })}
          </div>
        </section>

        {/* 거리감 */}
        <section className="space-y-2">
          <h3 className="text-sm text-white font-semibold">{t('personality.edit.distanceLabel')}</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {PHYSICAL_DISTANCES.map((d) => {
              const selected = draft?.physicalDistance === d
              return (
                <button
                  key={d}
                  onClick={() => setDraft({ ...draft, physicalDistance: selected ? null : d })}
                  className={`px-2 py-2 rounded-md text-xs font-medium transition-colors border ${
                    selected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700/60 bg-gray-800/60 text-gray-300 hover:bg-gray-800'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t(`personality.edit.distance.${d}`)}
                </button>
              )
            })}
          </div>
        </section>

        {/* ② 호칭 */}
        <section className="space-y-2">
          <h3 className="text-sm text-white font-semibold">{t('personality.edit.userAddressLabel')}</h3>
          <input
            type="text"
            value={draft?.userAddress || ''}
            onChange={(e) => setDraft({ ...draft, userAddress: e.target.value.slice(0, MAX_USER_ADDRESS_LEN) })}
            placeholder={t('personality.edit.userAddressPlaceholder')}
            className="w-full px-3 py-2 rounded-md bg-gray-800/70 border border-gray-700/60 text-sm text-gray-100 placeholder:text-gray-500"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            maxLength={MAX_USER_ADDRESS_LEN}
          />
          <p className="text-[11px] text-gray-500">{t('personality.edit.userAddressHint')}</p>
        </section>
      </div>

      <div className="px-4 pt-3 flex gap-2 border-t border-gray-800/60">
        {!isNewDraft && (
          <button
            onClick={onDelete}
            disabled={saving}
            className="px-3 py-2.5 rounded-md text-sm font-medium bg-red-500/15 hover:bg-red-500/25 text-red-300 disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('personality.edit.delete')}
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 px-3 py-2.5 rounded-md text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('personality.edit.cancel')}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className={`flex-1 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
            saving
              ? 'bg-purple-500/40 text-white cursor-wait'
              : 'bg-purple-500 hover:bg-purple-400 text-white'
          }`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('personality.edit.save')}
        </button>
      </div>
    </div>
  )
}
