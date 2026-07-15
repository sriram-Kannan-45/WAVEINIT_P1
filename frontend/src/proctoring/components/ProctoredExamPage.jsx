/**
 * ProctoredExamPage — entry point for participants. Renders ExamGate
 * until the session is ACTIVE, then ProctoredExamShell wrapping the
 * caller-supplied exam UI (typically the existing QuizTaking component).
 *
 *   <ProctoredExamPage
 *     quizId={123}
 *     quizTitle="Final Exam"
 *     onExit={() => navigate('/participant')}
 *   >
 *     {({ session }) => <QuizTaking quizId={123} attemptId={session.attemptId} />}
 *   </ProctoredExamPage>
 */
import { useCallback } from 'react';
import { useProctor } from '../ProctorContext';
import ExamGate from './ExamGate';
import ProctoredExamShell from './ProctoredExamShell';
import TerminatedScreen from './TerminatedScreen';

export default function ProctoredExamPage({ quizId, quizTitle, attemptId, onExit, children }) {
  const proctor = useProctor();

  const handleTerminated = useCallback(() => {
    // Caller decides where to redirect — typical: dashboard
    onExit?.();
  }, [onExit]);

  if (proctor.isTerminated) {
    return (
      <TerminatedScreen
        reason={proctor.session?.terminationReason}
        onExit={handleTerminated}
      />
    );
  }

  if (!proctor.isActive) {
    return (
      <ExamGate
        quizId={quizId}
        quizTitle={quizTitle}
        attemptId={attemptId}
        onCancel={onExit}
      />
    );
  }

  return (
    <ProctoredExamShell onTerminated={handleTerminated}>
      {typeof children === 'function' ? children({ session: proctor.session }) : children}
    </ProctoredExamShell>
  );
}
