import React from 'react'

function StatusBadge({ status, size = 'md', variant = 'default' }) {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  }

  const statusConfig = {
    APPROVED: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200/60 dark:border-emerald-800/30', dotBg: 'bg-emerald-500' },
    PENDING: { bg: 'bg-amber-50 dark:bg-amber-950/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200/60 dark:border-amber-800/30', dotBg: 'bg-amber-500' },
    REJECTED: { bg: 'bg-rose-50 dark:bg-rose-950/20', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200/60 dark:border-rose-800/30', dotBg: 'bg-rose-500' },
    ACTIVE: { bg: 'bg-blue-50 dark:bg-blue-950/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200/60 dark:border-blue-800/30', dotBg: 'bg-blue-500' },
    INACTIVE: { bg: 'bg-slate-100 dark:bg-slate-800/50', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200/60 dark:border-slate-700/40', dotBg: 'bg-slate-400' }
  }

  const config = statusConfig[status] || statusConfig.PENDING
  const sizeClass = sizeClasses[size] || sizeClasses.md

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClass} transition-all duration-200`}
      role="status"
      aria-label={`Status: ${status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotBg}`} aria-hidden="true" />
      <span>{status}</span>
    </span>
  )
}

export default StatusBadge
