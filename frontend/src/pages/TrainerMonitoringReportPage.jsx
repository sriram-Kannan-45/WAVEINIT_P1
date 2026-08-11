import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TrainerMonitoringReport from '../proctoring/components/TrainerMonitoringReport';

export default function TrainerMonitoringReportPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 50%, #f0f9ff 100%)', padding: '24px 16px' }}>
      <div className="reg-admin">
        <button
          onClick={() => navigate(-1)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ marginBottom: 16, cursor: 'pointer' }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <TrainerMonitoringReport quizId={Number(quizId)} />
      </div>
    </div>
  );
}
