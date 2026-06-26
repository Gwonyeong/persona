import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import MaskIcon from '../../components/MaskIcon'

export default function Gacha() {
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
        <h2 className="text-lg font-bold mb-2">성인 인증이 필요해요</h2>
        <p className="text-sm text-gray-400 mb-6">가챠는 성인 인증을 마친 회원만 이용할 수 있어요.</p>
        <button
          onClick={() => navigate('/adult-verify')}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm rounded-full"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          본인 인증하기
        </button>
      </div>
    )
  }

  if (error === 'LOAD_FAIL') {
    return (
      <div className="p-6 text-center text-sm text-red-400">
        가챠 목록을 불러오지 못했어요.
      </div>
    )
  }

  if (!boxes) return <div className="p-6 text-center text-sm text-gray-400">로딩 중...</div>

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>가챠 — 페소나</title>
      </Helmet>

      {boxes.length === 0 ? (
        <div className="text-center pt-32 px-6">
          <div className="text-5xl mb-3">🎁</div>
          <p className="text-sm text-gray-400">진행 중인 가챠가 없어요.</p>
          <p className="text-xs text-gray-600 mt-1">새 박스가 열리면 알려드릴게요.</p>
        </div>
      ) : (
        boxes.map((box) => <GachaBoxCard key={box.id} box={box} onExit={() => navigate('/')} />)
      )}
    </div>
  )
}

const RARITY_ORDER = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'COMMON']

function pickTopRarity(previewItems) {
  if (!previewItems?.length) return []
  for (const r of RARITY_ORDER) {
    const ofRarity = previewItems.filter((p) => p.rarity === r)
    if (ofRarity.length > 0) return ofRarity.slice(0, 4)
  }
  return []
}

function PreviewTile({ item }) {
  return (
    <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black/40">

      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/70 px-1 text-center">
          {item.label || '?'}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-gradient-to-t from-black/85 to-transparent">
        <div className="text-[8px] text-white/90 font-semibold truncate">
          {item.characterName || item.label}
        </div>
      </div>
      <span className="absolute top-1 left-1 px-1 py-0.5 bg-black/65 text-[8px] font-bold text-white rounded">
        {item.rarity}
      </span>
      {item.badge && (
        <span className="absolute top-1 right-1 px-1 py-0.5 bg-black/65 text-[8px] font-bold text-white rounded">
          {item.badge}
        </span>
      )}
    </div>
  )
}

function GachaBoxCard({ box, onExit }) {
  const pityPct =
    box.pity && box.pity.threshold > 0
      ? Math.min(100, (box.pity.count / box.pity.threshold) * 100)
      : 0
  const pityReady = box.pity?.ready
  const hasCover = !!box.coverImage

  return (
    <Link
      to={`/gacha/${box.id}`}
      className="relative block w-full overflow-hidden group"
      style={{
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        // 풀 블리드 — UserLayout 의 safe-area-top 패딩만 빼고 화면 끝까지.
        // 하단은 박스 내부에서 safe-area-bottom 패딩으로 처리.
        height: 'calc(100dvh - env(safe-area-inset-top))',
        minHeight: '520px',
      }}
    >
      {hasCover ? (
        <img
          src={box.coverImage}
          alt={box.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-active:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-900 via-indigo-900 to-gray-900" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/20" />

      {/* 중앙 2x2 미리보기 그리드 — 어드민이 isPreview 켠 것 중 가장 높은 등급만, 최대 4개. */}
      {(() => {
        const top = pickTopRarity(box.previewItems)
        if (!top.length) return null
        return (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 pointer-events-none">
            <div className="grid grid-cols-2 gap-2.5 max-w-xs mx-auto">
              {top.map((p) => (
                <PreviewTile key={p.id} item={p} />
              ))}
            </div>
          </div>
        )
      })()}

      {/* 우상단 나가기 버튼 (홈으로) — Link 클릭 흡수 차단 */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onExit?.()
        }}
        aria-label="가챠 나가기"
        className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/55 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/75 active:scale-95 transition-all shadow-lg"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {pityReady ? (
        <div className="absolute top-3 right-14 z-10 px-2.5 py-1 rounded-full bg-amber-500 text-amber-950 text-[10px] font-bold shadow-lg">
          🎁 천장 보장 가능
        </div>
      ) : box.free?.remaining > 0 ? (
        <div className="absolute top-3 right-14 z-10 px-2.5 py-1 rounded-full bg-emerald-500 text-emerald-950 text-[10px] font-bold shadow-lg">
          🎟 무료 {box.free.remaining}회
        </div>
      ) : null}

      <div
        className="absolute inset-x-0 bottom-0 p-4 space-y-2"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div>
          <h3 className="text-xl font-bold text-white drop-shadow-lg">{box.name}</h3>
          {box.description && (
            <p className="text-xs text-gray-200 mt-1 line-clamp-2 drop-shadow">
              {box.description}
            </p>
          )}
        </div>

        {box.pity && box.pity.threshold > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-gray-200 mb-1 drop-shadow">
              <span className="font-semibold">
                천장 {box.pity.count}/{box.pity.threshold}
              </span>
              {!pityReady && (
                <span className="opacity-80">{box.pity.threshold - box.pity.count}회 남음</span>
              )}
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all"
                style={{ width: `${pityPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-200 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
            <MaskIcon /> {box.cost} / 회
          </span>
          <span className="text-[11px] text-white/80 group-hover:text-white">뽑기 →</span>
        </div>
      </div>
    </Link>
  )
}
