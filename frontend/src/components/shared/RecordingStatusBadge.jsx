import { Clock, CheckCircle, XCircle } from 'lucide-react'

const styles = {
  ready: 'bg-green-100 text-green-700 border-green-200',
  processing: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
}

const icons = {
  ready: CheckCircle,
  processing: Clock,
  failed: XCircle,
}

export default function RecordingStatusBadge({ status }) {
  const s = (status || '').toLowerCase()
  const Icon = icons[s] || Clock
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[s] || styles.processing}`}>
      <Icon size={12} />
      {s === 'ready' ? 'Ready' : s === 'processing' ? 'Processing' : s === 'failed' ? 'Failed' : status}
    </span>
  )
}
