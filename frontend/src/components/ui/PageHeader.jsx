import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

const DEFAULT_ICON_BG = '#FFFFFF'

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconBg = DEFAULT_ICON_BG,
  iconColor = '#16A34A',
  iconSize = 26,
  action,
  actions,
  backLink,
  onBack,
  breadcrumbs = [],
  className = '',
  style,
}) {
  const actionNode = actions ?? (action ? [action] : [])

  return (
    <div className={`reg-admin-header ${className}`} style={style}>
      {Icon && (
        <div className="reg-admin-header-icon" style={{ background: iconBg, border: '1.5px solid #16A34A', color: iconColor }}>
          <Icon size={iconSize} color={iconColor} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {backLink || onBack ? (
          <div style={{ marginBottom: 6 }}>
            {backLink ? (
              <Link
                to={backLink}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#64748b',
                  textDecoration: 'none',
                  transition: 'color 150ms ease',
                }}
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </Link>
            ) : (
              <button
                onClick={onBack}
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#64748b',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  transition: 'color 150ms ease',
                }}
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
            )}
          </div>
        ) : breadcrumbs.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
            {breadcrumbs.map((bc, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {bc.link ? (
                  <Link to={bc.link} style={{ color: '#64748b', textDecoration: 'none', transition: 'color 150ms ease' }}>
                    {bc.label}
                  </Link>
                ) : (
                  <span>{bc.label}</span>
                )}
                {idx < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </div>
        ) : null}

        <h1 className="reg-admin-title">{title}</h1>
        {subtitle && <p className="reg-admin-subtitle">{subtitle}</p>}
      </div>

      {actionNode.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {actionNode}
        </div>
      )}
    </div>
  )
}
