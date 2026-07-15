import { Inbox } from 'lucide-react'

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state__icon">
        <Icon size={28} />
      </div>
      <h3 className="empty-state__title">{title}</h3>
      {description && (
        <p className="empty-state__description">{description}</p>
      )}
      {actionLabel && onAction && (
        <button className="btn-enterprise btn-enterprise--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
