import { ChevronLeft, ChevronRight, Flag, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BottomNav({ currentIndex, totalQuestions, flagged, questionId, onPrev, onNext, onToggleFlag, autosaveMs = 8 }) {
  const isFlagged = flagged.has(questionId);
  const atStart = currentIndex === 0;
  const atEnd = currentIndex >= totalQuestions - 1;

  return (
    <div className="eq-glass shrink-0 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:px-5">
      {/* Previous */}
      <motion.button
        type="button"
        onClick={onPrev}
        disabled={atStart}
        whileTap={!atStart ? { scale: 0.97 } : {}}
        className="flex items-center gap-1.5 rounded-xl border bg-white/60 px-4 py-2 text-sm font-medium transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ borderColor: 'var(--eq-border)', color: 'var(--eq-text)' }}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </motion.button>

      {/* Center cluster */}
      <div className="flex items-center gap-3 sm:gap-5">
        <motion.button
          type="button"
          onClick={onToggleFlag}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition"
          style={{
            background: isFlagged ? 'var(--eq-flag-soft)' : 'rgba(255,255,255,0.6)',
            borderColor: isFlagged ? 'var(--eq-flag)' : 'var(--eq-border)',
            color: isFlagged ? 'var(--eq-flag)' : 'var(--eq-text-muted)',
          }}
        >
          <Flag className="h-4 w-4" fill={isFlagged ? 'var(--eq-flag-soft)' : 'transparent'} />
          <span className="hidden sm:inline">{isFlagged ? 'Flagged' : 'Flag'}</span>
        </motion.button>

        <span
          className="eq-autosave hidden items-center gap-1.5 text-xs md:flex"
          style={{ color: 'var(--eq-text-light)' }}
        >
          <Save className="h-3.5 w-3.5" />
          Autosaves every {autosaveMs}s
        </span>
      </div>

      {/* Next */}
      <motion.button
        type="button"
        onClick={onNext}
        disabled={atEnd}
        whileTap={!atEnd ? { scale: 0.97 } : {}}
        whileHover={!atEnd ? { x: 2 } : {}}
        className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: 'linear-gradient(135deg, var(--eq-accent) 0%, #0F766E 100%)',
          boxShadow: '0 4px 12px -2px rgba(13,148,136,0.4)',
        }}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </motion.button>
    </div>
  );
}
