import CharacterCard from './CharacterCard'

// characters는 호출부에서 이미 정렬·슬라이스된 리스트 (Home이 책임짐).
export default function RecentJoinedRow({ characters, reducedData }) {
  if (!characters?.length) return null

  return (
    <div className="mb-4">
      <h2 className="text-sm font-medium text-gray-400 mb-2">
        최근에 합류한 페소나들
      </h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {characters.map((c) => (
          <div
            key={c.id}
            className="flex-shrink-0"
            style={{ width: 'calc((100% - 12px) / 2)' }}
          >
            <CharacterCard character={c} reducedData={reducedData} />
          </div>
        ))}
      </div>
    </div>
  )
}
