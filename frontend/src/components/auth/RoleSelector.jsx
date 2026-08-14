import React from 'react';

export default function RoleSelector({ roles, activeRole, onRoleChange }) {
  return (
    <div className="auth-role-selector" role="tablist">
      {roles.map((r) => {
        const isActive = activeRole === r.id;
        const Icon = r.icon;

        let iconNode = null;
        if (React.isValidElement(Icon)) {
          iconNode = Icon;
        } else if (typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null && Icon.$$typeof)) {
          const Comp = Icon;
          iconNode = <Comp size={15} strokeWidth={isActive ? 2.2 : 1.8} />;
        } else if (Icon) {
          iconNode = <span>{Icon}</span>;
        }

        return (
          <button
            key={r.id}
            role="tab"
            aria-selected={isActive}
            className={`auth-role-btn${isActive ? ' auth-role-btn--active' : ''}`}
            onClick={() => onRoleChange(r.id)}
            type="button"
          >
            {iconNode}
            <span>{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}
