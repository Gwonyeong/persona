import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/admin/storylines', label: '스토리 목록', end: true },
  { to: '/admin/storylines/analytics/premium', label: '프리미엄 통계' },
]

export default function StoryTabsHeader() {
  return (
    <div className="flex gap-1 border-b border-gray-800 px-6 pt-4">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`
          }
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
