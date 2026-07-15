export default function ActivityFeedItem({
  icon: Icon,
  title,
  description,
  timestamp,
  iconVariant = 'primary', // primary | emerald | amber | blue | neutral
  className = '',
}) {
  const iconColors = {
    primary: 'bg-primary-50 text-primary-600 border-primary-100 dark:bg-primary-950/20 dark:text-primary-400 dark:border-primary-900/30',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
    blue: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/50',
  }

  const iconCls = iconColors[iconVariant] || iconColors.primary

  return (
    <div className={`flex items-start gap-4 py-3.5 first:pt-0 last:pb-0 ${className}`}>
      {Icon && (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0 ${iconCls}`}>
          <Icon size={16} />
        </div>
      )}
      <div className="flex-grow space-y-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">
            {title}
          </h4>
          {timestamp && (
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap uppercase tracking-wider">
              {timestamp}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
