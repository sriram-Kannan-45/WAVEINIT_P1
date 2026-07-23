export default function RoleSelector({ roles, activeRole, onRoleChange }) {
  return (
    <div className="auth-role-selector" role="tablist">
      {roles.map((r) => {
        const isActive = activeRole === r.id;
        return (
          <button
            key={r.id}
            role="tab"
            aria-selected={isActive}
            className={`auth-role-btn${isActive ? ' auth-role-btn--active' : ''}`}
            onClick={() => onRoleChange(r.id)}
            type="button"
          >
            <span>{r.icon}</span>
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
