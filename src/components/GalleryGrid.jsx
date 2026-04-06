export default function GalleryGrid({ images, affinity, onImageClick, onLockedClick }) {
  if (!images || images.length === 0) {
    return (
      <div className="text-center text-gray-500 py-16">
        <p className="text-sm">등록된 갤러리가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-[1px]">
      {images.map((img) => (
        <button
          key={img.id}
          onClick={() => img.unlocked ? onImageClick?.(img) : onLockedClick?.(img)}
          className="aspect-square overflow-hidden relative"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <img
            src={img.filePath}
            alt={img.title || ''}
            className="w-full h-full object-cover"
            style={img.unlocked ? {} : { filter: 'blur(12px) brightness(0.5)' }}
            loading="lazy"
          />
          {!img.unlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {img.unlockType === 'AFFINITY' && (
                <span className="text-[10px] text-gray-300 mt-1 flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-pink-400"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  {img.affinityThreshold}
                </span>
              )}
              {img.unlockType === 'MISSION' && img.missionName && (
                <span className="text-[10px] text-gray-300 mt-1 flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-amber-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  {img.missionName}
                </span>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
