import { motion } from 'framer-motion'
import { Trophy, MessageSquare, BookOpen, Search, Users } from 'lucide-react'

const VARIANTS = {
  'no-trainings': {
    Icon: BookOpen, color: '#0D9488',
    title: 'No Trainings Yet',
    body: 'No training programs are available right now. Check back soon!',
    bg: 'bg-primary-50', border: 'border-primary-200',
  },
  'no-enrollments': {
    Icon: BookOpen, color: '#059669',
    title: 'No Enrollments Yet',
    body: "You haven't enrolled in any training programs yet. Browse available trainings to get started.",
    bg: 'bg-emerald-50', border: 'border-emerald-200',
  },
  'no-feedback': {
    Icon: MessageSquare, color: '#e11d48',
    title: 'No Feedback Yet',
    body: 'Your submitted feedback will appear here once you complete a training session.',
    bg: 'bg-rose-50', border: 'border-rose-200',
  },
  'no-leaderboard': {
    Icon: Trophy, color: '#d97706',
    title: 'Leaderboard Empty',
    body: 'Be the first to take a quiz and claim the top spot!',
    bg: 'bg-amber-50', border: 'border-amber-200',
  },
  'no-search': {
    Icon: Search, color: '#3b82f6',
    title: 'No Results Found',
    body: "Try adjusting your search or filter to find what you're looking for.",
    bg: 'bg-blue-50', border: 'border-blue-200',
  },
  'no-participants': {
    Icon: Users, color: '#0D9488',
    title: 'No Participants',
    body: 'There are no participants matching your current filters.',
    bg: 'bg-primary-50', border: 'border-primary-200',
  },
}

export default function EmptyState({ variant = 'no-trainings', title, body, action }) {
  const config = VARIANTS[variant] || VARIANTS['no-trainings']
  const { Icon, color, bg, border } = config
  const displayTitle = title || config.title
  const displayBody = body || config.body

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className={`relative inline-flex items-center justify-center w-24 h-24 rounded-2xl ${bg} border ${border} mb-6 shadow-sm`}
      >
        <div
          className="absolute inset-0 rounded-2xl opacity-30 blur-xl"
          style={{ background: `radial-gradient(circle, ${color}55, transparent 70%)` }}
        />
        <Icon size={40} style={{ color, position: 'relative', zIndex: 1 }} strokeWidth={1.5} />
      </motion.div>

      <h3 className="font-display text-xl font-black text-slate-900 mb-2">{displayTitle}</h3>
      <p className="text-slate-500 text-base max-w-md leading-relaxed mb-8">{displayBody}</p>

      {action && (
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          {action}
        </motion.div>
      )}
    </motion.div>
  )
}