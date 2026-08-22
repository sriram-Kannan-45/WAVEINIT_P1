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
    <div style={{ minHeight: 'auto', background: '#f8fafc', paddingBottom: 24 }}>
      <button
        onClick={() => navigate(-1)}
        className="reg-admin-btn reg-admin-btn--secondary"
        style={{ position: 'fixed', left: 16, top: 16, zIndex: 50, cursor: 'pointer', boxShadow: '0 1px 3px rgba(15,23,42,0.12)' }}
      >
        <ArrowLeft size={15} /> Back
      </button>
      <TrainerProctoringDashboard quizId={Number(quizId)} />
    </div>
  );
}
