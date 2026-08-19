import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

// 캐릭터 인기/몰입 지표 — 서버 cron(CharacterStats 잡)이 하루 1회 적재한 CharacterStat 스냅샷을 그대로 본다.
// 여기서 재집계하지 않는다: 인기 산정은 messages(jsonb[]) unnest 라 화면 요청에 실을 비용이 아니다.
//
// 핵심 주의: '인기'는 유저가 실제로 보낸 메시지 수다. 대화방의 updatedAt 을 세면 선제 메시지가
// 방을 건드릴 때마다 올라가서, 답장 없는 죽은 방이 많은 캐릭터가 더 인기 있어 보인다.

const SORTS = [
  { key: 'popScore', label: '인기 점수' },
  { key: 'userMessages', label: '유저 메시지' },
  { key: 'newRooms', label: '신규 방' },
  { key: 'medianTurns', label: '방당 턴(중앙값)' },
  { key: 'deep10Rate', label: '10턴+ 비율' },
  { key: 'zeroTurnRate', label: '0턴 이탈률' },
  { key: 'd1Revisit', label: 'D1 재방문' },
]

const pct = (v) => `${((v || 0) * 100).toFixed(0)}%`
const num = (v) => Number(v || 0).toLocaleString()

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 md:p-4 border border-gray-800">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-lg md:text-2xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

export default function CharacterPopularity({ embedded }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('popScore')

  useEffect(() => {
    api
      .get('/admin/character-stats?windowDays=7')
      .then(setData)
      .catch((e) => setError(e.message || '불러오지 못했습니다.'))
  }, [])

  const rows = useMemo(() => {
    if (!data?.rows) return []
    return [...data.rows].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
  }, [data, sortKey])

  const totals = useMemo(() => {
    const src = data?.rows || []
    const userMessages = src.reduce((s, r) => s + r.userMessages, 0)
    const newRooms = src.reduce((s, r) => s + r.newRooms, 0)
    const ranked = src.filter((r) => r.popScore > 0)
    // 상위 10명이 유저 메시지의 몇 %를 먹는지 — 인기 섹션을 켠 뒤 쏠림이 심해지는지 감시하는 값.
    const top10 = [...src].sort((a, b) => b.userMessages - a.userMessages).slice(0, 10)
    const top10Share = userMessages ? (top10.reduce((s, r) => s + r.userMessages, 0) / userMessages) * 100 : 0
    return { userMessages, newRooms, ranked: ranked.length, chars: src.length, top10Share }
  }, [data])

  if (error) return <div className="text-rose-400">{error}</div>
  if (!data) return <div className="text-gray-400">로딩 중...</div>

  const body = (
    <div className="space-y-6">
      {!data.bucketAt ? (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 text-sm text-gray-400 leading-relaxed">
          <p className="text-gray-200 font-semibold mb-2">아직 스냅샷이 없습니다.</p>
          <p>서버 cron(CharacterStats 잡)은 매시간 돌면서 그날(KST) 스냅샷이 없을 때만 집계합니다.</p>
          <p className="mt-1">
            지금 바로 채우려면 서버에서{' '}
            <code className="text-indigo-300">node scripts/collect-character-stats.js --commit</code> 를 실행하세요.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="유저 메시지 (7일)" value={num(totals.userMessages)} />
            <StatCard label="신규 대화방 (7일)" value={num(totals.newRooms)} />
            <StatCard
              label="랭킹 진입 캐릭터"
              value={`${totals.ranked} / ${totals.chars}`}
              hint="활동방 20개 하한 · 출시 14일 이내 제외"
            />
            <StatCard
              label="TOP10 점유율"
              value={`${totals.top10Share.toFixed(1)}%`}
              hint="쏠림 감시 — 인기 섹션 노출 전후 비교"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">
              집계 {new Date(data.bucketAt).toLocaleDateString('ko-KR')} · 창 {data.windowDays}일 · 정렬
            </span>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortKey(s.key)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  sortKey === s.key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
                  <th className="p-3">#</th>
                  <th className="p-3">캐릭터</th>
                  <th className="p-3 text-right">인기 점수</th>
                  <th className="p-3 text-right">유저 msg</th>
                  <th className="p-3 text-right">활동 방</th>
                  <th className="p-3 text-right">활동 유저</th>
                  <th className="p-3 text-right">신규 방</th>
                  <th className="p-3 text-right">방당 턴</th>
                  <th className="p-3 text-right">0턴 이탈</th>
                  <th className="p-3 text-right">10턴+</th>
                  <th className="p-3 text-right">NSFW</th>
                  <th className="p-3 text-right">D1 재방문</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.characterId} className="border-b border-gray-800/50 text-sm">
                    <td className="p-3 text-gray-500">{r.popScore > 0 ? i + 1 : '—'}</td>
                    <td className="p-3">
                      {r.character?.name}
                      {!r.character?.isPublic && <span className="ml-1 text-xs text-gray-600">비공개</span>}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {r.popScore > 0 ? r.popScore.toFixed(2) : <span className="text-gray-600">제외</span>}
                    </td>
                    <td className="p-3 text-right">{num(r.userMessages)}</td>
                    <td className="p-3 text-right">{num(r.activeRooms)}</td>
                    <td className="p-3 text-right">{num(r.activeUsers)}</td>
                    <td className="p-3 text-right">{num(r.newRooms)}</td>
                    <td className="p-3 text-right">{r.medianTurns}</td>
                    <td className={`p-3 text-right ${r.zeroTurnRate >= 0.4 ? 'text-rose-400' : ''}`}>
                      {pct(r.zeroTurnRate)}
                    </td>
                    <td className="p-3 text-right">{pct(r.deep10Rate)}</td>
                    <td className="p-3 text-right text-gray-400">{pct(r.nsfwRate)}</td>
                    <td className="p-3 text-right">{pct(r.d1Revisit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            인기 점수 = log10(유저 메시지+1) × (0.5 + 10턴+ 비율). 볼륨만 쓰면 노출 많은 캐릭터가 고착되고, 깊이만 쓰면
            표본 작은 캐릭터가 튀어서 둘을 곱한다. 0턴 이탈률이 40% 넘는 캐릭터는 첫 메시지를 먼저 의심할 것.
          </p>
        </>
      )}
    </div>
  )

  if (embedded) return body
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">캐릭터 인기 지표</h2>
      {body}
    </div>
  )
}
