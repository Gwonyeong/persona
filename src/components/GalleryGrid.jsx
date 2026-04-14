export default function GalleryGrid({ contents, affinity, onContentClick, onLockedClick }) {
  if (!contents || contents.length === 0) {
    return (
      <div className="text-center text-gray-500 py-16">
        <p className="text-sm">등록된 갤러리가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-[1px]">
      {contents.map((item) => {
        const thumbImage = item.images?.[0]
        if (!thumbImage) return null

        return (
          <button
            key={item.id}
            onClick={() => item.unlocked ? onContentClick?.(item) : onLockedClick?.(item)}
            className="aspect-[9/16] overflow-hidden relative"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <img
              src={thumbImage.filePath}
              alt={item.title || ''}
              className="w-full h-full object-cover"
              style={item.unlocked ? {} : { filter: 'blur(1.5px) brightness(0.8)' }}
              loading="lazy"
            />

            {/* 다중 이미지 표시 */}
            {item.unlocked && item.images.length > 1 && (
              <div className="absolute top-1.5 right-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="drop-shadow">
                  <rect x="3" y="3" width="15" height="15" rx="2" />
                  <rect x="6" y="6" width="15" height="15" rx="2" />
                </svg>
              </div>
            )}

            {!item.unlocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {item.unlockType === 'AFFINITY' && (
                  <span className="text-[10px] text-gray-300 mt-1 flex items-center gap-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-pink-400"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                    {item.affinityThreshold}
                  </span>
                )}
                {item.unlockType === 'MISSION' && item.missionName && (
                  <span className="text-[10px] text-gray-300 mt-1 flex items-center gap-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-amber-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    {item.missionName}
                  </span>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
