import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import MaskIcon from '../../components/MaskIcon'

// rewardType → i18n 키. 라벨 렌더 시 t()로 해석(displayName 없을 때 폴백).
const REWARD_TYPE_LABEL_KEY = {
  EXPRESSION_IMAGE: 'gacha.rewardExpressionImage',
  EXPRESSION_BUNDLE: 'gacha.rewardExpressionBundle',
  PROFILE_IMAGE: 'gacha.rewardProfileImage',
  SPECIAL_VOICE: 'gacha.rewardSpecialVoice',
  STYLE_SET: 'gacha.rewardStyleSet',
}
const rewardTypeLabel = (t, type) =>
  REWARD_TYPE_LABEL_KEY[type] ? t(REWARD_TYPE_LABEL_KEY[type]) : type

const RARITY_COLORS = {
  S: 'from-fuchsia-600 to-fuchsia-900 text-fuchsia-100',
  A: 'from-amber-600 to-amber-800 text-amber-100',
  B: 'from-violet-700 to-violet-900 text-violet-100',
  C: 'from-sky-700 to-sky-900 text-sky-100',
  D: 'from-gray-600 to-gray-700 text-gray-100',
}

const RARITY_ORDER = ['S', 'A', 'B', 'C', 'D']
const RARITY_LABEL_COLOR = {
  S: 'text-fuchsia-300',
  A: 'text-amber-300',
  B: 'text-violet-300',
  C: 'text-sky-300',
  D: 'text-gray-300',
}

// 미리보기 후보 중 가장 높은 등급의 아이템만 추려서 반환 (최대 4개).
function pickTopRarity(previewItems) {
  if (!previewItems?.length) return []
  for (const r of RARITY_ORDER) {
    const ofRarity = previewItems.filter((p) => p.rarity === r)
    if (ofRarity.length > 0) return ofRarity.slice(0, 4)
  }
  return []
}

