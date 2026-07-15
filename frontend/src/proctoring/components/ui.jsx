/**
 * Shared visual primitives for the proctoring module.
 *
 * Theme: clean academic — white surfaces, slate borders, blue accents.
 * Tailwind-only, no external CSS file.
 */
import { motion } from 'framer-motion';

export function GlassCard({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={
        'relative overflow-hidden rounded-2xl border border-slate-200 ' +
        'bg-white/95 backdrop-blur-xl shadow-[0_10px_40px_-15px_rgba(15,23,42,0.15)] ' +
        className
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50/60 via-white/0 to-white/0" />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

export function StatusDot({ ok, label, warn = false }) {
  const color = warn
    ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
    : ok
      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
      : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]';
  const text = warn ? 'text-amber-700' : ok ? 'text-emerald-700' : 'text-rose-600';
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className={text}>{label}</span>
    </span>
  );
}

export function PrimaryButton({ children, className = '', ...rest }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={
        'inline-flex items-center justify-center gap-2 rounded-xl ' +
        'bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 ' +
        'text-sm font-semibold text-white shadow-md shadow-blue-500/25 ' +
        'transition disabled:opacity-50 disabled:cursor-not-allowed ' +
        'hover:shadow-lg hover:shadow-blue-500/30 ' +
        className
      }
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function GhostButton({ children, className = '', ...rest }) {
  return (
    <button
      className={
        'inline-flex items-center justify-center gap-2 rounded-xl ' +
        'border border-slate-200 bg-white px-4 py-2 text-sm ' +
        'font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition ' +
        'disabled:opacity-50 disabled:cursor-not-allowed ' +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}
