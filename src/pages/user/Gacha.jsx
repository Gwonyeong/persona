import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import MaskIcon from '../../components/MaskIcon'

export default function Gacha() {
  const { t } = useTranslation()
  const [boxes, setBoxes] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api
      .get('/gacha/boxes')
      .then(({ boxes }) => {
        if (!cancelled) setBoxes(boxes)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.status === 403 && err.data?.error === 'ADULT_VERIFICATION_REQUIRED') {
          setError('ADULT_VERIFY')
        } else {
          setError('LOAD_FAIL')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error === 'ADULT_VERIFY') {
    return (
      <div
        className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center px-6 text-center"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="text-2xl mb-3">🔒</div>
        <h2 className="text-lg font-bold mb-2">{t('gacha.adultRequired')}</h2>
        <p className="text-sm text-gray-400 mb-6">{t('gacha.adultDesc')}</p>
        <button
          onClick={() => navigate('/adult-verify')}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm rounded-full"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('gacha.verify')}
        </button>
      </div>
    )
  }

  if (error === 'LOAD_FAIL') {
    return (
      <div className="p-6 text-center text-sm text-red-400">
        {t('gacha.loadFail')}
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-gray-100"
      style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
    >
      <Helmet>
        <title>{t('gacha.pageTitle')}</title>
      </Helmet>

      {/* 헤더 — UserLayout 이 /gacha 에서 탭바를 숨기므로 뒤로가기는 여기서 제공한다. */}
      <div
        className="sticky top-0 z-20 bg-gray-950/90 backdrop-blur-sm border-b border-gray-900"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-12 px-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label={t('gacha.exit')}
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-base font-bold">{t('gacha.listHeading')}</h1>
        </div>
      </div>

      {!boxes ? (
        <div className="p-6 text-center text-sm text-gray-400">{t('common.loading')}</div>
      ) : boxes.length === 0 ? (
        <div className="text-center pt-24 px-6">
          <div className="text-5xl mb-3">🎁</div>
          <p className="text-sm text-gray-400">{t('gacha.empty')}</p>
          <p className="text-xs text-gray-600 mt-1">{t('gacha.emptyDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          {boxes.map((box) => (
            <GachaBoxCard key={box.id} box={box} />
          ))}
        </div>
      )}
    </div>
  )
}

const RARITY_ORDER = ['S', 'A', 'B', 'C', 'D']

// 미리보기 아이템 중 가장 높은 등급만 추린다 (보통 S = STYLE_SET).
function topRarityItems(previewItems) {
  if (!previewItems?.length) return []
  for (const r of RARITY_ORDER) {
    const ofRarity = previewItems.filter((p) => p.rarity === r)
    if (ofRarity.length > 0) return ofRarity
  }
  return []
}

function GachaBoxCard({ box }) {
  const { t } = useTranslation()
  const pityPct =
    box.pity && box.pity.threshold > 0
      ? Math.min(100, (box.pity.count / box.pity.threshold) * 100)
      : 0
  const pityReady = box.pity?.ready

  // 썸네일 — 최고 등급(S) 보상 스타일의 대표 이미지 중 랜덤 1장. 마운트 시 한 번만 고른다.
  // 스타일이 비공개면 서버가 previewItems 에서 제외하므로 커버 이미지로 폴백.
  const thumb = useMemo(() => {
    const top = topRarityItems(box.previewItems)
    if (!top.length) return { url: box.coverImage, item: null }
    const pick = top[Math.floor(Math.random() * top.length)]
    return { url: pick.imageUrl || box.coverImage, item: pick }
  }, [box.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Link
      to={`/gacha/${box.id}`}
      className="relative block w-full aspect-[9/16] rounded-2xl overflow-hidden bg-gray-900 group"
      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
    >
      {thumb.url ? (
        <img
          src={thumb.url}
          alt={box.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-active:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-900 via-indigo-900 to-gray-900" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />

      {pityReady ? (
        <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-emerald-500 text-emerald-950 text-[9px] font-bold shadow">
          {t('gacha.pityReadyBadge')}
        </span>
      ) : box.free?.remaining > 0 ? (
        <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-emerald-500 text-emerald-950 text-[9px] font-bold shadow">
          {t('gacha.freeBadge', { count: box.free.remaining })}
        </span>
      ) : null}

      {thumb.item?.characterName && (
        <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-semibold text-white/90 max-w-[70%] truncate">
          {thumb.item.characterName}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-2.5 space-y-1.5">
        <h3 className="text-[13px] font-bold text-white drop-shadow leading-tight line-clamp-2">
          {box.name}
        </h3>

        {box.pity && box.pity.threshold > 0 && (
          <div>
            <div className="flex justify-between text-[9px] text-gray-200 mb-0.5 drop-shadow">
              <span className="font-semibold">
                {box.pity.count}/{box.pity.threshold}
              </span>
              {!pityReady && (
                <span className="opacity-75">
                  {t('gacha.remainingCount', { count: box.pity.threshold - box.pity.count })}
                </span>
              )}
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 transition-all"
                style={{ width: `${pityPct}%` }}
              />
            </div>
          </div>
        )}

        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-200 bg-black/45 backdrop-blur-sm rounded-full px-2 py-0.5">
          <MaskIcon /> {box.cost} {t('gacha.perDraw')}
        </span>
      </div>
    </Link>
  )
}
