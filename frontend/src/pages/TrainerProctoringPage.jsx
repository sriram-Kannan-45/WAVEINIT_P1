/**
 * TrainerProctoringPage — drop-in route page that renders the live
 * monitoring grid for a quiz.
 *
 * URL pattern:  /trainer/proctor/:quizId
 */
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TrainerProctoringDashboard } from '../proctoring';

export default function TrainerProctoringPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <button
        onClick={() => navigate(-1)}
        className="fixed left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <TrainerProctoringDashboard quizId={Number(quizId)} />
    </div>
  );
}
