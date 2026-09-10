export default function ProgressBar({
  value = 0,
  max = 100,
  color = 'primary', // primary | emerald | amber | blue
  showLabel = false,
  label = '',
}) {
  const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)))

  const barColors = {
    primary: 'bg-gradient-to-r from-primary-500 to-primary-600',
    emerald: 'bg-gradient-to-r from-emerald-500 to-teal-500',
    amber: 'bg-gradient-to-r from-amber-500 to-orange-500',
    blue: 'bg-gradient-to-r from-blue-500 to-primary-500',
  }

  return (
    <div className="w-full">
      {(showLabel || label) && (
        <div className="flex items-center justify-between text-xs mb-1.5 font-semibold">
          <span className="text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-slate-700 dark:text-slate-300">{percent}%</span>
        </div>
      )}
      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColors[color] || barColors.primary}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export { ProgressBar }
