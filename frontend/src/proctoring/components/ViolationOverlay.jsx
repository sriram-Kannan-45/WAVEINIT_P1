/**
 * ViolationOverlay — transient warning popup. Driven by `lastWarning`
 * from ProctorContext; auto-dismisses after a short timeout.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { AlertOctagon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useProctor } from '../ProctorContext';
import { VIOLATION_LABELS } from '../constants';

export default function ViolationOverlay() {
  const { lastWarning, warningsCount, fullscreenExits } = useProctor();
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    if (!lastWarning) return;
    setVisible(lastWarning);
    const id = setTimeout(() => setVisible(null), 3500);
    return () => clearTimeout(id);
  }, [lastWarning]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={visible.at}
          initial={{ opacity: 0, y: -24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed left-1/2 top-6 z-[200] -translate-x-1/2"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-white px-5 py-3 shadow-[0_20px_50px_-15px_rgba(244,63,94,0.35)]">
            <motion.div
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 0.5 }}
              className="rounded-lg bg-rose-100 p-2"
            >
              <AlertOctagon className="h-5 w-5 text-rose-600" />
            </motion.div>
            <div className="text-sm">
              <p className="font-semibold text-rose-700">
                {visible.message || VIOLATION_LABELS[visible.type] || 'Warning'}
              </p>
              <p className="mt-0.5 text-xs text-rose-500/90">
                Warnings: {warningsCount}/5 · Fullscreen exits: {fullscreenExits}/3
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
