export default function FeatureBadge({ icon: Icon, label }) {
  return (
    <span className="wl-auth-chip">
      <Icon size={14} />
      {label}
    </span>
  )
}
