import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'

// 홈 '새로운 의상' 로우 — 상점에 공개된 최신 의상을 의상 썸네일 원형으로 노출.
// RecentStoriesRow와 동일한 UI 패턴(그라데이션 링 원형 + 하단 라벨).
// 미인증/비로그인 유저에게 성인전용 의상은 SAFETY 처리(썸네일 완전 숨김).
export default function NewOutfitsRow() {
  const { t } = useTranslation()
  const [outfits, setOutfits] = useState(null)
  const navigate = useNavigate()
  const user = useStore((s) => s.user)

  useEffect(() => {
    api
      .get('/characters/shop/new-styles?limit=10')
      .then(({ items }) => setOutfits(items || []))
      .catch(() => setOutfits([]))
  }, [])

  // 로딩 중 깜빡임 방지 — 비어있는 게 확정된 후에만 처리
  if (outfits === null) return null

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-gray-200">
            {t('home.newOutfits')}
          </h2>
          <span
            className="px-1.5 py-[1px] bg-red-500 text-white text-[9px] font-bold rounded-md leading-none"
            style={{ letterSpacing: '0.03em' }}
          >
            NEW
          </span>
        </div>
      </div>

      {outfits.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center">
          {t('home.noOutfits')}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {outfits.map((o) => {
            const needVerify = o.adultOnly && !user?.adultVerified
            return (
              <button
                key={o.styleId}
                onClick={() => navigate('/mask-shop?tab=styles')}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 w-20"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                  <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-800">
                      {/* 미인증 유저 성인전용 의상: 썸네일 완전 숨김 + SAFETY */}
                      {o.thumbnailUrl && !needVerify && (
                        <img
                          src={o.thumbnailUrl}
                          alt={o.name || ''}
                          draggable={false}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                      {needVerify && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 pointer-events-none">
                          <span className="text-[9px] font-bold tracking-wide text-white/90 uppercase">safety</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5 w-full px-0.5">
                  {o.characterName && (
                    <div className="flex items-center gap-1 max-w-full">
                      {o.characterProfileImage ? (
                        <img
                          src={o.characterProfileImage}
                          alt=""
                          draggable={false}
                          className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-700"
                        />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-gray-800 flex-shrink-0" />
                      )}
                      <span className="text-[11px] text-gray-200 truncate">
                        {o.characterName}
                      </span>
                    </div>
                  )}
                  <span className="text-[10px] text-gray-500 w-full text-center truncate leading-tight">
                    {o.name}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
