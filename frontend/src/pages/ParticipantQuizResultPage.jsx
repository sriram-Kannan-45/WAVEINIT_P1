import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { Loader2, AlertCircle, Trophy, Clock, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

const resolveAnswerText = (val, options) => {
  if (val === null || val === undefined || val === '') return '—';
  if (!options || !Array.isArray(options) || options.length === 0) return String(val);
  
  const str = String(val).trim();
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed)
          .map(([k, v]) => `${k} ➔ ${v}`)
          .join(', ');
      }
    } catch (e) {}
  }

  if (/^[0-9]$/.test(str)) {
    const idx = parseInt(str, 10);
    if (options[idx] !== undefined) return options[idx];
  }
  if (/^[A-H]$/i.test(str)) {
    const idx = str.toUpperCase().charCodeAt(0) - 65;
    if (options[idx] !== undefined) return options[idx];
  }
  return str;
};

const resolvePairs = (pairsVal) => {
  if (!pairsVal) return null;
  let parsed = pairsVal;
  if (typeof pairsVal === 'string') {
    try {
      parsed = JSON.parse(pairsVal);
    } catch (e) {
      return null;
    }
  }
  if (Array.isArray(parsed)) return parsed;
  return null;
};

export default function ParticipantQuizResultPage({ user }) {
  const navigate = useNavigate()
  const { trainingId, quizId } = useParams()
  const { error: showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!quizId) {
      setErrorMsg('Invalid quiz identifier.')
      setLoading(false)
      return
    }

    let aborted = false
    const fetchResult = async () => {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/participant/quizzes/${quizId}/result`, {
          headers: authHeaders(user.token)
        })
        const data = await res.json()
        if (aborted) return

        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to load quiz results.')
          setLoading(false)
          return
        }

        setResult(data)
        setLoading(false)
      } catch (err) {
        if (!aborted) {
          setErrorMsg(err.message || 'Server error loading results.')
          setLoading(false)
        }
      }
    }

    fetchResult()
    return () => {
      aborted = true
    }
  }, [quizId, user.token])

  if (loading) {
    return (
      <div style={{
        padding: '60px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Manrope', 'Poppins', sans-serif"
      }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#2563eb' }} size={32} />
        <span style={{ marginTop: '12px', fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
          Retrieving Quiz Results...
        </span>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div style={{
        padding: '60px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Manrope', 'Poppins', sans-serif"
      }}>
        <AlertCircle size={44} color="#dc2626" style={{ marginBottom: 12 }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
          Unable to Load Results
        </h3>
        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 360, margin: '0 0 16px', lineHeight: 1.5 }}>
          {errorMsg}
        </p>
        <button
          className="ac-btn ac-btn-secondary"
          onClick={() => navigate('/participant')}
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const isPublished = result?.status === 'PUBLISHED' || result?.resultStatus === 'PUBLISHED'

  const review = result?.review || [];
  const correctCount = result?.correctCount ?? review.filter(q => q.isCorrect).length;
  const wrongCount = result?.wrongCount ?? (review.length - correctCount);
  const percentage = result?.score ?? 0;
  const passStatus = result?.passStatus ?? (percentage >= 50 ? 'Pass' : 'Fail');
  const submissionTime = result?.submittedAt ? new Date(result.submittedAt).toLocaleString() : '—';

  return (
    <div style={{ padding: '24px 0', maxWidth: 760, margin: '0 auto', fontFamily: "'Manrope', 'Poppins', sans-serif" }}>
      {/* Back Header */}
      <button
        onClick={() => navigate('/participant')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: '#475569',
          cursor: 'pointer',
          marginBottom: 20,
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          transition: 'all 0.15s ease'
        }}
      >
        <ArrowLeft size={14} /> Back to Trainings
      </button>

      {/* Main Results Container */}
      {!isPublished ? (
        <div style={{
          padding: '48px 32px',
          textAlign: 'center',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          {result?.attemptStatus === 'disqualified_copy_violation' ? (
            <>
              <XCircle size={48} color="#dc2626" style={{ margin: '0 auto 16px', animation: 'pulse 2s infinite' }} />
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#dc2626' }}>
                Quiz Terminated & Disqualified
              </h2>
              <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
                🚫 You have been disqualified for repeated copy attempts. Your attempt has been submitted and flagged for review. Results are currently pending review by your trainer.
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: '#b91c1c'
              }}>
                <span style={{ fontSize: 16 }}>🚫</span> Attempt Flagged for Security Violations
              </div>
            </>
          ) : (
            <>
              <Clock size={48} color="#f59e0b" style={{ margin: '0 auto 16px', animation: 'pulse 2s infinite' }} />
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                Quiz Submitted Successfully
              </h2>
              <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                {result?.message || 'Your quiz has been submitted. The trainer has not published the results yet. You will be notified once they are available.'}
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: '#b45309'
              }}>
                <span style={{ fontSize: 16 }}>🟡</span> Result Pending - Waiting for Trainer to Publish Results
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          {result?.attemptStatus === 'disqualified_copy_violation' && (
            <div style={{
              background: '#fee2e2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '14px 18px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <AlertCircle size={18} />
              <span>This attempt was terminated and marked as disqualified due to security copy violations.</span>
            </div>
          )}

          {/* Scored Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0D9488 0%, #134e4a 100%)',
            color: '#fff',
            padding: '32px 24px',
            borderRadius: 16,
            textAlign: 'center',
            marginBottom: 24,
            boxShadow: '0 4px 12px rgba(13, 148, 136, 0.15)'
          }}>
            <Trophy size={36} style={{ margin: '0 auto 10px', color: '#fbbf24' }} />
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Your Quiz Result</h2>
            <div style={{ fontSize: 44, fontWeight: 800, margin: '12px 0 6px', fontFamily: "'Poppins', sans-serif" }}>
              {result.score?.toFixed(0)}%
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, fontWeight: 600 }}>
              {result.totalScore} / {result.maxScore} Marks Correct
            </div>
          </div>

          {/* Detailed Statistics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 24
          }}>
            {/* Pass/Fail Status Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Status
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 800,
                color: passStatus === 'Pass' ? '#16a34a' : '#dc2626',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'center'
              }}>
                {passStatus === 'Pass' ? 'Pass' : 'Fail'}
              </div>
            </div>

            {/* Correct Answers Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Correct Answers
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>
                {correctCount}
              </div>
            </div>

            {/* Wrong Answers Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Wrong Answers
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>
                {wrongCount}
              </div>
            </div>

            {/* Submission Time Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Submitted At
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', lineHeight: 1.4 }}>
                {submissionTime}
              </div>
            </div>
          </div>

          {/* Question Review List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Question Review
            </h3>

            {(result.review || []).map((q, i) => (
              <div key={q.questionId} style={{
                background: '#fff',
                border: `1px solid ${q.isCorrect ? '#86efac' : '#fca5a5'}`,
                borderRadius: 12,
                padding: 18,
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Left accent border */}
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 5,
                  background: q.isCorrect ? '#10b981' : '#ef4444'
                }} />

                <div style={{ paddingLeft: 6 }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: q.isCorrect ? '#10b981' : '#ef4444',
                    marginBottom: 8,
                    textTransform: 'uppercase'
                  }}>
                    {q.isCorrect ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {q.isCorrect ? 'Correct' : 'Incorrect'} · Question {i + 1}
                  </div>

                  <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#0f172a', lineHeight: 1.5 }}>
                    {q.questionText}
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                    <div style={{ color: '#475569' }}>
                      Your Answer:{' '}
                      <strong style={{ color: '#1e293b' }}>
                        {q.mySelectedOption !== null && q.options && q.options[q.mySelectedOption] !== undefined
                          ? q.options[q.mySelectedOption]
                          : resolveAnswerText(q.myAnswer, q.options)}
                      </strong>
                    </div>
                    <div style={{ color: '#10b981', fontWeight: 600 }}>
                      Correct Answer:{' '}
                      <span>
                        {resolvePairs(q.pairs)
                          ? resolvePairs(q.pairs).map(p => `${p.left} ➔ ${p.right}`).join(', ')
                          : resolveAnswerText(q.correctAnswer, q.options)}
                      </span>
                    </div>
                    {q.explanation && (
                      <div style={{
                        marginTop: 8,
                        padding: 10,
                        background: '#f8fafc',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#64748b',
                        lineHeight: 1.5,
                        borderLeft: '2px solid #cbd5e1'
                      }}>
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
