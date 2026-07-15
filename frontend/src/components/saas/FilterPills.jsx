import { colors } from '../../theme/tokens'

const labelMap = {
  ALL: 'All',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
}

export default function FilterPills({ options = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'], active = 'ALL', onChange }) {
  return (
    <div
      className="flex gap-1.5 p-1 bg-white border border-slate-200 rounded-full shadow-sm flex-shrink-0"
      role="tablist"
      aria-label="Filter by status"
    >
      {options.map((s) => {
        const isActive = active === s
        return (
          <button
            key={s}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(s)}
            className={`rounded-full text-xs font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${
              isActive ? 'shadow-sm' : 'hover:bg-slate-100 hover:text-slate-800'
            }`}
            style={{
              padding: '7px 18px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: isActive ? colors.brand.blueDark : 'transparent',
              color: isActive ? '#fff' : colors.text.muted,
              outline: 'none'
            }}
          >
            {labelMap[s] || (s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase())}
          </button>
        )
      })}
    </div>
  )
}
