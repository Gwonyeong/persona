import { useTranslation } from 'react-i18next'
import CharacterCard from './CharacterCard'

// "당신을 위한 추천 페소나" — 서버 cron 이 하루 1회 적재하는 CharacterStat 스냅샷의
// popRank 순. characters 는 호출부에서 이미 정렬·슬라이스된 리스트 (Home 이 책임짐).
//
// 스냅샷이 아직 없으면 서버가 popRank 를 안 실어 보내고, 호출부에서 빈 배열이 되어
// 섹션 자체가 렌더되지 않는다 (빈 제목만 남는 상황 방지).
export default function RecommendedRow({ characters, reducedData, safetyMode }) {
  const { t } = useTranslation()
  if (!characters?.length) return null

  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-white mb-2">
        {t('home.recommended')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {characters.map((c) => (
          <CharacterCard key={c.id} character={c} reducedData={reducedData} safetyMode={safetyMode} compact />
        ))}
      </div>
    </div>
  )
}
