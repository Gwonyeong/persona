import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const BUCKETS = ['19-22', '23-25', '26-29', '30-34', '35-39', '40-49', '50+']

function BucketBar({ label, value, total, color = 'bg-emerald-500' }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-xs text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-800 rounded h-5 relative overflow-hidden">
        <div
          className={`${color} h-full transition-all`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs text-white font-medium">
          {value} ({pct.toFixed(1)}%)
        </span>
      </div>
    </div>
  )
}

function DistributionCard({ title, distribution, total, color, subtitle }) {
  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-sm text-gray-400">총 {total.toLocaleString()}명</span>
      </div>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      <div className="space-y-2">
        {BUCKETS.map((b) => (
          <BucketBar
            key={b}
            label={b}
            value={distribution[b] || 0}
            total={total}
            color={color}
          />
        ))}
      </div>
    </div>
  )
}

function BucketCharacterCard({ bucket, stats }) {
  const { userCount, payingUserCount, conversationCount, messageCount, topCharacters } = stats
  const payingPct = userCount > 0 ? (payingUserCount / userCount) * 100 : 0
  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-semibold">{bucket}세</h3>
        <span className="text-xs text-gray-500">
          유저 {userCount} · 결제 {payingUserCount} ({payingPct.toFixed(1)}%) · conv {conversationCount.toLocaleString()} · msg {messageCount.toLocaleString()}
        </span>
      </div>
      {topCharacters.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">데이터 없음</p>
      ) : (
        <div className="space-y-1.5">
          {topCharacters.map((c, i) => {
            const max = topCharacters[0]?.conversationPct || 1
            const widthPct = (c.conversationPct / max) * 100
            return (
              <div key={c.characterId} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-xs text-gray-500 shrink-0">{i + 1}</span>
                <span className="w-20 text-gray-200 shrink-0 truncate" title={c.name}>
                  {c.name}
                </span>
                <div className="flex-1 bg-gray-800 rounded h-4 relative overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs text-white font-medium">
                    {c.conversationPct.toFixed(1)}%
                  </span>
                </div>
                <span className="w-12 text-xs text-gray-500 text-right shrink-0">
                  {c.conversationCount}건
                </span>
                <span className="w-12 text-xs text-gray-500 text-right shrink-0">
                  {c.uniqueUserCount}명
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function UserAgeStats({ embedded = false }) {
  const [data, setData] = useState(null)
  const [topN, setTopN] = useState(10)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    setError(null)
    api
      .get(`/admin/user-age-stats?topN=${topN}`)
      .then(setData)
      .catch((e) => setError(e?.message || '로딩 실패'))
  }, [topN])

  const wrapperClass = embedded ? 'space-y-8' : 'p-6 space-y-8'
  const errorWrapperClass = embedded ? 'text-red-400' : 'p-6 text-red-400'
  const loadingWrapperClass = embedded ? 'text-gray-400' : 'p-6 text-gray-400'

  if (error) {
    return <div className={errorWrapperClass}>에러: {error}</div>
  }
  if (!data) return <div className={loadingWrapperClass}>로딩 중...</div>

  const {
    asOf,
    totalUsers,
    verifiedUserCount,
    payingUserCount,
    verifiedDistribution,
    payingDistribution,
    bucketStats,
  } = data

  const verifiedRate = totalUsers > 0 ? (verifiedUserCount / totalUsers) * 100 : 0
  const payingOfVerifiedRate = verifiedUserCount > 0 ? (payingUserCount / verifiedUserCount) * 100 : 0

  return (
    <div className={wrapperClass}>
      <div className="flex items-baseline justify-between">
        <div>
          {!embedded && <h2 className="text-xl font-bold">유저 연령 통계</h2>}
          <p className="text-xs text-gray-500 mt-1">
            기준일 {asOf} · 만 나이 · 본인인증(adultBirthDate) 보유자 대상
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Top</span>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {[5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-semibold mb-3">개요</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">전체 가입자</p>
            <p className="text-2xl font-bold mt-1">{totalUsers.toLocaleString()}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">본인인증 완료</p>
            <p className="text-2xl font-bold mt-1">{verifiedUserCount.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{verifiedRate.toFixed(1)}% (전체 대비)</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">결제 유저 (인증자 중)</p>
            <p className="text-2xl font-bold mt-1">{payingUserCount.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{payingOfVerifiedRate.toFixed(1)}% (인증자 대비)</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">연령대 분포</h3>
        <div className="grid grid-cols-2 gap-4">
          <DistributionCard
            title="본인인증 유저"
            distribution={verifiedDistribution}
            total={verifiedUserCount}
            color="bg-emerald-500"
            subtitle="adultBirthDate 보유 유저"
          />
          <DistributionCard
            title="결제 유저 (마스크 OR 구독)"
            distribution={payingDistribution}
            total={payingUserCount}
            color="bg-amber-500"
            subtitle="GooglePlayPurchase ≥1 또는 Subscription 행 보유"
          />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">연령대별 인기 캐릭터</h3>
        <p className="text-xs text-gray-500 mb-3">
          Conversation 비율 기준 · 같은 캐릭터와 여러 방을 만들면 각각 1로 카운트 · 메시지 0건 빈 방 제외 · 우측은 conv 건수 / 고유 유저 수
        </p>
        <div className="grid grid-cols-2 gap-4">
          {BUCKETS.map((b) => (
            <BucketCharacterCard key={b} bucket={b} stats={bucketStats[b]} />
          ))}
        </div>
      </section>
    </div>
  )
}
