import { colors } from '../../theme/tokens'

export default function StatItem({ icon: Icon, label, value, color = colors.text.secondary }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={14} style={{ color }} />
      <span className="text-xs font-semibold" style={{ color: colors.text.secondary }}>
        {value} {label}
      </span>
    </div>
  )
}