export default function GachaBox() {
  const { t } = useTranslation()
  const { id } = useParams()
  const boxId = Number(id)
  const navigate = useNavigate()
  const { user, setUser } = useStore()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [drawResult, setDrawResult] = useState(null) // { results, blockedReason, totalCost, ... }
  const [showPityPick, setShowPityPick] = useState(false)
  const [showOdds, setShowOdds] = useState(false)
  const [drawing, setDrawing] = useState(false)

  const load = async () => {
    try {
      const data = await api.get(`/gacha/boxes/${boxId}`)
      setStatus(data)
    } catch (err) {
      if (err.status === 403 && err.data?.error === 'ADULT_VERIFICATION_REQUIRED') {
        setError('ADULT_VERIFY')
      } else if (err.status === 404) {
        setError('NOT_FOUND')
      } else {
        setError('LOAD_FAIL')
      }
    }
  }

  useEffect(() => {
    load()
  }, [boxId])

  const draw = async (count) => {
    if (drawing) return
    setDrawing(true)
    try {
      const result = await api.post(`/gacha/boxes/${boxId}/draw`, { count })
      // 유저 마스크 잔액 업데이트
      if (typeof result.newMasksBalance === 'number' && user) {
        setUser({ ...user, masks: result.newMasksBalance })
      }
      setDrawResult(result)
      // 박스 상태 새로고침
      await load()
    } catch (err) {
      const code = err.data?.error
      if (code === 'INSUFFICIENT_MASKS') {
        alert(t('gacha.insufficientMasks'))
      } else if (code === 'PITY_READY') {
        setShowPityPick(true)
      } else if (code === 'BOX_COMPLETED') {
        alert(t('gacha.boxCompleted'))
      } else if (code === 'BOX_INACTIVE' || code === 'BOX_NOT_STARTED' || code === 'BOX_ENDED') {
        alert(t('gacha.boxUnavailable'))
      } else {
        alert(t('gacha.drawFailed', { msg: code || err.message }))
      }
    } finally {
      setDrawing(false)
    }
  }

  const handlePityPick = async (itemId) => {
    try {
      const result = await api.post(`/gacha/boxes/${boxId}/pity-pick`, { itemId })
      setShowPityPick(false)
      setDrawResult({
        results: [result.result],
        blockedReason: null,
        totalCost: 0,
        pityCount: 0,
        pityReady: false,
      })
      await load()
    } catch (err) {
      alert(t('gacha.claimFailed', { msg: err.data?.error || err.message }))
    }
  }

  if (error === 'ADULT_VERIFY') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gray-950 text-gray-100">
        <p className="text-lg font-bold mb-2">{t('gacha.adultRequired')}</p>
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

  if (error === 'NOT_FOUND') {
    return <div className="p-6 text-center text-sm text-gray-400">{t('gacha.notFound')}</div>
  }

  if (error || !status) {
    return <div className="p-6 text-center text-sm text-gray-400">{t('common.loading')}</div>
  }

  const { box, items, progress, pity } = status
  const masks = user?.masks ?? 0
  const freeRemaining = status.free?.remaining || 0
  const has1Free = freeRemaining > 0
  const canAfford = has1Free || masks >= box.cost
  const canAfford10 = masks >= (box.bulkCost ?? box.cost * 10)
  const pityProgressPct = pity.threshold > 0 ? Math.min(100, (pity.count / pity.threshold) * 100) : 0

  // 어드민이 isPreview 켠 미리보기 중 가장 높은 등급만, 최대 4개.
  const topPreviewItems = pickTopRarity(status.previewItems || [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{t('gacha.boxPageTitle', { name: box.name })}</title>
      </Helmet>

      {/* Hero 영역 — 배경 이미지 + 그라데이션 오버레이 + 상단 액션 */}
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        {box.coverImage ? (
          <img
            src={box.coverImage}
            alt={box.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-900 via-indigo-900 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-gray-950" />

        <div
          className="absolute inset-x-0 top-0 px-4 pt-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
          <Link
            to="/"
            className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-sm text-white hover:bg-black/70"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            ←
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOdds(true)}
              className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs font-semibold text-white hover:bg-black/70"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('gacha.odds')}
            </button>
            <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs font-semibold text-amber-200 inline-flex items-center gap-1">
              <MaskIcon /> {masks}
            </span>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
          <h1 className="text-2xl font-bold text-white drop-shadow-lg">{box.name}</h1>
          {box.description && (
            <p className="text-sm text-gray-200 mt-1 drop-shadow line-clamp-2">{box.description}</p>
          )}
        </div>
      </div>

      <div
        className="px-4 mt-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {/* 주요 보상 — 가장 높은 등급만, 최대 4개. 어드민이 isPreview 켠 것 중에서 필터. */}
        {topPreviewItems.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] text-gray-400 mb-1.5">{t('gacha.mainRewards')}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {topPreviewItems.map((p) => (
                <DetailPreviewTile key={p.id} item={p} />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={drawing || !canAfford || progress.completed}
            onClick={() => draw(1)}
            className={`py-3 rounded-xl text-white font-semibold disabled:bg-gray-700 disabled:text-gray-500 inline-flex items-center justify-center gap-1 ${
              has1Free
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {has1Free ? (
              <>{t('gacha.draw1Free', { count: freeRemaining })}</>
            ) : (
              <>
                {t('gacha.draw1')} {box.cost} <MaskIcon />
              </>
            )}
          </button>
          <button
            disabled={drawing || !canAfford10 || progress.completed}
            onClick={() => draw(10)}
            className="py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold disabled:bg-gray-700 disabled:text-gray-500 inline-flex items-center justify-center gap-1"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('gacha.draw10')} {box.bulkCost ?? box.cost * 10} <MaskIcon />
          </button>
        </div>

        {pity.ready && (
          <button
            onClick={() => setShowPityPick(true)}
            className="mt-3 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('gacha.pityPickCta')}
          </button>
        )}

        {pity.threshold > 0 && !pity.ready && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-gray-400 mb-1">
              <span>{t('gacha.pityRemaining', { count: pity.threshold - pity.count })}</span>
              <span>
                {pity.count}/{pity.threshold}
              </span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${pityProgressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {drawResult && (
        <ResultModal
          result={drawResult}
          items={items}
          onClose={() => setDrawResult(null)}
          onPityPick={() => {
            setDrawResult(null)
            setShowPityPick(true)
          }}
          onViewCharacter={(charId) => {
            setDrawResult(null)
            navigate(`/characters/${charId}`)
          }}
        />
      )}

      {showPityPick && (
        <PityPickModal
          box={box}
          items={items}
          onClose={() => setShowPityPick(false)}
          onPick={handlePityPick}
        />
      )}

      {showOdds && (
        <OddsModal
          box={box}
          items={items}
          previewItems={status.previewItems || []}
          onClose={() => setShowOdds(false)}
        />
      )}
    </div>
  )
}

function DetailPreviewTile({ item }) {
  const { t } = useTranslation()
  // 클릭마다 다음 영상으로 순환. STYLE_SET 의 도발 단계(없으면 다음 단계) 영상 풀에서.
  const videos = item.videoUrls || []
  const [videoIdx, setVideoIdx] = useState(null) // null = 모달 닫힘
  const hasVideo = videos.length > 0

  const openOrAdvance = () => {
    if (!hasVideo) return
    setVideoIdx((prev) => {
      if (prev === null) return 0
      return (prev + 1) % videos.length
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openOrAdvance}
        disabled={!hasVideo}
        className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black/40 w-full block active:scale-95 transition-transform disabled:active:scale-100"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', cursor: hasVideo ? 'pointer' : 'default' }}
        aria-label={hasVideo ? t('gacha.videoPreviewPlay') : undefined}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-white/70 px-1 text-center">
            {item.label || '?'}
          </div>
        )}

        {/* 이름 위 — 스타일 안 영상 연결된 표정 이미지 총 갯수 */}
        {hasVideo && (
          <div className="absolute inset-x-0 bottom-0">
            <div className="px-1.5 pt-3 pb-1 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
              <div className="text-[8px] text-white/80 mb-0.5">
                {t('gacha.videoCount', { count: item.totalVideoCount ?? videos.length })}
              </div>
              <div className="flex items-center gap-1">
                {item.characterProfileImage ? (
                  <img
                    src={item.characterProfileImage}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover flex-shrink-0 ring-1 ring-white/30"
                  />
                ) : null}
                <span className="text-[9px] text-white font-semibold truncate">
                  {item.characterName || item.label}
                </span>
              </div>
            </div>
          </div>
        )}
        {!hasVideo && (
          <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/85 to-transparent">
            <div className="flex items-center gap-1">
              {item.characterProfileImage ? (
                <img
                  src={item.characterProfileImage}
                  alt=""
                  className="w-4 h-4 rounded-full object-cover flex-shrink-0 ring-1 ring-white/30"
                />
              ) : null}
              <span className="text-[9px] text-white/90 font-semibold truncate">
                {item.characterName || item.label}
              </span>
            </div>
          </div>
        )}

        <span className={`absolute top-1 left-1 px-1 py-0.5 bg-black/65 text-[8px] font-bold rounded ${RARITY_LABEL_COLOR[item.rarity] || 'text-white'}`}>
          {item.rarity}
        </span>
        {item.badge && (
          <span className="absolute top-1 right-1 px-1 py-0.5 bg-black/65 text-[8px] font-bold text-white rounded">
            {item.badge}
          </span>
        )}
        {hasVideo && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white text-xs">
            ▶
          </span>
        )}
      </button>

      {hasVideo && videoIdx !== null && (
        <PreviewVideoModal
          videoUrl={videos[videoIdx]}
          index={videoIdx}
          total={videos.length}
          totalVideoCount={item.totalVideoCount ?? videos.length}
          characterName={item.characterName}
          characterProfileImage={item.characterProfileImage}
          onNext={() => setVideoIdx((i) => (i + 1) % videos.length)}
          onClose={() => setVideoIdx(null)}
        />
      )}
    </>
  )
}

function PreviewVideoModal({ videoUrl, index, total, totalVideoCount, characterName, characterProfileImage, onNext, onClose }) {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          key={videoUrl}
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ filter: 'blur(18px)', transform: 'scale(1.1)' }}
        />

        {/* 상단 — 캐릭터 정보 + 영상 카운트 */}
        <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent">
          {characterProfileImage && (
            <img
              src={characterProfileImage}
              alt=""
              className="w-7 h-7 rounded-full object-cover ring-1 ring-white/40"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/70">
              {t('gacha.previewVideoIndex', { index: index + 1, total })}
            </div>
            <div className="text-sm font-bold text-white truncate">
              {characterName || '?'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            ✕
          </button>
        </div>

        {/* 하단 안내 + 다음 버튼 */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
          <span className="text-[10px] text-white/70">{t('gacha.previewBlurred')}</span>
          {total > 1 && (
            <button
              onClick={onNext}
              className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-white text-xs font-semibold hover:bg-white/25"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('gacha.nextVideo')}
            </button>
          )}
        </div>

        {/* 우측 아래 — 현재 풀 외 추가 영상 어필 태그 */}
        {totalVideoCount - total > 0 && (
          <div className="absolute bottom-14 right-3 z-10 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-semibold shadow-lg ring-1 ring-white/20 inline-flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
            {t('gacha.moreVideos', { count: totalVideoCount - total })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatPct(n) {
  if (!Number.isFinite(n) || n <= 0) return '0%'
  if (n >= 1) return `${n.toFixed(2).replace(/\.?0+$/, '')}%`
  // 작은 값은 유효숫자 2자리
  return `${n.toPrecision(2)}%`
}

function OddsModal({ box, items, previewItems, onClose }) {
  const { t } = useTranslation()
  const rates = box.rarityRates || {}
  const previewMap = new Map((previewItems || []).map((p) => [p.id, p]))

  // 박스가 사용하는 등급 + 아이템들 그룹.
  // 등급 내 미보유 수 = "유효 분모" — 실효 확률은 (등급% / 미보유 수).
  const groups = RARITY_ORDER.map((rarity) => {
    const rate = rates[rarity]
    if (rate == null) return null
    const group = items.filter((it) => it.rarity === rarity)
    const available = group.filter((it) => !it.owned).length
    return { rarity, rate: Number(rate), items: group, available }
  }).filter(Boolean)

  // 아이템별 확률 계산
  // - 정적(PROFILE/SPECIAL_VOICE/STYLE_SET): 등급% / 등급내 미보유 슬롯 수. 본인이 미보유면 그 확률, 보유면 0%.
  // - 동적(EXPRESSION_*): 등급% × (1/(미보유 풀 크기 + 같은 등급의 다른 슬롯 미보유 수))
  //   다만 풀이 슬롯 단위가 아니라 등급 슬롯 자체가 1개로 카운트되는 식이므로,
  //   슬롯 확률 = 등급% / 등급내 슬롯 미보유 수, 그 안에서 아이템 하나당 = (슬롯%/풀크기).
  const computeItemOdds = (it, group) => {
    if (group.available === 0) return 0
    if (it.owned) return 0
    const slotPct = group.rate / group.available
    if (it.rewardType === 'EXPRESSION_IMAGE' || it.rewardType === 'EXPRESSION_BUNDLE') {
      const poolAvail = it.dynamicPool?.available || 0
      if (poolAvail === 0) return 0
      return slotPct / poolAvail
    }
    return slotPct
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">{t('gacha.odds')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 확정 보상 안내 */}
          {box.pityCount > 0 && (
            <div className="bg-emerald-950/40 border border-emerald-700/40 rounded-lg p-3">
              <p className="text-[11px] text-emerald-200 leading-relaxed">
                <strong>{t('gacha.oddsPityLabel')}</strong> {t('gacha.oddsPityDesc', { count: box.pityCount })}
              </p>
            </div>
          )}

          {groups.length === 0 ? (
            <p className="text-center text-sm text-gray-500">{t('gacha.noRarity')}</p>
          ) : (
            groups.map((g) => (
              <div key={g.rarity}>
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className={`text-base font-bold ${RARITY_LABEL_COLOR[g.rarity] || 'text-white'}`}
                  >
                    {g.rarity}
                  </span>
                  <div className="text-right">
                    <div className="text-sm text-white font-semibold">{g.rate}%</div>
                    <div className="text-[10px] text-gray-500">
                      {t('gacha.slotsAvailable', { available: g.available, total: g.items.length })}
                    </div>
                  </div>
                </div>
                {g.items.length === 0 ? (
                  <p className="text-[11px] text-gray-600 pl-1">
                    {t('gacha.noItemsInRarity')}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {g.items.map((it) => {
                      const preview = previewMap.get(it.id)
                      const odds = computeItemOdds(it, g)
                      const dyn = it.dynamicPool
                      return (
                        <div
                          key={it.id}
                          className={`flex items-center gap-3 rounded-lg p-2 ${
                            it.owned ? 'bg-gray-800/30 opacity-60' : 'bg-gray-800/60'
                          }`}
                        >
                          <div className="w-10 h-10 rounded overflow-hidden bg-black/50 flex-shrink-0 flex items-center justify-center">
                            {preview?.imageUrl ? (
                              <img
                                src={preview.imageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[9px] text-gray-500">—</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white font-medium truncate">
                              {it.displayName || preview?.label || rewardTypeLabel(t, it.rewardType)}
                            </div>
                            {preview?.characterName && (
                              <div className="text-[10px] text-gray-400 truncate">
                                {preview.characterName}
                              </div>
                            )}
                            {dyn && (
                              <div className="text-[10px] text-indigo-300 truncate">
                                {t('gacha.dynPool', { available: dyn.available, total: dyn.total })}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs text-white font-semibold">
                              {it.owned ? '—' : formatPct(odds)}
                            </div>
                            {it.owned && (
                              <div className="text-[10px] text-emerald-400 font-semibold">{t('gacha.owned')}</div>
                            )}
                            {dyn && !it.owned && (
                              <div className="text-[9px] text-gray-500">{t('gacha.perItem')}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}

          <div className="pt-3 border-t border-gray-800 space-y-2">
            <p className="text-[10px] text-gray-500 leading-relaxed">• {t('gacha.oddsNote1')}</p>
            <p className="text-[10px] text-gray-500 leading-relaxed">• {t('gacha.oddsNote2')}</p>
            <p className="text-[10px] text-gray-500 leading-relaxed">• {t('gacha.oddsNote3')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemTile({ item }) {
  const { t } = useTranslation()
  const colorCls = RARITY_COLORS[item.rarity] || RARITY_COLORS.D
  return (
    <div
      className={`relative aspect-square rounded-lg overflow-hidden bg-gradient-to-br ${colorCls} ${
        item.owned ? '' : 'opacity-40 grayscale'
      }`}
    >
      {item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs px-2 text-center">
          {item.displayName || rewardTypeLabel(t, item.rewardType)}
        </div>
      )}
      <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-[9px] font-bold rounded">
        {item.rarity}
      </span>
      {item.owned && (
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-emerald-600 text-[9px] font-bold rounded">
          {t('gacha.owned')}
        </span>
      )}
    </div>
  )
}

function ResultModal({ result, items, onClose, onPityPick, onViewCharacter }) {
  const { t } = useTranslation()
  const results = result.results || []
  // 결과 카드에 맞는 item 데이터를 합침 (previewUrl 등)
  const enriched = results.map((r) => {
    const item = items.find((i) => i.id === r.itemId)
    return {
      ...r,
      previewUrl: r.snapshot?.previewUrl || item?.previewUrl,
      displayName: r.snapshot?.displayName || item?.displayName,
    }
  })

  const isSingle = enriched.length === 1
  // 결과에 STYLE_SET 이 포함되어 있으면 첫 번째 STYLE_SET 의 캐릭터로 바로가기 버튼 노출
  const styleSetReward = enriched.find((r) => r.rewardType === 'STYLE_SET')
  const styleSetCharacterId = styleSetReward?.snapshot?.payload?.characterId
  const styleSetCharacterName = styleSetReward?.snapshot?.payload?.characterName

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-5 pb-3 flex-shrink-0">
          <h2 className="text-center text-base font-bold">
            {isSingle ? t('gacha.resultSingle') : t('gacha.resultMulti', { count: enriched.length })}
          </h2>
        </div>

        <div className={`px-5 overflow-y-auto ${isSingle ? 'flex items-center justify-center' : ''}`}>
          {isSingle ? (
            <div className="w-full max-w-[260px]">
              <ResultCard result={enriched[0]} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {enriched.map((r, i) => (
                <ResultCard key={i} result={r} />
              ))}
            </div>
          )}
        </div>

        <div className="p-5 pt-3 flex-shrink-0 space-y-3">
          {result.blockedReason === 'PITY_REACHED' && (
            <div className="p-3 rounded-lg bg-emerald-900/40 border border-emerald-700/50 text-center">
              <p className="text-emerald-200 text-xs">{t('gacha.pityReachedMsg')}</p>
              <button
                onClick={onPityPick}
                className="mt-2 px-4 py-2 bg-emerald-500 text-emerald-950 text-xs font-bold rounded-full"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('gacha.pityClaim')}
              </button>
            </div>
          )}

          {result.blockedReason === 'BOX_COMPLETED_MID' && (
            <p className="text-center text-xs text-gray-400">
              {t('gacha.boxCompletedMid')}
            </p>
          )}

          {styleSetCharacterId && (
            <button
              onClick={() => onViewCharacter?.(styleSetCharacterId)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {styleSetCharacterName ? t('gacha.viewCharacterNamed', { name: styleSetCharacterName }) : t('gacha.viewCharacter')}
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ result }) {
  const { t } = useTranslation()
  const colorCls = RARITY_COLORS[result.rarity] || RARITY_COLORS.D
  const isExpression =
    result.rewardType === 'EXPRESSION_IMAGE' || result.rewardType === 'EXPRESSION_BUNDLE'
  const isStyleSet = result.rewardType === 'STYLE_SET'
  const characterName = result.snapshot?.payload?.characterName
  const characterProfileImage = result.snapshot?.payload?.characterProfileImage
  // 표정+영상 세트면 결과 카드 본체에 영상 재생, 그 외엔 이미지
  const videoUrl =
    result.rewardType === 'EXPRESSION_BUNDLE'
      ? result.snapshot?.payload?.videoFilePath
      : null
  // EXPRESSION: 캡션은 캐릭터명만. STYLE_SET: 캐릭터명 위에 스타일명 작게. 그 외: displayName.
  const captionText = isExpression
    ? characterName || ''
    : isStyleSet
      ? characterName || ''
      : result.displayName || rewardTypeLabel(t, result.rewardType)
  const subText = isStyleSet ? result.displayName : null

  return (
    <div className={`relative aspect-[9/16] rounded-lg overflow-hidden bg-gradient-to-br ${colorCls}`}>
      {videoUrl ? (
        <video
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      ) : result.previewUrl ? (
        <img src={result.previewUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-center px-2">
          {result.displayName || rewardTypeLabel(t, result.rewardType)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/85 to-transparent">
        {subText && (
          <div className="text-[10px] text-white/80 font-semibold truncate drop-shadow mb-0.5">
            {subText}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {characterProfileImage && (
            <img
              src={characterProfileImage}
              alt=""
              className="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/40"
            />
          )}
          <span className="text-[11px] text-white font-semibold truncate drop-shadow">
            {captionText}
          </span>
        </div>
      </div>
      <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-[10px] font-bold rounded ${RARITY_LABEL_COLOR[result.rarity] || 'text-white'}`}>
        {result.rarity}
      </span>
    </div>
  )
}

// 박스 rarityRates에서 확률이 가장 낮은 등급을 선택. 동률은 더 희귀한 쪽 우선.
// S(최고) > A > B > C > D(최하)
const RARITY_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4 }
function getPityRarity(rarityRates) {
  if (!rarityRates) return null
  const entries = Object.entries(rarityRates).filter(
    ([k, v]) => v != null && RARITY_RANK[k] != null,
  )
  if (!entries.length) return null
  entries.sort((a, b) => Number(a[1]) - Number(b[1]) || RARITY_RANK[a[0]] - RARITY_RANK[b[0]])
  return entries[0][0]
}

function PityPickModal({ box, items, onClose, onPick }) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState(null)
  const pityRarity = getPityRarity(box.rarityRates)
  // 가장 낮은 확률 등급 + 미보유 아이템만 후보
  const candidates = items.filter((it) => it.rarity === pityRarity && !it.owned)

  if (!candidates.length) {
    return (
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-sm">
          <p className="text-sm text-center">
            {t('gacha.pityFull', { rarity: pityRarity })}
          </p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-emerald-700/50 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-5 pb-3 flex-shrink-0 text-center">
          <h2 className="text-base font-bold text-emerald-200">{t('gacha.pityTitle')}</h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('gacha.pitySelectDesc', { rarity: pityRarity })}
          </p>
        </div>

        <div className="px-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3 pb-2 pt-1">
            {candidates.map((it) => {
              const active = selectedId === it.id
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className={`relative rounded-lg overflow-hidden transition-all ${
                    active
                      ? 'ring-2 ring-inset ring-emerald-400'
                      : 'ring-0 hover:ring-1 hover:ring-inset hover:ring-white/30'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <PityCandidateTile item={it} />
                  {active && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-400 text-emerald-950 text-[11px] font-bold flex items-center justify-center shadow">
                      ✓
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-5 pt-3 flex-shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={!selectedId}
            onClick={() => onPick(selectedId)}
            className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-sm rounded-lg disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('gacha.receive')}
          </button>
        </div>
      </div>
    </div>
  )
}

// 천장 후보 타일 — DetailPreviewTile과 동일 스타일 (9:16 + 캐릭터 프로필 + 이름)
function PityCandidateTile({ item }) {
  const { t } = useTranslation()
  const preview = item.preview
  const characterProfileImage = preview?.characterProfileImage
  const characterName = preview?.characterName
  const label = preview?.label || rewardTypeLabel(t, item.rewardType)
  const imageUrl = preview?.imageUrl

  return (
    <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black/40 w-full">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[11px] text-white/70 px-2 text-center">
          {label}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/85 to-transparent">
        <div className="flex items-center gap-1.5">
          {characterProfileImage && (
            <img
              src={characterProfileImage}
              alt=""
              className="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/40"
            />
          )}
          <span className="text-[11px] text-white font-semibold truncate drop-shadow">
            {characterName || label}
          </span>
        </div>
      </div>
      <span
        className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-[10px] font-bold rounded ${
          RARITY_LABEL_COLOR[item.rarity] || 'text-white'
        }`}
      >
        {item.rarity}
      </span>
      {preview?.badge && (
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 text-[10px] font-bold text-white rounded">
          {preview.badge}
        </span>
      )}
    </div>
  )
}
