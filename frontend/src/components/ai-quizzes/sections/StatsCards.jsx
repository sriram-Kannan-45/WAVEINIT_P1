import { CheckCircle2, Clock, Layers, Target } from 'lucide-react'
import Card from '../ui/Card'

const STATS = [
  { key: 'available', label: 'Available', icon: Target },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'inProgress', label: 'In progress', icon: Layers },
  { key: 'avgTime', label: 'Avg. duration', icon: Clock },
]

export default function StatsCards({ stats, loading }) {
  if (loading) {
    return (
      <div className="ai-quiz-stats">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="ai-quiz-stat ai-quiz-stat--skeleton animate-pulse">
            <div className="h-10 rounded-lg bg-gray-100" />
          </Card>
        ))}
      </div>
    )
  }

  const values = {
    available: stats.available,
    completed: stats.completed,
    inProgress: stats.inProgress,
    avgTime: stats.avgTime,
  }

  return (
    <div className="ai-quiz-stats" role="list" aria-label="Quiz statistics">
      {STATS.map(({ key, label, icon: Icon }) => (
        <Card key={key} className="ai-quiz-stat" role="listitem">
          <div className="ai-quiz-stat__icon" aria-hidden>
            <Icon size={18} />
          </div>
          <div>
            <p className="ai-quiz-stat__label">{label}</p>
            <p className="ai-quiz-stat__value">{values[key]}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
