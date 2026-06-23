import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'
import MaskIcon from './MaskIcon'

// 캐릭터 personality 프리셋 슬롯 풀페이지 모달 (구조화 schema, v2).
// 자유 텍스트 편집은 폐지 — 1단계 노출: 관계(프리셋+커스텀) + 호칭.
// 2~3단계(취향 추가 / 말투 강도)는 schema에 자리만 두고 UI는 아직 미노출.

const MAX_NAME_LEN = 50
const MAX_CUSTOM_LABEL_LEN = 100
const MAX_USER_ADDRESS_LEN = 20
const MAX_CONCEPT_LEN = 200
const MAX_TRAIT_LEN = 200
const MAX_TRAIT_ITEMS = 8

const RELATIONSHIP_PRESETS = ['friend', 'lover', 'soulmate', 'colleague', 'mentor', 'roommate']
const HONORIFIC_LEVELS = ['strict', 'mixed', 'casual']
const PHYSICAL_DISTANCES = ['professional', 'close', 'intimate']

const MAX_PREF_LEN = 30
const MAX_PREF_ITEMS = 10
const SPEECH_AXES = [
  { key: 'friendliness', low: 'friendlinessLow', high: 'friendlinessHigh' },
  { key: 'cheerfulness', low: 'cheerfulnessLow', high: 'cheerfulnessHigh' },
  { key: 'emojiFreq', low: 'emojiLow', high: 'emojiHigh' },
  { key: 'laughFreq', low: 'laughLow', high: 'laughHigh' },
]

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
    conceptOverride: '',
    traitsOverride: [],
    addedLikes: [],
    addedHobbies: [],
    speech: null,
  }
}

// 프리셋 미리보기 — list 카드용. 칩(관계/말투/거리/호칭) + 컨셉/성격은 별도 줄.
function presetPreview(preset, t) {
  const chips = []
  if (preset.relationship) {
    const label =
      preset.relationship.presetType === 'custom'
        ? preset.relationship.customLabel
        : t(`personality.edit.relationshipPresets.${preset.relationship.presetType}`)
    if (label) chips.push({ key: 'rel', label })
  }
  if (preset.honorificLevel)
    chips.push({ key: 'hon', label: t(`personality.edit.honorific.${preset.honorificLevel}`) })
  if (preset.physicalDistance)
    chips.push({ key: 'dist', label: t(`personality.edit.distance.${preset.physicalDistance}`) })
  if (preset.userAddress) chips.push({ key: 'addr', label: `호칭 "${preset.userAddress}"` })
  return {
    chips,
    concept: preset.conceptOverride || null,
    traits: Array.isArray(preset.traitsOverride) ? preset.traitsOverride : [],
  }
}

