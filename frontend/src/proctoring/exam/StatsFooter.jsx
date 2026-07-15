import { LayoutGrid, CheckCircle2, Clock, Timer, Power, Shield } from 'lucide-react';

export default function StatsFooter({
  total,
  answered,
  remaining,
  timeSpent,
  autoSubmit = 'Off',
  examMode = 'Secure',
}) {
  return (
    <footer
      className="eq-glass shrink-0 border-t"
      style={{ borderColor: 'var(--eq-border)' }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <Stat
          icon={<LayoutGrid className="h-4 w-4" />}
          iconBg="var(--eq-accent-soft)"
          iconColor="var(--eq-accent)"
          label="Total Questions"
          value={total}
        />
        <Divider />
        <Stat
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconBg="var(--eq-success-soft)"
          iconColor="var(--eq-success)"
          label="Answered"
          value={answered}
        />
        <Divider />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          iconBg="#fef3c7"
          iconColor="var(--eq-flag)"
          label="Remaining"
          value={remaining}
        />
        <Divider />
        <Stat
          icon={<Timer className="h-4 w-4" />}
          iconBg="#fef3f9"
          iconColor="var(--eq-accent-3)"
          label="Time Spent"
          value={timeSpent}
          mono
        />
        <Divider />
        <Stat
          icon={<Power className="h-4 w-4" />}
          iconBg="var(--eq-bg-2)"
          iconColor="var(--eq-text-muted)"
          label="Auto Submit"
          value={autoSubmit}
        />
        <Divider />
        <Stat
          icon={<Shield className="h-4 w-4" />}
          iconBg="var(--eq-success-soft)"
          iconColor="var(--eq-success)"
          label="Exam Mode"
          value={examMode}
          valueColor="var(--eq-success)"
        />
      </div>
    </footer>
  );
}

function Stat({ icon, iconBg, iconColor, label, value, valueColor, mono }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--eq-text-muted)' }}>
          {label}
        </span>
        <span
          className={`text-sm font-extrabold ${mono ? 'eq-timer-mono' : ''}`}
          style={{ color: valueColor || 'var(--eq-text)' }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="h-8 w-px shrink-0" style={{ background: 'var(--eq-border)' }} />;
}
