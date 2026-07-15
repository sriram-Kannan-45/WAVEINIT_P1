import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TrainerMonitoringReport from '../proctoring/components/TrainerMonitoringReport';

export default function TrainerMonitoringReportPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40 px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <TrainerMonitoringReport quizId={Number(quizId)} />
    </div>
  );
}
