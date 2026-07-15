import Badge from './Badge'
import Card from './Card'
import { ProgressBar } from './ChartWrappers'

export default function DataCard({
  title,
  subtitle,
  thumbnail,
  status,
  statusColor = 'primary',
  tags = [],
  progress,
  metrics = [],
  actions,
  onClick,
  className = '',
}) {
  return (
    <Card
      hover
      onClick={onClick}
      className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Banner / Image */}
      <div className="relative h-40 w-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
            }}
          />
        ) : null}
        
        {/* Fallback gradient if no image or error */}
        <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-tr from-primary-600/90 to-primary-800/95 text-white font-bold text-lg p-4 text-center select-none ${thumbnail ? 'hidden' : 'flex'}`}>
          {title}
        </div>

        {/* Status Badge in corner */}
        {status && (
          <div className="absolute top-3 right-3 z-10">
            <Badge color={statusColor}>{status}</Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-grow justify-between">
        <div className="space-y-2">
          {subtitle && (
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
              {subtitle}
            </span>
          )}
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 line-clamp-1 leading-snug">
            {title}
          </h3>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 text-xs font-semibold"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
          {/* Progress Bar */}
          {progress !== undefined && (
            <ProgressBar value={progress} max={100} showLabel label="Completion Progress" color="primary" />
          )}

          {/* Metrics */}
          {metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {metrics.map((item, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
                    {item.label}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {actions && <div className="pt-2 flex items-center justify-end gap-2">{actions}</div>}
        </div>
      </div>
    </Card>
  )
}
