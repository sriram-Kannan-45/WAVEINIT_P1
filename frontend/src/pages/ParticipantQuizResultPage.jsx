import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Clock,
  Award,
  Check,
  X,
  FileText,
  RefreshCw,
  ShieldCheck,
  BookOpen
} from 'lucide-react';
import { API_BASE } from '../api/api';
import { getAuthHeaders } from '../api/request';

const formatTime = (totalSec) => {
  if (!totalSec || totalSec <= 0) return '00:00';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function ParticipantQuizResultPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { trainingId, quizId } = useParams();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attemptId');

  const [loading, setLoading] = useState(!location.state?.result);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(location.state?.result || null);

  const fetchResult = useCallback(async () => {
    if (!quizId) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/participant/quizzes/${quizId}/result${attemptId ? `?attemptId=${attemptId}` : ''}`;
      const res = await fetch(url, {
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load test result');
      }
      setResult(data);
    } catch (err) {
      console.error('[ParticipantQuizResultPage] Error fetching result:', err);
      setError(err.message || 'Could not load test results');
    } finally {
      setLoading(false);
    }
  }, [quizId, attemptId]);

  useEffect(() => {
    // If we don't have result or we need to ensure fresh data from database
    if (!result) {
      fetchResult();
    }
  }, [fetchResult, result]);

  const handleReturn = () => {
    if (trainingId && trainingId !== '0') {
      navigate(`/participant?tab=myEnrollments&courseId=${trainingId}&subtab=quizzes`);
    } else {
      navigate('/participant?tab=myEnrollments');
    }
  };

  // ── Loading View ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Poppins', sans-serif",
          padding: '40px 20px',
          textAlign: 'center',
        }}
      >
        <Loader2 size={44} className="animate-spin" style={{ color: '#2563eb', marginBottom: 16 }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Loading Assessment Results...
        </h3>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          Retrieving your score and submission details from the database.
        </p>
      </div>
    );
  }

  // ── Error View ────────────────────────────────────────────────────────────
  if (error && !result) {
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
            borderRadius: 20,
            border: '1px solid #fee2e2',
            padding: '44px 32px',
            boxShadow: '0 4px 20px rgba(220, 38, 38, 0.06)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#fef2f2',
              color: '#dc2626',
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertCircle size={36} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
            Unable to Load Results
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={fetchResult}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={15} /> Retry
            </button>
            <button
              type="button"
              onClick={handleReturn}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                background: '#f1f5f9',
                color: '#334155',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={15} /> Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPublished = result?.status === 'PUBLISHED' || result?.resultStatus === 'PUBLISHED';
  const quizTitle = result?.quizTitle || location.state?.quizData?.title || 'Quiz Assessment';

  return (
    <div
      style={{
        maxWidth: 780,
        margin: '32px auto 60px',
        padding: '0 20px',
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* ── Top Hero Card ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 24,
          border: '1px solid #e2e8f0',
          padding: '40px 32px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)',
          textAlign: 'center',
          marginBottom: 28,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Subtle decorative background glow */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 320,
            height: 140,
            background: isPublished
              ? 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(255,255,255,0) 70%)'
              : 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, rgba(255,255,255,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: isPublished ? '#eff6ff' : '#ecfdf5',
            color: isPublished ? '#2563eb' : '#16a34a',
            margin: '0 auto 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isPublished
              ? '0 8px 20px rgba(37, 99, 235, 0.15)'
              : '0 8px 20px rgba(22, 163, 74, 0.15)',
          }}
        >
          {isPublished ? <Award size={38} /> : <CheckCircle2 size={38} />}
        </div>

        <div
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 999,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: 12,
            fontWeight: 600,
            color: '#64748b',
            marginBottom: 8,
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}
        >
          {isPublished ? 'Official Result' : 'Submission Completed'}
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
          }}
        >
          {isPublished ? quizTitle : 'Test Completed Successfully'}
        </h1>

        <p
          style={{
            color: '#64748b',
            fontSize: 14.5,
            lineHeight: 1.6,
            maxWidth: 500,
            margin: '0 auto 24px',
          }}
        >
          {isPublished
            ? 'Your answers have been graded and evaluated. You can view your performance breakdown below.'
            : 'Your answers have been submitted successfully and stored directly in the database. Please wait while your trainer reviews and publishes the final scores.'}
        </p>

        {/* ── Status Banner (Hidden/Pending Review vs Published) ────────── */}
        {!isPublished ? (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 14,
              padding: '16px 20px',
              margin: '0 auto 28px',
              maxWidth: 520,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
            }}
          >
            <Clock size={24} style={{ color: '#d97706', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>
                Results Pending Trainer Review
              </div>
              <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 2 }}>
                Your responses and proctoring audit are verified and safe. Scores will appear on your dashboard once published.
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: result?.passStatus === 'Pass' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${result?.passStatus === 'Pass' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 16,
              padding: '20px 24px',
              margin: '0 auto 28px',
              maxWidth: 420,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Your Score
              </div>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: result?.passStatus === 'Pass' ? '#16a34a' : '#dc2626',
                  lineHeight: 1.1,
                  marginTop: 4
                }}
              >
                {result.score}%
              </div>
            </div>
            <div style={{ width: 1, height: 48, background: '#e2e8f0' }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Status
              </div>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 6,
                  padding: '4px 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  background: result?.passStatus === 'Pass' ? '#16a34a' : '#dc2626',
                  color: '#ffffff',
                }}
              >
                {result.passStatus || (result.score >= 50 ? 'Pass' : 'Fail')}
              </span>
            </div>
          </div>
        )}

        {/* ── Key Metrics Grid ───────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
            margin: '0 auto 28px',
            maxWidth: 600,
          }}
        >
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Attempt ID
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              #{result?.attemptId || attemptId || '—'}
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Questions
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {result?.answeredCount ?? result?.totalQuestions ?? '—'}
              {result?.totalQuestions ? ` / ${result.totalQuestions}` : ''}
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Time Taken
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {formatTime(result?.timeTaken)}
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Integrity
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <ShieldCheck size={16} /> Verified
            </div>
          </div>
        </div>

        {/* ── Return / Navigation Actions ────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleReturn}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 28px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowLeft size={16} /> Return to Course Quizzes
          </button>
        </div>
      </div>

      {/* ── Question-by-Question Review (When Results are Published) ───────── */}
      {isPublished && Array.isArray(result?.review) && result.review.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <BookOpen size={20} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Question Review &amp; Explanations
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {result.review.map((qItem, idx) => (
              <div
                key={qItem.questionId || idx}
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  border: `1.5px solid ${qItem.isCorrect ? '#bbf7d0' : '#fecaca'}`,
                  padding: '20px 24px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                    QUESTION {idx + 1}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: qItem.isCorrect ? '#dcfce7' : '#fee2e2',
                      color: qItem.isCorrect ? '#166534' : '#991b1b',
                    }}
                  >
                    {qItem.isCorrect ? <Check size={13} /> : <X size={13} />}
                    {qItem.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>

                <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 14 }}>
                  {qItem.questionText}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
                  <div style={{ color: qItem.isCorrect ? '#166534' : '#991b1b' }}>
                    <strong>Your Answer:</strong>{' '}
                    {qItem.mySelectedOption !== null && qItem.mySelectedOption !== undefined
                      ? (Array.isArray(qItem.options) && qItem.options[qItem.mySelectedOption]
                          ? qItem.options[qItem.mySelectedOption]
                          : `Option ${qItem.mySelectedOption + 1}`)
                      : (qItem.myAnswer || 'Not answered')}
                  </div>

                  {!qItem.isCorrect && qItem.correctAnswer && (
                    <div style={{ color: '#166534' }}>
                      <strong>Correct Answer:</strong> {qItem.correctAnswer}
                    </div>
                  )}

                  {qItem.explanation && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: 12.5,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>Explanation:</strong> {qItem.explanation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
