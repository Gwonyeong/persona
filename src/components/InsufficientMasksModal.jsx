import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

export default function InsufficientMasksModal({ open, onClose, currentStyle, spriteBackgroundImage, profileUrl }) {
  const navigate = useNavigate()
  const adultVerified = useStore((s) => !!s.user?.adultVerified)

  // 인증 유저: AROUSED_TEASE 도발 이미지 중 랜덤.
  // 미인증 유저: NEUTRAL 기본 표정 중 랜덤.
  // 해당 emotion 이미지가 없으면 프로필 이미지로 폴백.
  const characterImage = useMemo(() => {
    if (!open) return null
    const targetEmotion = adultVerified ? 'AROUSED_TEASE' : 'NEUTRAL'
    const matches = (currentStyle?.images || []).filter((img) => img.emotion === targetEmotion)
    if (matches.length > 0) {
      return matches[Math.floor(Math.random() * matches.length)].filePath
    }
    return profileUrl || null
  }, [open, currentStyle, adultVerified, profileUrl])

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full bg-gray-950 rounded-t-3xl overflow-hidden border-t border-gray-800 shadow-2xl"
        style={{ maxHeight: '92%', paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          ✕
        </button>

        {characterImage && (
          <div className="relative w-full aspect-[4/5] bg-gray-900 overflow-hidden">
            {spriteBackgroundImage && (
              <img
                src={spriteBackgroundImage}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(2px)' }}
                draggable={false}
              />
            )}
            <img
              src={characterImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-top"
              draggable={false}
            />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-gray-950 to-transparent pointer-events-none" />
          </div>
        )}

        <div className="px-5 pt-5 pb-4">
          <h3 className="text-lg font-bold text-white mb-5">마스크가 필요해요!</h3>

          <button
            type="button"
            onClick={() => {
              onClose()
              navigate('/mask-shop')
            }}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors mb-2"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            1,400원으로 60개 충전하기
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate('/mask-shop?tab=subscription')
            }}
            className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-100 text-sm font-medium transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            구독으로 바로 30개 충전하기
          </button>
        </div>
      </div>
    </div>
  )
}
