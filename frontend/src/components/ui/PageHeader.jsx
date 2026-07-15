import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function PageHeader({
  title,
  subtitle,
  action,
  backLink,
  onBack,
  breadcrumbs = [],
  className = '',
}) {
  return (
    <div className={`page-header ${className}`}>
      <div className="page-header__left">
        {backLink ? (
          <Link
            to={backLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--neutral-400)',
              textDecoration: 'none',
              marginBottom: '8px',
              transition: 'color 150ms ease',
            }}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </Link>
        ) : onBack ? (
          <button
            onClick={onBack}
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--neutral-400)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              marginBottom: '8px',
              transition: 'color 150ms ease',
            }}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
        ) : breadcrumbs.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--neutral-400)', marginBottom: '8px' }}>
            {breadcrumbs.map((bc, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {bc.link ? (
                  <Link to={bc.link} style={{ color: 'var(--neutral-400)', textDecoration: 'none', transition: 'color 150ms ease' }}>
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

        <h1 className="page-header__title">{title}</h1>
        {subtitle && (
          <p className="page-header__subtitle">{subtitle}</p>
        )}
      </div>

      {action && (
        <div className="page-header__actions">
          {action}
        </div>
      )}
    </div>
  )
}
