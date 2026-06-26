import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import UserAgeStats from './UserAgeStats'
import ExpressionUnlockStats from './ExpressionUnlockStats'

const MASK_TYPE_LABELS = {
  SIGNUP_BONUS: '가입 보너스',
  PURCHASE: '구매',
  USE: '사용',
  REFUND: '환불',
  MISSION_REWARD: '미션 보상',
  AD_REWARD: '광고 보상',
  SUBSCRIPTION_DAILY: '구독 데일리',
}

const TABS = [
  { key: 'overview', label: '개요' },
  { key: 'age', label: '유저 연령 통계' },
  { key: 'expressions', label: '표정 해금 통계' },
]

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{Number(value).toLocaleString()}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function OverviewTab() {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/admin/stats').then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="text-gray-400">로딩 중...</div>

  const { stats, popularCharacters, maskBreakdown = {} } = data
  const retentionRate =
    stats.userCount > 0
      ? ((stats.retentionCount / stats.userCount) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-lg font-semibold mb-3">기본 지표</h3>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="총 유저" value={stats.userCount} />
          <StatCard label="총 캐릭터" value={stats.characterCount} />
          <StatCard label="총 대화" value={stats.conversationCount} />
          <StatCard label="총 메시지" value={stats.messageCount} />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">리텐션</h3>
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="2일 이상 리텐션 유저"
            value={stats.retentionCount}
            hint={`전체의 ${retentionRate}% (lastActiveAt - createdAt ≥ 2일)`}
          />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">피드</h3>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="총 피드 게시물" value={stats.feedPostCount} />
          <StatCard label="총 좋아요" value={stats.feedLikeCount} />
          <StatCard label="총 댓글" value={stats.feedCommentCount} />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">마스크</h3>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <StatCard label="총 발행" value={stats.masksGranted} hint="가입/구매/보상 합계" />
          <StatCard label="총 사용" value={stats.masksSpent} hint="USE 트랜잭션 합계" />
          <StatCard label="순 잔여" value={stats.masksOutstanding} hint="발행 − 사용" />
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">타입</th>
                <th className="p-3">건수</th>
                <th className="p-3">합계</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(MASK_TYPE_LABELS).map((type) => {
                const entry = maskBreakdown[type] || { amount: 0, count: 0 }
                return (
                  <tr key={type} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3">{MASK_TYPE_LABELS[type]}</td>
                    <td className="p-3">{entry.count.toLocaleString()}</td>
                    <td className={`p-3 ${entry.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {entry.amount > 0 ? '+' : ''}
                      {entry.amount.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">인기 캐릭터</h3>
        <div className="bg-gray-900 rounded-lg border border-gray-800">
          {popularCharacters.length === 0 ? (
            <p className="p-4 text-gray-500">등록된 캐릭터가 없습니다.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="p-3">이름</th>
                  <th className="p-3">대화 수</th>
                  <th className="p-3">공개</th>
                </tr>
              </thead>
              <tbody>
                {popularCharacters.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3">{c.name}</td>
                    <td className="p-3">{c._count.conversations}</td>
                    <td className="p-3">{c.isPublic ? '공개' : '비공개'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((t) => t.key === tabParam) ? tabParam : 'overview'

  const switchTab = (key) => {
    if (key === 'overview') {
      searchParams.delete('tab')
    } else {
      searchParams.set('tab', key)
    }
    setSearchParams(searchParams, { replace: true })
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">대시보드</h2>

      <div className="flex border-b border-gray-800 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
            style={{
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'age' && <UserAgeStats embedded />}
      {activeTab === 'expressions' && <ExpressionUnlockStats embedded />}
    </div>
  )
}
