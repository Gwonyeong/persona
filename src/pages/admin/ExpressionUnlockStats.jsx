import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const EMOTION_LABEL = {
  NEUTRAL: '평온',
  HAPPY: '기쁨',
  ANGRY: '화남',
  SAD: '슬픔',
  SHY: '부끄러움',
  WORRIED: '걱정',
  AROUSED_TEASE: '도발',
  AROUSED_TOPLESS: '토플리스',
  AROUSED_NUDE: '누드',
  AROUSED_FOREPLAY: '전희',
  AROUSED_INSERT: '삽입',
  AROUSED_INSERT_ALT: '삽입-Alt',
  AROUSED_CLIMAX: '절정',
  AROUSED_AFTERGLOW: '사후',
}

function emotionLabel(e) {
  return EMOTION_LABEL[e] || e
}

function isNsfw(emotion) {
  return typeof emotion === 'string' && emotion.startsWith('AROUSED_')
}

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{Number(value).toLocaleString()}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function ExpressionCard({ entry, rank }) {
  const { previewVideo, previewImage, emotion, characterName, styleName, unlockCount, uniqueUserCount } = entry
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex">
      <div className="w-32 h-32 bg-black shrink-0 relative">
        {previewVideo ? (
          <video
            src={previewVideo}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
            poster={previewImage || undefined}
          />
        ) : previewImage ? (
          <img src={previewImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">
            no preview
          </div>
        )}
        <span className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
          #{rank}
        </span>
      </div>
      <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white truncate">{characterName}</span>
            {isNsfw(emotion) && (
              <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded shrink-0">
                NSFW
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate" title={styleName}>
            스타일: {styleName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">표정: {emotionLabel(emotion)}</p>
        </div>
        <div className="flex items-baseline gap-3 mt-2">
          <span className="text-lg font-bold text-indigo-300">{unlockCount.toLocaleString()}</span>
          <span className="text-xs text-gray-500">건 / {uniqueUserCount}명</span>
        </div>
      </div>
    </div>
  )
}

function CharacterRankRow({ entry, rank, maxValue, valueKey, valueFormat, accentColor }) {
  const value = entry[valueKey] ?? 0
  const widthPct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-800/50 last:border-b-0">
      <span className="w-6 text-xs text-gray-500 shrink-0">{rank}</span>
      <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden shrink-0">
        {entry.profileImage ? (
          <img src={entry.profileImage} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 truncate">{entry.name}</p>
        <p className="text-xs text-gray-500">
          영상 자산 {entry.videoAssetCount} · 해금 {entry.unlockCount.toLocaleString()} · 자산당 {entry.conversionPerAsset.toFixed(2)}
        </p>
      </div>
      <div className="w-28 shrink-0">
        <div className="bg-gray-800 rounded h-4 relative overflow-hidden">
          <div
            className={`${accentColor} h-full`}
            style={{ width: `${widthPct}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-end pr-1.5 text-[10px] text-white font-medium">
            {valueFormat ? valueFormat(value) : value}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ExpressionUnlockStats({ embedded = false }) {
  const [data, setData] = useState(null)
  const [topN, setTopN] = useState(10)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    setError(null)
    api
      .get(`/admin/expression-unlock-stats?topN=${topN}`)
      .then(setData)
      .catch((e) => setError(e?.message || '로딩 실패'))
  }, [topN])

  const wrapperClass = embedded ? 'space-y-8' : 'p-6 space-y-8'

  if (error) {
    return <div className={embedded ? 'text-red-400' : 'p-6 text-red-400'}>에러: {error}</div>
  }
  if (!data) return <div className={embedded ? 'text-gray-400' : 'p-6 text-gray-400'}>로딩 중...</div>

  const {
    asOf,
    totalUnlocks,
    uniqueBuyerCount,
    totalExpressionAssets,
    bottomFilterMinAsset,
    topExpressions,
    topCharacters,
    bottomCharacters,
  } = data

  const topCharMax = topCharacters[0]?.unlockCount || 1
  const bottomCharMax = Math.max(...bottomCharacters.map((c) => c.conversionPerAsset), 1)

  return (
    <div className={wrapperClass}>
      <div className="flex items-baseline justify-between">
        <div>
          {!embedded && <h2 className="text-xl font-bold">표정 해금 통계</h2>}
          <p className="text-xs text-gray-500 mt-1">
            기준일 {asOf} · EmotionVideoUnlock(10마스크 결제) 기반
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
            {[5, 10, 15, 20, 30].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-semibold mb-3">개요</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="총 해금 건수"
            value={totalUnlocks}
            hint="EmotionVideoUnlock 행 수"
          />
          <StatCard
            label="해금한 유저 수"
            value={uniqueBuyerCount}
            hint="고유 userId"
          />
          <StatCard
            label="등록된 영상 자산"
            value={totalExpressionAssets}
            hint="CharacterImage.videoFilePath 존재"
          />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">표정 영상 해금 순위 (Top {topN})</h3>
        <p className="text-xs text-gray-500 mb-3">
          (스타일 × 표정) 단위 · 미리보기는 해당 표정의 첫번째 등록 자산
        </p>
        {topExpressions.length === 0 ? (
          <p className="text-gray-500 text-sm">데이터 없음</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {topExpressions.map((e, i) => (
              <ExpressionCard
                key={e.characterImageId}
                entry={e}
                rank={i + 1}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">캐릭터별 해금 — Top {topN}</h3>
          <p className="text-xs text-gray-500 mb-3">
            해금 건수 기준 · 영상 자산이 등록된 캐릭터 대상
          </p>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            {topCharacters.length === 0 ? (
              <p className="text-gray-500 text-sm p-3">데이터 없음</p>
            ) : (
              topCharacters.map((c, i) => (
                <CharacterRankRow
                  key={c.characterId}
                  entry={c}
                  rank={i + 1}
                  maxValue={topCharMax}
                  valueKey="unlockCount"
                  valueFormat={(v) => v.toLocaleString()}
                  accentColor="bg-indigo-500"
                />
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">캐릭터별 해금 — Bottom {topN}</h3>
          <p className="text-xs text-gray-500 mb-3">
            영상 자산이 {bottomFilterMinAsset}개 이상인 캐릭터 중 자산당 해금 비율이 낮은 순
          </p>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            {bottomCharacters.length === 0 ? (
              <p className="text-gray-500 text-sm p-3">데이터 없음</p>
            ) : (
              bottomCharacters.map((c, i) => (
                <CharacterRankRow
                  key={c.characterId}
                  entry={c}
                  rank={i + 1}
                  maxValue={bottomCharMax}
                  valueKey="conversionPerAsset"
                  valueFormat={(v) => v.toFixed(2)}
                  accentColor="bg-rose-500"
                />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
