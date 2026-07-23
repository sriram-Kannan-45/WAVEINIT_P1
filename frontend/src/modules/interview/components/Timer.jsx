import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function Timer({ startTime, className = '' }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className={`flex items-center gap-1.5 font-mono text-sm ${className}`}>
      <Clock size={14} className="text-white/60" />
      <span className="font-semibold text-white">
        {hours > 0 ? `${pad(hours)}:` : ''}{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
}
