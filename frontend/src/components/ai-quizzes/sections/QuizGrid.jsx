import QuizCard from '../cards/QuizCard'
import QuizCardSkeleton from '../cards/QuizCardSkeleton'
import EmptyState from './EmptyState'

export default function QuizGrid({
  quizzes,
  loading,
  onStart,
  startingId,
  onRefresh,
  emptyFiltered,
}) {
  if (loading) {
    return (
      <div className="ai-quiz-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <QuizCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (quizzes.length === 0) {
    return <EmptyState onRefresh={onRefresh} filtered={emptyFiltered} />
  }

  return (
    <div className="ai-quiz-grid">
      {quizzes.map((quiz, i) => (
        <QuizCard
          key={quiz.id}
          quiz={quiz}
          index={i}
          onStart={onStart}
          isStarting={startingId === quiz.id}
        />
      ))}
    </div>
  )
}
