/**
 * TerminatedScreen — full-screen lock shown after auto-submission.
 * Replaces the exam UI; user must navigate away (we route them out).
 */
import { motion } from 'framer-motion';
import { Lock, ShieldX } from 'lucide-react';
import { GlassCard, PrimaryButton } from './ui';

export default function TerminatedScreen({ reason, onExit }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-gradient-to-b from-slate-50 via-white to-sky-50/40 px-4">
      <GlassCard className="mx-auto w-full max-w-lg p-8 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 ring-1 ring-rose-200"
        >
          <ShieldX className="h-8 w-8 text-rose-500" />
        </motion.div>

        <h2 className="mt-5 text-2xl font-semibold text-slate-900">Exam terminated</h2>
        <p className="mt-2 text-sm text-slate-600">
          {reason || 'Your exam was ended automatically due to repeated violations.'}
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-semibold">Re-entry blocked</span>
          </div>
          <p className="mt-1 leading-relaxed text-amber-800/90">
            Your answers have been auto-submitted. Contact your instructor if you
            believe this was a mistake.
          </p>
        </div>

        {onExit && (
          <div className="mt-6 flex justify-center">
            <PrimaryButton onClick={onExit}>Exit exam</PrimaryButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
