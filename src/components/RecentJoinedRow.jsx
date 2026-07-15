import { useTranslation } from 'react-i18next'
import CharacterCard from './CharacterCard'

// characters는 호출부에서 이미 정렬·슬라이스된 리스트 (Home이 책임짐).
export default function RecentJoinedRow({ characters, reducedData, safetyMode }) {
  const { t } = useTranslation()
  if (!characters?.length) return null

  return (
    <div className="mb-4">
      <h2 className="text-sm font-medium text-gray-400 mb-2">
        {t('home.recentJoined')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {characters.map((c) => (
          <CharacterCard key={c.id} character={c} reducedData={reducedData} safetyMode={safetyMode} />
        ))}
      </div>
    </div>
  )
}