function originalPreview(original, t) {
  if (!original) return null
  const chips = []
  if (original.relationship) chips.push({ key: 'rel', label: original.relationship })
  if (original.honorificLevel)
    chips.push({ key: 'hon', label: t(`personality.edit.honorific.${original.honorificLevel}`) })
  if (original.physicalDistance)
    chips.push({ key: 'dist', label: t(`personality.edit.distance.${original.physicalDistance}`) })
  if (original.defaultUserNickname)
    chips.push({ key: 'addr', label: `호칭 "${original.defaultUserNickname}"` })
  return {
    chips,
    concept: original.concept || null,
    traits: Array.isArray(original.coreTraits) ? original.coreTraits : [],
  }
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
  const slotCount = slot?.count ?? 0
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
    // 새 프리셋: 캐릭터 기본값들을 미리 선택 상태로 채움 → 사용자가 원하는 부분만 변경.
    const initial = emptyDraft()
    if (original) {
      if (original.relationship) {
        // 캐릭터 기본 relationship 텍스트 → custom + customLabel.
        // 표준 6 프리셋(friend/lover/...)에 정확히 매칭이 어렵고, 자유 텍스트라 custom 슬롯이 자연스러움.
        const label = String(original.relationship)
          .replace(/^[^=]+\s*=\s*/, '')
          .trim()
          .slice(0, MAX_CUSTOM_LABEL_LEN)
        if (label) initial.relationship = { presetType: 'custom', customLabel: label }
      }
      if (original.honorificLevel) initial.honorificLevel = original.honorificLevel
      if (original.physicalDistance) initial.physicalDistance = original.physicalDistance
      if (original.defaultUserNickname) initial.userAddress = original.defaultUserNickname
      if (original.concept) initial.conceptOverride = String(original.concept).slice(0, MAX_CONCEPT_LEN)
      if (Array.isArray(original.coreTraits) && original.coreTraits.length > 0) {
        initial.traitsOverride = original.coreTraits
          .filter((t) => typeof t === 'string' && t.trim())
          .slice(0, MAX_TRAIT_ITEMS)
          .map((t) => t.slice(0, MAX_TRAIT_LEN))
      }
    }
    setDraft(initial)
    setIsNewDraft(true)
    setMode('edit')
  }

  const handleSaveDraft = async () => {
    if (!draft || saving) return
    const cleaned = {
      ...draft,
      name: (draft.name || '').slice(0, MAX_NAME_LEN),
      userAddress: (draft.userAddress || '').trim().slice(0, MAX_USER_ADDRESS_LEN),
      conceptOverride: (draft.conceptOverride || '').trim().slice(0, MAX_CONCEPT_LEN),
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

// preview 는 { chips: [{key,label}], concept: string|null, traits: string[] } 또는 null.
function PresetCard({ title, subtitle, preview, active, activeLabel, onSelect, onEdit }) {
  const chips = preview?.chips || []
  const concept = preview?.concept || null
  const traits = preview?.traits || []
  const hasAnyDetail = chips.length > 0 || concept || traits.length > 0

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
          {hasAnyDetail && (
            <div className="mt-2 space-y-1.5">
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {chips.map((c) => (
                    <span
                      key={c.key}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-200 leading-tight"
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
              {concept && (
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-gray-500 mt-0.5 shrink-0">컨셉</span>
                  <span className="text-[11px] text-gray-300 leading-snug break-words whitespace-pre-wrap">
                    {concept}
                  </span>
                </div>
              )}
              {traits.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-gray-500 mt-0.5 shrink-0">성격</span>
                  <ul className="text-[11px] text-gray-300 leading-snug list-disc list-inside space-y-0.5 min-w-0">
                    {traits.map((tr, i) => (
                      <li key={i} className="break-words whitespace-pre-wrap">
                        {tr}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
          <AutoTextarea
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
            <AutoTextarea
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

        {/* ⑤ 컨셉 override */}
        <section className="space-y-2">
          <div>
            <h3 className="text-sm text-white font-semibold">{t('personality.edit.conceptLabel')}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{t('personality.edit.conceptHint')}</p>
          </div>
          <AutoTextarea
            value={draft?.conceptOverride || ''}
            onChange={(e) => setDraft({ ...draft, conceptOverride: e.target.value.slice(0, MAX_CONCEPT_LEN) })}
            placeholder={t('personality.edit.conceptPlaceholder')}
            className="w-full px-3 py-2 rounded-md bg-gray-800/70 border border-gray-700/60 text-sm text-gray-100 placeholder:text-gray-500"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            maxLength={MAX_CONCEPT_LEN}
          />
        </section>

        {/* ⑥ 성격 (coreTraits) */}
        <section className="space-y-2">
          <div>
            <h3 className="text-sm text-white font-semibold">{t('personality.edit.traitsLabel')}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{t('personality.edit.traitsHint')}</p>
          </div>
          <ChipInput
            label=""
            values={draft?.traitsOverride || []}
            onChange={(v) => setDraft({ ...draft, traitsOverride: v })}
            placeholder={t('personality.edit.traitsItemPlaceholder')}
            maxLen={MAX_TRAIT_LEN}
            maxItems={MAX_TRAIT_ITEMS}
          />
        </section>

        {/* ② 호칭 */}
        <section className="space-y-2">
          <h3 className="text-sm text-white font-semibold">{t('personality.edit.userAddressLabel')}</h3>
          <AutoTextarea
            value={draft?.userAddress || ''}
            onChange={(e) => setDraft({ ...draft, userAddress: e.target.value.slice(0, MAX_USER_ADDRESS_LEN) })}
            placeholder={t('personality.edit.userAddressPlaceholder')}
            className="w-full px-3 py-2 rounded-md bg-gray-800/70 border border-gray-700/60 text-sm text-gray-100 placeholder:text-gray-500"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            maxLength={MAX_USER_ADDRESS_LEN}
          />
          <p className="text-[11px] text-gray-500">{t('personality.edit.userAddressHint')}</p>
        </section>

        {/* ③ 취향 추가 */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm text-white font-semibold">{t('personality.edit.preferencesLabel')}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{t('personality.edit.preferencesHint')}</p>
          </div>
          <ChipInput
            label={t('personality.edit.likesLabel')}
            values={draft?.addedLikes || []}
            onChange={(v) => setDraft({ ...draft, addedLikes: v })}
            placeholder={t('personality.edit.likesPlaceholder')}
          />
          <ChipInput
            label={t('personality.edit.hobbiesLabel')}
            values={draft?.addedHobbies || []}
            onChange={(v) => setDraft({ ...draft, addedHobbies: v })}
            placeholder={t('personality.edit.hobbiesPlaceholder')}
          />
        </section>

        {/* ④ 말투 강도 */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm text-white font-semibold">{t('personality.edit.speechLabel')}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{t('personality.edit.speechHint')}</p>
          </div>
          {SPEECH_AXES.map((axis) => (
            <SpeechSlider
              key={axis.key}
              value={draft?.speech?.[axis.key]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  speech: { ...(draft?.speech || {}), [axis.key]: v },
                })
              }
              lowLabel={t(`personality.edit.${axis.low}`)}
              highLabel={t(`personality.edit.${axis.high}`)}
            />
          ))}
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

// 한 줄로 시작했다가 텍스트가 길어지면 줄바꿈 기준으로 자동 확장.
// 모바일에서 긴 텍스트가 가로로 잘리지 않게 — input 대신 사용.
function AutoTextarea({ className = '', value, onChange, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={1}
      className={`resize-none overflow-hidden ${className}`}
      {...props}
    />
  )
}

function ChipInput({ label, values, onChange, placeholder, maxLen = MAX_PREF_LEN, maxItems = MAX_PREF_ITEMS }) {
  const [draft, setDraft] = useState('')
  const handleAdd = () => {
    const v = draft.trim().slice(0, maxLen)
    if (!v) return
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    if (values.length >= maxItems) return
    onChange([...values, v])
    setDraft('')
  }
  return (
    <div>
      {label && <h4 className="text-xs text-gray-300 font-medium mb-1.5">{label}</h4>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-700/70 text-gray-100 text-xs"
            >
              {v}
              <button
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                className="ml-0.5 text-gray-400 hover:text-white"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                aria-label="remove"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLen))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
          }
        }}
        placeholder={placeholder}
        disabled={values.length >= maxItems}
        className="w-full px-3 py-2 rounded-md bg-gray-800/70 border border-gray-700/60 text-sm text-gray-100 placeholder:text-gray-500 disabled:opacity-50"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        maxLength={maxLen}
      />
    </div>
  )
}

function SpeechSlider({ value, onChange, lowLabel, highLabel }) {
  const v = typeof value === 'number' ? value : 0.5
  const isMiddle = v >= 0.35 && v <= 0.65
  return (
    <div className="space-y-1">
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={v}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-purple-400 h-1"
      />
      <div className="flex justify-between text-[10px]">
        <span className={isMiddle || v < 0.5 ? 'text-gray-400' : 'text-gray-500'}>{lowLabel}</span>
        <span className={isMiddle || v >= 0.5 ? 'text-gray-400' : 'text-gray-500'}>{highLabel}</span>
      </div>
    </div>
  )
}
