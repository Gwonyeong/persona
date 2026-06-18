import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/**
 * 캐릭터 프로필 이미지 변경 모달.
 * - 마스크 패스로 해금한 variant 목록 + 기본 이미지 중 선택.
 * - 480px 컨테이너 안에서 absolute로 배치 (전체 뷰포트 X).
 *
 * @param {boolean} open
 * @param {number} characterId
 * @param {() => void} onClose
 * @param {(appliedVariantId: number|null) => void} onApplied 적용 후 호출 (부모에서 캐릭터 새로고침)
 */
export default function ProfileVariantPicker({ open, characterId, onClose, onApplied }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!open || !characterId) return
    setLoading(true)
    api
      .get(`/profile-variants/character/${characterId}`)
      .then((res) => {
        setData(res)
        setSelected(res.appliedVariantId)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [open, characterId])

  if (!open) return null

  async function apply(variantId) {
    if (saving) return
    setSaving(true)
    try {
      await api.put('/profile-variants/apply', { characterId, variantId })
      onApplied?.(variantId)
      onClose()
    } catch (e) {
      console.error(e)
      alert(e.data?.error || '적용 실패')
    } finally {
      setSaving(false)
    }
  }

  const variants = data?.variants || []
  const character = data?.character

  return (
    <div className="absolute inset-0 bg-black/70 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 animate-slide-up"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-100">프로필 이미지 변경</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {loading && <p className="text-center text-sm text-gray-500 py-6">불러오는 중...</p>}

        {!loading && character && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {/* 기본 이미지 */}
              <button
                onClick={() => apply(null)}
                disabled={saving}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                  selected === null ? 'border-amber-400' : 'border-gray-800 hover:border-gray-700'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {character.profileImage ? (
                  <img src={character.profileImage} alt="기본" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-800" />
                )}
                <span className="absolute bottom-1 left-1 right-1 text-[10px] text-center bg-black/60 text-gray-200 rounded px-1 py-0.5">기본</span>
              </button>

              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => apply(v.id)}
                  disabled={saving}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                    selected === v.id ? 'border-amber-400' : 'border-gray-800 hover:border-gray-700'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <img src={v.imageUrl} alt={v.title || ''} className="w-full h-full object-cover" />
                  {v.title && (
                    <span className="absolute bottom-1 left-1 right-1 text-[10px] text-center bg-black/60 text-gray-200 rounded px-1 py-0.5 truncate">
                      {v.title}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {variants.length === 0 && (
              <p className="mt-4 text-xs text-center text-gray-500">
                마스크 패스에서 프로필 이미지 보상을 받으면 여기에 추가돼요
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
