import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ArrowLeft, Loader2, Sparkles, AlertCircle, Clock, Award } from 'lucide-react';
import { API_BASE } from '../api/api';

export default function CodingAssessmentResultPage() {
  const navigate = useNavigate();
  const { id: assessmentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/coding/participant/assessments/${assessmentId}/result`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (res.ok) {
          setResult(data);
        } else {
          setError(data.error || 'Failed to load results');
        }
      } catch (err) {
        setError('Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [assessmentId]);

  if (loading) {
    return (
      <div style={{
        padding: '60px 20px',
        maxWidth: 580,
        margin: '40px auto',
        fontFamily: 'Poppins, sans-serif',
        textAlign: 'center',
      }}>
        <Loader2 size={40} className="animate-spin" style={{ color: '#0d9488', margin: '0 auto 20px' }} />
        <p style={{ color: '#64748b', fontSize: '14px' }}>Loading your results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '60px 20px',
        maxWidth: 580,
        margin: '40px auto',
        fontFamily: 'Poppins, sans-serif',
        textAlign: 'center',
      }}>
        <AlertCircle size={40} style={{ color: '#dc2626', margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
          Error Loading Results
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>{error}</p>
        <button
          type="button"
          onClick={() => navigate('/participant')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 28px',
            background: '#0d9488',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} /> Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '60px 20px',
        maxWidth: 700,
        margin: '40px auto',
        fontFamily: 'Poppins, sans-serif',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '40px 32px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: '#ecfdf5',
            color: '#0d9488',
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
            fontSize: '24px',
            fontWeight: 700,
            color: '#0f172a',
            textAlign: 'center',
          }}
        >
          Coding Assessment Submitted
        </h2>

        <p
          style={{
            margin: '0 0 32px',
            color: '#64748b',
            fontSize: '14px',
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          Your submission has been recorded. Here are your results:
        </p>

        {/* Score Display */}
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', fontWeight: 800, color: '#15803d', lineHeight: 1 }}>
            {result.percentage || 0}%
          </div>
          <div style={{ fontSize: '14px', color: '#166534', fontWeight: 600, marginTop: '4px' }}>
            {result.totalScore || 0} / {result.maxScore || 0} points
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
            {result.problemsSolved || 0} of {result.totalProblems || 0} problems solved
          </div>
        </div>

        {/* Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Clock size={16} style={{ color: '#64748b' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Time Taken
              </span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              {result.timeTaken ? `${Math.round(result.timeTaken / 60)}m ${result.timeTaken % 60}s` : '—'}
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Award size={16} style={{ color: '#64748b' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Rank
              </span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              #{result.rank || '—'}
            </div>
          </div>
        </div>

        {/* AI Usage Section */}
        <div
          style={{
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Sparkles size={16} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase' }}>
              AI Mentor Usage
            </span>
          </div>
          <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#334155' }}>
            <div>
              <span style={{ color: '#64748b' }}>AI Used:</span>{' '}
              <strong>{result.aiUsed ? 'Yes' : 'No'}</strong>
            </div>
            {result.aiUsed && (
              <>
                <div>
                  <span style={{ color: '#64748b' }}>Interactions:</span>{' '}
                  <strong>{result.aiInteractionCount || 0}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Level:</span>{' '}
                  <strong>{result.aiUsageLevel || 'NONE'}</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Test Cases Summary */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '28px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>
            Test Cases
          </div>
          <div style={{ fontSize: '14px', color: '#334155' }}>
            <strong>{result.passedTestCases || 0}</strong> of <strong>{result.totalTestCases || 0}</strong> test cases passed
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/participant')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 28px',
              background: '#0d9488',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
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
