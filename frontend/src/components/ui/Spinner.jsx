import { Loader2 } from 'lucide-react'

export default function Spinner({ size = 20, className = '', text }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`} style={{ color: 'var(--accent)' }}>
      <Loader2 size={size} className="animate-spin" />
      {text && <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{text}</span>}
    </div>
  )
}
