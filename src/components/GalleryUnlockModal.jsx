import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const UNLOCK_COST = 5

export default function GalleryUnlockModal({ content, characterId, onClose, onUnlocked }) {
  const { masks, token } = useStore()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canAfford = masks >= UNLOCK_COST

  const thumbImage = content.images?.[0]

  const handleUnlock = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const result = await api.post(`/characters/${characterId}/gallery/${content.id}/unlock`)
      if (result.error) {
        setError(result.error === 'Insufficient masks' ? t('gallery.insufficient') : result.error)
        setLoading(false)
        return
      }
      useStore.getState().setMasks(result.masks)
      onUnlocked(content.id)
    } catch (err) {
      setError(t('gallery.unlockFailed'))
      setLoading(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
        {/* 미리보기 */}
        <div className="w-full aspect-square rounded-xl overflow-hidden mb-4 bg-gray-800">
          {thumbImage && (
            <img
              src={thumbImage.filePath}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: 'blur(2.5px) brightness(0.7)' }}
            />
          )}
        </div>

        {/* 정보 */}
        <div className="text-center mb-4">
          <p className="text-lg font-bold text-gray-100">
            {content.missionName || content.title || t('gallery.unlockDesc')}
          </p>
          {content.images?.length > 1 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {t('gallery.imageCount', { count: content.images.length })}
            </p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            {t('gallery.unlockDesc')}
          </p>
        </div>

        {/* 비용 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60 rounded-xl mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎭</span>
            <span className="text-sm text-gray-300">{t('gallery.unlockCost')}</span>
          </div>
          <span className="text-sm font-bold text-indigo-400">{t('myPage.masksCount', { count: UNLOCK_COST })}</span>
        </div>

        <p className="text-xs text-gray-500 text-center mb-4">
          {t('gallery.currentBalance', { count: masks })}
        </p>

        {error && (
          <p className="text-sm text-red-400 text-center mb-4">{error}</p>
        )}

        {/* 버튼 */}
        <div className="flex flex-col gap-2.5">
          {canAfford ? (
            <button
              onClick={handleUnlock}
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {loading ? t('common.processing') : t('gallery.unlockButton', { cost: UNLOCK_COST })}
            </button>
          ) : (
            <button
              onClick={() => { onClose(); navigate('/mask-shop') }}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('gallery.goCharge')}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
