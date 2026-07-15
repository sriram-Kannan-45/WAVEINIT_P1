import { Send, Sparkles, Maximize2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TopBar({
  title,
  onSubmit,
  submitting,
  warningsCount = 0,
  fullscreenExits = 0,
  onFullscreen,
  autosaveStatus = 'saved', // 'saved' | 'saving' | 'idle'
}) {
  const warnings = warningsCount + fullscreenExits;

  return (
    <header className="eq-glass sticky top-0 z-40 shrink-0 border-b" style={{ borderColor: 'var(--eq-border)' }}>
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">

        {/* Left — logo + brand + quiz badge */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Logo */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white font-extrabold text-lg"
            style={{
              background: 'linear-gradient(135deg, var(--eq-accent) 0%, var(--eq-accent-3) 100%)',
              boxShadow: 'var(--eq-shadow-accent)',
            }}
          >
            Q
          </div>
          {/* Brand */}
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-base font-extrabold tracking-tight" style={{ color: 'var(--eq-text)' }}>
              Quiz<span className="eq-gradient-text">AI</span>
            </span>
          </div>
          {/* AI badge */}
          <div
            className="ml-2 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex"
            style={{
              background: 'var(--eq-accent-soft)',
              borderColor: 'var(--eq-accent-border)',
              color: 'var(--eq-accent)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="truncate" style={{ maxWidth: 200 }}>{title || 'AI Generated Quiz'}</span>
          </div>
        </div>

        {/* Center — autosave indicator */}
        <div className="hidden items-center gap-2 md:flex">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: 'var(--eq-success-soft)' }}
          >
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--eq-success)' }} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold" style={{ color: 'var(--eq-text)' }}>
              {autosaveStatus === 'saving' ? 'Saving…' : 'Autosaved'}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--eq-text-light)' }}>Just now</span>
          </div>
        </div>

        {/* Right — warnings + fullscreen + submit */}
        <div className="flex items-center gap-2">
          {warnings > 0 && (
            <span
              className="hidden items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:flex"
              style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
              title={`${fullscreenExits} fullscreen exits, ${warningsCount} warnings`}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> {warnings}
            </span>
          )}

          <motion.button
            type="button"
            onClick={onFullscreen}
            whileTap={{ scale: 0.96 }}
            className="hidden items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 sm:flex"
            style={{ borderColor: 'var(--eq-border)', color: 'var(--eq-text)' }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Fullscreen</span>
          </motion.button>

          <motion.button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            whileHover={!submitting ? { scale: 1.02 } : {}}
            whileTap={!submitting ? { scale: 0.97 } : {}}
            className="eq-gradient-btn flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            <span>{submitting ? 'Submitting…' : 'Submit Quiz'}</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
