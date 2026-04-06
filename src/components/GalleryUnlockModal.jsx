import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const UNLOCK_COST = 5

export default function GalleryUnlockModal({ content, characterId, onClose, onUnlocked }) {
  const { masks, token } = useStore()
  const navigate = useNavigate()
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
        setError(result.error === 'Insufficient masks' ? '마스크가 부족합니다' : result.error)
        setLoading(false)
        return
      }
      useStore.getState().setMasks(result.masks)
      onUnlocked(content.id)
    } catch (err) {
      setError('해금에 실패했습니다')
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
              style={{ filter: 'blur(16px) brightness(0.4)' }}
            />
          )}
        </div>

        {/* 정보 */}
        <div className="text-center mb-4">
          <p className="text-lg font-bold text-gray-100">
            {content.missionName || content.title || '갤러리 이미지'}
          </p>
          {content.images?.length > 1 && (
            <p className="text-xs text-gray-500 mt-0.5">
              이미지 {content.images.length}장
            </p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            마스크를 사용하여 이미지를 해금할 수 있어요
          </p>
        </div>

        {/* 비용 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60 rounded-xl mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎭</span>
            <span className="text-sm text-gray-300">해금 비용</span>
          </div>
          <span className="text-sm font-bold text-indigo-400">{UNLOCK_COST}개</span>
        </div>

        <p className="text-xs text-gray-500 text-center mb-4">
          현재 보유: <span className={canAfford ? 'text-indigo-400' : 'text-red-400'}>{masks}개</span>
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
              {loading ? '해금 중...' : `🎭 ${UNLOCK_COST}개로 해금하기`}
            </button>
          ) : (
            <button
              onClick={() => { onClose(); navigate('/my') }}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              마스크 충전하러 가기
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
