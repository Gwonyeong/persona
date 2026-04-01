export default function Lightbox({ url, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center max-w-[480px] mx-auto"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <img
        src={url}
        alt=""
        className="max-w-full max-h-[85vh] object-contain rounded-lg"
        onClick={onClose}
      />
    </div>
  )
}
