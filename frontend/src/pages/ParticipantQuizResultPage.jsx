import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

export default function ParticipantQuizResultPage() {
  const navigate = useNavigate();
  const { trainingId } = useParams();

  return (
    <div
      style={{
        padding: '60px 20px',
        maxWidth: 580,
        margin: '40px auto',
        fontFamily: "'Poppins', sans-serif",
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '48px 32px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: '#ecfdf5',
            color: '#16a34a',
            margin: '0 auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckCircle2 size={36} />
        </div>

        <h2
          style={{
            margin: '0 0 10px',
            fontSize: '22px',
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          Assessment Submitted Successfully
        </h2>

        <p
          style={{
            margin: '0 0 24px',
            color: '#64748b',
            fontSize: '14px',
            lineHeight: 1.6,
            maxWidth: 440,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Your answers and monitoring data have been recorded and saved directly to the database.
          Detailed assessment evaluations and reports are managed by your trainer.
        </p>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px 18px',
            marginBottom: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#334155',
          }}
        >
          <span>✓</span> Submission Saved in Database
        </div>

        <div>
          <button
            type="button"
            onClick={() => navigate(trainingId ? `/trainings/${trainingId}` : '/participant')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 28px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowLeft size={16} /> Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
