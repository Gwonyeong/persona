import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import MaskIcon from '../../components/MaskIcon'

const REWARD_LABEL = {
  MASK: '마스크',
  VOICE: '특별 보이스',
  GALLERY: '특별 미디어',
  PROFILE: '프로필 이미지',
}

function RewardPreview({ tier }) {
  const { rewardType, rewardPayload, claimed } = tier
  // GALLERY/PROFILE 미수령 시 미리보기용 약한 블러 (수령하면 해제)
  const visualBlur = !claimed && (rewardType === 'GALLERY' || rewardType === 'PROFILE')
  const blurClass = visualBlur ? 'blur-sm scale-105' : ''
  if (rewardType === 'MASK') {
    const amount = rewardPayload?.amount || 0
    return (
      <div className="flex items-center gap-2">
        <MaskIcon style={{ width: 28, height: 28 }} />
        <span className="font-bold text-base text-gray-100">{amount}개</span>
      </div>
    )
  }
  if (rewardType === 'VOICE') {
    const character = rewardPayload?.preview?.character
    return (
      <div className="flex items-center gap-2 min-w-0">
        {character?.profileImage ? (
          <img
            src={character.profileImage}
            alt=""
            className="w-12 h-12 rounded-full object-cover border border-indigo-600/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-600/40 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-300">
              <path d="M9 18V5l12-2v13M9 9h12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            </svg>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-gray-400">{character?.name || ''}</p>
          <p className="text-sm text-gray-100 truncate">{rewardPayload?.title || '음성'}</p>
        </div>
      </div>
    )
  }
  if (rewardType === 'GALLERY') {
    const preview = rewardPayload?.preview
    const count = preview?.count || 0
    const isVideo = preview?.thumbnailUrl && /\.(mp4|webm|mov)$/i.test(preview.thumbnailUrl)
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0 bg-gray-800">
          {preview?.thumbnailUrl && (
            isVideo ? (
              <video src={preview.thumbnailUrl} className={`w-full h-full object-cover ${blurClass}`} muted />
            ) : (
              <img src={preview.thumbnailUrl} alt="" className={`w-full h-full object-cover ${blurClass}`} />
            )
          )}
          {visualBlur && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </div>
          )}
          {count > 1 && (
            <span className="absolute bottom-0 right-0 px-1 text-[9px] font-bold bg-black/70 text-white rounded-tl">
              +{count - 1}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400">{preview?.character?.name || ''}</p>
          <p className="text-sm text-gray-100 truncate">
            {preview?.title || '갤러리'}{count > 0 && <span className="text-xs text-gray-500 ml-1">({count}장)</span>}
          </p>
        </div>
      </div>
    )
  }
  if (rewardType === 'PROFILE') {
    const preview = rewardPayload?.preview
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-700 flex-shrink-0 bg-gray-800">
          {preview?.imageUrl && (
            <img src={preview.imageUrl} alt="" className={`w-full h-full object-cover ${blurClass}`} />
          )}
          {visualBlur && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400">{preview?.character?.name || ''}</p>
          <p className="text-sm text-gray-100 truncate">{preview?.title || '프로필'}</p>
        </div>
      </div>
    )
  }
  return null
}

function TierCard({ tier, onClaim, claiming, onConditionClick }) {
  const { threshold, title, claimed, eligible, conditionsMet, claimable, unmetReasons = [] } = tier
  const stateClass = claimed
    ? 'border-emerald-600/40 bg-emerald-950/20'
    : claimable
      ? 'border-amber-500/60 bg-amber-950/20 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]'
      : eligible
        ? 'border-orange-700/40 bg-orange-950/10'
        : 'border-gray-800 bg-gray-900/60'

  const showVoicePlayer = claimed && tier.rewardType === 'VOICE' && tier.rewardPayload?.audioUrl

  return (
    <div className={`p-3 rounded-xl border ${stateClass}`}>
      <div className="flex items-center gap-3">
        {/* 좌측: 임계치 */}
        <div className="flex-shrink-0 w-14 flex flex-col items-center">
          <div className={`flex items-center gap-0.5 ${claimed ? 'opacity-50' : ''}`}>
            <MaskIcon style={{ width: 14, height: 14 }} />
            <span className="text-xs font-bold text-gray-200">{threshold}</span>
          </div>
          {title && <span className="mt-0.5 text-[10px] text-gray-500 text-center truncate w-full">{title}</span>}
        </div>

        {/* 중앙: 보상 + 조건 */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase text-gray-500 mb-1 tracking-wider">{REWARD_LABEL[tier.rewardType] || tier.rewardType}</p>
          <RewardPreview tier={tier} />
          {/* 조건 태그: 미충족인 경우에만 노출. 이미 만족한 조건은 표시 안 함 */}
          {(unmetReasons.includes('PURCHASE_REQUIRED') || unmetReasons.includes('ADULT_VERIFICATION_REQUIRED')) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {unmetReasons.includes('PURCHASE_REQUIRED') && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-900/30 text-orange-300 border-orange-700/40">
                  🛒 마스크 1회 이상 구매 필요
                </span>
              )}
              {unmetReasons.includes('ADULT_VERIFICATION_REQUIRED') && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-900/30 text-orange-300 border-orange-700/40">
                  🔞 성인인증 필요
                </span>
              )}
            </div>
          )}
        </div>

        {/* 우측: 클레임 상태 */}
        <div className="flex-shrink-0">
          {claimed ? (
            <div className="w-9 h-9 rounded-full bg-emerald-600/20 border border-emerald-600/40 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : claimable ? (
            <button
              onClick={() => onClaim(tier)}
              disabled={claiming}
              className="px-3 py-2 text-xs font-bold rounded-lg bg-amber-500 text-gray-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {claiming ? '...' : '받기'}
            </button>
          ) : eligible && !conditionsMet ? (
            <button
              onClick={() => onConditionClick(unmetReasons[0])}
              className="px-2 py-2 text-[10px] font-bold rounded-lg bg-orange-600/30 text-orange-200 border border-orange-700/40 hover:bg-orange-600/40 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              조건<br />필요
            </button>
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* 수령한 VOICE — 대사 + 플레이어 항상 펼침 (재청취용) */}
      {showVoicePlayer && (
        <div className="mt-3 pt-3 border-t border-emerald-700/30">
          {tier.rewardPayload.text && (
            <p className="text-sm text-gray-300 italic mb-2 leading-relaxed whitespace-pre-line">
              “{tier.rewardPayload.text}”
            </p>
          )}
          <audio src={tier.rewardPayload.audioUrl} controls preload="none" className="w-full" />
        </div>
      )}
    </div>
  )
}

function ClaimResultModal({ grant, onClose }) {
  if (!grant) return null
  const { type, payload } = grant
  const characterName = payload?.preview?.character?.name
  const title = characterName ? `${characterName}의 보상을 받았어요!` : '보상을 받았어요!'
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <p className="text-center text-xs text-amber-400 tracking-wider mb-1">PASS REWARD</p>
        <h3 className="text-center text-lg font-bold text-gray-100 mb-4">{title}</h3>

        <div className="flex justify-center mb-5">
          {type === 'MASK' && (
            <div className="flex items-center gap-3">
              <MaskIcon style={{ width: 48, height: 48 }} />
              <span className="text-3xl font-bold text-gray-100">+{payload?.amount || 0}</span>
            </div>
          )}
          {type === 'VOICE' && payload?.audioUrl && (
            <audio src={payload.audioUrl} controls autoPlay className="w-full" />
          )}
          {type === 'GALLERY' && payload?.preview?.images?.length > 0 && (
            <div className={`grid gap-2 w-full ${payload.preview.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {payload.preview.images.slice(0, 4).map((img) => {
                const isVid = /\.(mp4|webm|mov)$/i.test(img.url)
                return isVid ? (
                  <video
                    key={img.id}
                    src={img.url}
                    controls
                    muted
                    playsInline
                    controlsList="nodownload"
                    className="w-full aspect-[9/16] rounded-lg object-cover bg-black"
                  />
                ) : (
                  <img key={img.id} src={img.url} alt="" className="w-full aspect-[9/16] rounded-lg object-cover bg-black" />
                )
              })}
              {payload.preview.images.length > 4 && (
                <div className="col-span-2 text-center text-xs text-gray-400">외 {payload.preview.images.length - 4}장 (갤러리에서 확인)</div>
              )}
            </div>
          )}
          {type === 'PROFILE' && payload?.preview?.imageUrl && (
            <img src={payload.preview.imageUrl} alt="" className="w-32 h-32 rounded-full object-cover border-2 border-amber-400" />
          )}
        </div>

        {type === 'GALLERY' && (
          <p className="text-center text-xs text-gray-400 mb-4">캐릭터 갤러리에서 확인할 수 있어요!</p>
        )}
        {type === 'PROFILE' && (
          <p className="text-center text-xs text-gray-400 mb-4">캐릭터 페이지에서 프로필로 적용할 수 있습니다</p>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 bg-amber-500 text-gray-950 font-bold rounded-xl hover:bg-amber-400 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          확인
        </button>
      </div>
    </div>
  )
}

export default function MaskPass() {
  const navigate = useNavigate()
  const { setMasks } = useStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState(null)
  const [grant, setGrant] = useState(null)

  async function load() {
    try {
      const result = await api.get('/mask-pass')
      setData(result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleClaim(tier) {
    if (claimingId) return
    setClaimingId(tier.id)
    try {
      const result = await api.post(`/mask-pass/${tier.id}/claim`)
      // 마스크 보상이면 useStore에도 반영
      if (result.grant?.newMasksBalance !== undefined) {
        setMasks(result.grant.newMasksBalance)
      }
      // 보상 표시용으로 tier preview를 grant.payload에 머지
      const grantToShow = {
        type: result.grant.type,
        payload: { ...(result.grant.payload || {}), preview: tier.rewardPayload?.preview },
      }
      setGrant(grantToShow)
      await load()
    } catch (e) {
      console.error(e)
      const code = e.data?.error
      if (code === 'PURCHASE_REQUIRED') {
        if (confirm('마스크 구매 이력이 필요해요. 상점으로 이동할까요?')) navigate('/mask-shop')
      } else if (code === 'ADULT_VERIFICATION_REQUIRED') {
        if (confirm('성인인증이 필요해요. 인증 페이지로 이동할까요?')) navigate('/adult-verify')
      } else {
        alert(code || '보상 수령 실패')
      }
    } finally {
      setClaimingId(null)
    }
  }

  function handleConditionClick(reason) {
    if (reason === 'PURCHASE_REQUIRED') {
      if (confirm('이 보상은 마스크 구매 이력이 필요해요. 상점으로 이동할까요?')) navigate('/mask-shop')
    } else if (reason === 'ADULT_VERIFICATION_REQUIRED') {
      if (confirm('이 보상은 성인인증이 필요해요. 인증 페이지로 이동할까요?')) navigate('/adult-verify')
    }
  }

  const maxThreshold = data?.tiers?.length ? data.tiers[data.tiers.length - 1].threshold : 1000
  const progress = data ? Math.min(100, (data.lifetimeMasksSpent / maxThreshold) * 100) : 0

  return (
    <div className="relative min-h-full bg-gray-950 text-gray-100 pb-12">
      <Helmet><title>마스크 패스</title></Helmet>

      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <button
          onClick={() => navigate(-1)}
          className="-ml-2 p-2 text-gray-300"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-base font-bold">마스크 패스</h1>
      </div>

      {/* 진행도 */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-gradient-to-br from-amber-950/30 to-gray-900 border border-amber-700/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-amber-400 mb-1 tracking-wider">총 사용량</p>
              <p className="text-2xl font-bold text-gray-100">
                {data?.lifetimeMasksSpent?.toLocaleString() || 0}
                <span className="text-sm text-gray-400 font-normal ml-1">/ {maxThreshold.toLocaleString()}</span>
              </p>
            </div>
            <MaskIcon style={{ width: 40, height: 40 }} />
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {!!data?.unclaimedEligibleCount && (
            <p className="mt-3 text-xs text-amber-300">
              받을 수 있는 보상이 {data.unclaimedEligibleCount}개 있어요
            </p>
          )}
        </div>
      </div>

      {/* 티어 목록 */}
      <div className="px-4 mt-3 space-y-2">
        {loading && <p className="text-center text-sm text-gray-500 py-8">불러오는 중...</p>}
        {!loading && data?.tiers?.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-8">아직 등록된 보상이 없어요</p>
        )}
        {!loading &&
          data?.tiers?.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              onClaim={handleClaim}
              onConditionClick={handleConditionClick}
              claiming={claimingId === tier.id}
            />
          ))}
      </div>

      <ClaimResultModal grant={grant} onClose={() => setGrant(null)} />
    </div>
  )
}
