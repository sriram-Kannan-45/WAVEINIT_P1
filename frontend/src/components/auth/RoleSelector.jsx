export default function RoleSelector({ roles, value, onChange }) {
  return (
    <div className="wl-auth-roles" role="tablist">
      {roles.map(r => {
        const Icon = r.icon
        const on = value === r.key
        return (
          <button
            key={r.key}
            role="tab"
            aria-selected={on}
            className={`wl-auth-role${on ? ' wl-auth-role--on' : ''}`}
            onClick={() => onChange(r.key)}
          >
            <Icon size={15} />
            {r.label}
          </button>
        )
      })}
      <div
        className="wl-auth-role-slider"
        style={{
          left: value === 'PARTICIPANT' ? '0%' : value === 'TRAINER' ? '33.333%' : '66.666%'
        }}
      />
    </div>
  )
}
