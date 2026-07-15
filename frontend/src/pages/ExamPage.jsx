/**
 * ExamPage — route entry for /exam/:sessionId
 *
 * Mounts the ProctorProvider and the ExamShell. Auth-guarded:
 * if the user is not signed in, send them to /login. The shell
 * will server-hydrate the exam, and the provider will keep the
 * proctoring session live (heartbeat, socket join, violations).
 */
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { ProctorProvider } from '../proctoring';
import useAuthUser from '../proctoring/hooks/useAuthUser';
import ExamShell from '../proctoring/exam/ExamShell';

export default function ExamPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuthUser();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600" />
      </div>
    );
  }
  if (!user?.id) return <Navigate to="/login" replace />;

  return (
    <ProctorProvider>
      <ExamShell
        sessionId={Number(sessionId)}
        onSubmitted={() => navigate(`/exam/${sessionId}/result`, { replace: true })}
      />
    </ProctorProvider>
  );
}
