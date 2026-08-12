import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import MaskIcon from '../../components/MaskIcon'

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// 출시(스타일 생성) 시각 → 경과 일수. 없거나 잘못된 값이면 null.
function daysSince(dateStr) {
  if (!dateStr) return null
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return null
  return Math.floor((Date.now() - then.getTime()) / 86400000)
}

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 md:p-4 border border-gray-800">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-lg md:text-2xl font-bold mt-1">{Number(value).toLocaleString()}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

// 스타일 한 줄 — 프로필/스타일명·캐릭터명 + 획득 수 막대.
// showReleaseDate=true 면 출시 경과일(n일 전, 1개월 미만은 초록색)을 함께 표기.
function StyleRankRow({ entry, rank, maxValue, accentColor, showReleaseDate = false }) {
  const widthPct = maxValue > 0 ? (entry.unlockCount / maxValue) * 100 : 0
  const releaseDays = showReleaseDate ? daysSince(entry.createdAt) : null
  const releaseLabel = releaseDays == null ? null : releaseDays <= 0 ? '오늘 출시' : `${releaseDays}일 전 출시`
  const isFresh = releaseDays != null && releaseDays < 30 // 1개월 미만
  return (
    <div className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-800/50 last:border-b-0">
      <span className="w-6 text-xs text-gray-500 shrink-0 text-center">{rank}</span>
      <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden shrink-0">
        {entry.profileImage ? (
          <img src={entry.profileImage} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-gray-100 truncate font-medium">{entry.styleName}</p>
          {entry.adultOnly && (
            <span className="text-[9px] bg-rose-900/60 text-rose-300 px-1 py-0.5 rounded font-semibold shrink-0">
              19+
            </span>
          )}
          {entry.unlockMode === 'SHOP' && entry.shopActive === false && (
            <span className="text-[9px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded font-semibold shrink-0">
              비공개
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate flex items-center gap-1">
          {entry.characterName}
          {entry.unlockMode === 'SHOP' && entry.maskCost != null && (
            <span className="inline-flex items-center gap-0.5 text-amber-300/80">
              · <MaskIcon /> {entry.maskCost}
            </span>
          )}
          {releaseLabel && (
            <span className={`shrink-0 ${isFresh ? 'text-green-400' : 'text-gray-500'}`}>
              · {releaseLabel}
            </span>
          )}
        </p>
      </div>
      <div className="w-32 shrink-0">
        <div className="bg-gray-800 rounded h-5 relative overflow-hidden">
          <div className={`${accentColor} h-full`} style={{ width: `${widthPct}%` }} />
          <span className="absolute inset-0 flex items-center justify-end pr-1.5 text-[11px] text-white font-semibold">
            {entry.unlockCount.toLocaleString()}명
          </span>
        </div>
      </div>
    </div>
  )
}

function SourceSection({ title, accentColor, source, showReleaseDate = false }) {
  if (!source) return null
  const { styles, styleCount, totalUnlocks, uniqueUserCount } = source
  const maxValue = styles[0]?.unlockCount || 1
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-xs text-gray-500">
          스타일 {styleCount}종 · 총 획득 {totalUnlocks.toLocaleString()}건 · 고유 유저 {uniqueUserCount.toLocaleString()}명
        </p>
      </div>
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
        {styles.length === 0 ? (
          <p className="text-gray-500 text-sm p-3">데이터 없음</p>
        ) : (
          styles.map((s, i) => (
            <StyleRankRow
              key={s.styleId}
              entry={s}
              rank={i + 1}
              maxValue={maxValue}
              accentColor={accentColor}
              showReleaseDate={showReleaseDate}
            />
          ))
        )}
      </div>
    </section>
  )
}

// 스타일(의상) 획득 통계 — 가챠/상점을 구분해 스타일별 획득 수(고유 보유자)를 나열.
// 캐릭터별 집계가 아닌 스타일 총합. Expressions 페이지 상단 탭 및 단독 라우트에서 재사용.
export default function StyleAcquisitionStats({ embedded = false }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .get('/admin/style-acquisition-stats')
      .then(setData)
      .catch((e) => setError(e?.message || '로딩 실패'))
  }, [])

  const wrapperClass = embedded ? 'space-y-8' : 'p-6 space-y-8'

  if (error) {
    return <div className={embedded ? 'text-red-400' : 'p-6 text-red-400'}>에러: {error}</div>
  }
  if (!data) return <div className={embedded ? 'text-gray-400' : 'p-6 text-gray-400'}>로딩 중...</div>

  const { asOf, gacha, shop } = data

  return (
    <div className={wrapperClass}>
      <div>
        {!embedded && <h2 className="text-xl font-bold">스타일 획득 통계</h2>}
        <p className="text-xs text-gray-500 mt-1">
          기준일 {asOf} · 스타일(의상) 단위 총합 · 획득 수 = 고유 보유자(StyleUnlock)
        </p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="가챠 스타일 총 획득"
            value={gacha.totalUnlocks}
            hint={`${gacha.styleCount}종 · 고유 유저 ${gacha.uniqueUserCount.toLocaleString()}명`}
          />
          <StatCard
            label="상점 스타일 총 획득"
            value={shop.totalUnlocks}
            hint={`${shop.styleCount}종 · 고유 유저 ${shop.uniqueUserCount.toLocaleString()}명`}
          />
        </div>
      </section>

      <SourceSection title="🎰 가챠 스타일 획득 순위" accentColor="bg-fuchsia-500" source={gacha} />
      <SourceSection title="🛒 상점 스타일 획득 순위" accentColor="bg-amber-500" source={shop} showReleaseDate />
    </div>
  )
}
