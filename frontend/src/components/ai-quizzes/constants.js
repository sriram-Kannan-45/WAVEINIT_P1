export const DIFFICULTY = {
  EASY: {
    label: 'Easy',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/80 dark:text-emerald-300 dark:border-emerald-500/30',
    bar: 'from-emerald-400 to-emerald-600',
    barWidth: '33%',
  },
  MEDIUM: {
    label: 'Medium',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-700 border-amber-200/80 dark:text-amber-300 dark:border-amber-500/30',
    bar: 'from-amber-400 to-amber-600',
    barWidth: '66%',
  },
  HARD: {
    label: 'Hard',
    dot: 'bg-rose-500',
    badge: 'bg-rose-500/10 text-rose-700 border-rose-200/80 dark:text-rose-300 dark:border-rose-500/30',
    bar: 'from-rose-400 to-rose-600',
    barWidth: '100%',
  },
  MIXED: {
    label: 'Mixed',
    dot: 'bg-primary-500',
    badge: 'bg-primary-500/10 text-primary-700 border-primary-200/80 dark:text-primary-300 dark:border-primary-500/30',
    bar: 'from-primary-400 to-primary-600',
    barWidth: '75%',
  },
}

export const FILTER_OPTIONS = ['ALL', 'EASY', 'MEDIUM', 'HARD', 'MIXED']

export const PROGRESS_STORAGE_KEY = 'ai-quiz-progress'

export function getDifficultyConfig(level) {
  const key = (level || 'MEDIUM').toUpperCase()
  return DIFFICULTY[key] || DIFFICULTY.MEDIUM
}

export function getStoredCompletion(quizId) {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return 0
    const map = JSON.parse(raw)
    const value = map?.[quizId]
    return typeof value === 'number' ? Math.min(100, Math.max(0, value)) : 0
  } catch {
    return 0
  }
}

export function setStoredCompletion(quizId, percent) {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[quizId] = Math.min(100, Math.max(0, percent))
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
