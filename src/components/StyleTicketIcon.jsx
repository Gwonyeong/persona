// 의상 구매권 아이콘 — 구매 패스 보상(STYLE_TICKET). MaskIcon 과 같은 1em 인라인 규격.
export default function StyleTicketIcon({ className = '', style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ width: '1em', height: '1em', display: 'inline-block', verticalAlign: '-0.15em', ...style }}
    >
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" />
      <path d="M14 5v2M14 11v2M14 17v2" />
    </svg>
  )
}
