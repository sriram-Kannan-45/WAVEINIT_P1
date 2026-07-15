/**
 * useExamTimer — server-synced countdown driven by the absolute
 * `endsAt` timestamp returned at session start. Tolerant to clock
 * drift; recalculates remaining time on every tick from Date.now().
 */
import { useEffect, useState, useRef } from 'react';

export default function useExamTimer(endsAt, { onExpire } = {}) {
  const [remaining, setRemaining] = useState(() => calc(endsAt));
  const fired = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    fired.current = false;
    const tick = () => {
      const r = calc(endsAt);
      setRemaining(r);
      if (r <= 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  return remaining;
}

function calc(endsAt) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

export function formatRemaining(seconds) {
  if (seconds == null) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
