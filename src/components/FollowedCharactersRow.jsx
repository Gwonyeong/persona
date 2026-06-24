import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function FollowedCharactersRow({ characters }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (!characters) return null

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-200">{t('home.followedCharacters')}</h2>
      </div>

      {characters.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center">
          {t('home.noFollowedCharacters')}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {characters.map((c) => {
            const thumb = c.profileImage || c.styles?.[0]?.images?.[0]?.filePath || null
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/characters/${c.id}`)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 w-20"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                  <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-800">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={c.name}
                          draggable={false}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-lg text-gray-500">
                          ?
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-gray-200 w-full text-center truncate leading-tight">
                  {c.name}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
