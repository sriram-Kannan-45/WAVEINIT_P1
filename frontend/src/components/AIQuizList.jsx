/**
 * AI Quiz List — premium dashboard entry point.
 * Maintains backward-compatible API: { user, onStartQuiz }
 */
import AIQuizzesDashboard from './ai-quizzes/AIQuizzesDashboard'

export default function AIQuizList(props) {
  return <AIQuizzesDashboard {...props} embedded />
}
