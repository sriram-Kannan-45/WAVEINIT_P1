import { useEffect, useRef, useState } from 'react';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Timer({ durationInSeconds, onTimeUp, attemptId }) {
  const [timeLeft, setTimeLeft] = useState(durationInSeconds);
  const timeLeftRef = useRef(durationInSeconds);
  const intervalRef = useRef(null);

  useEffect(() => {
    timeLeftRef.current = durationInSeconds;
    setTimeLeft(durationInSeconds);
  }, [durationInSeconds]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        timeLeftRef.current = next;
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [attemptId]);

  useEffect(() => {
    if (timeLeft === 0) {
      onTimeUp?.();
    }
  }, [timeLeft, onTimeUp]);

  let colorClass = 'text-slate-700';
  if (timeLeft <= 60) {
    colorClass = 'text-red-600 animate-pulse';
  } else if (timeLeft <= 300) {
    colorClass = 'text-orange-500';
  }

  return (
    <div className={`font-mono text-xl font-semibold ${colorClass}`}>
      {formatTime(timeLeft)}
    </div>
  );
}
