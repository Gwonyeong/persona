import { useNavigate } from 'react-router-dom'

export default function FeedbackButton() {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/feedback')}
      className="absolute right-4 z-40 w-12 h-12 rounded-full bg-indigo-600 shadow-lg shadow-indigo-600/30 flex items-center justify-center hover:bg-indigo-500 active:scale-95 transition-all"
      style={{
        bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + 1rem)',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </button>
  )
}
