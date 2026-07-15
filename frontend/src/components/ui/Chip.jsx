export default function Chip({ children, className = '', ...props }) {
  return (
    <span
      className={`inline-flex items-center rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 text-xs font-medium tracking-wide border border-slate-200/50 dark:border-slate-700/50 transition-colors ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
