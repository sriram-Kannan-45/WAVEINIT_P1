/**
 * CodingAssessmentResultPage.jsx
 * Matches ParticipantQuizResultPage visual style exactly.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import {
  Loader2,
  AlertCircle,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Code2,
  Check,
} from 'lucide-react'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
})

export default function CodingAssessmentResultPage({ user }) {
  const navigate = useNavigate()
  const { trainingId, assessmentId } = useParams()
  const { error: showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!assessmentId) {
      setErrorMsg('Invalid assessment identifier.')
      setLoading(false)
      return
    }

    let aborted = false
    const fetchResult = async () => {
      try {
        setLoading(true)
        const token = user?.token || localStorage.getItem('token') || sessionStorage.getItem('token')
        const res = await fetch(`${API_BASE}/coding/participant/assessments/${assessmentId}/result`, {
          headers: authHeaders(token)
        })
        const data = await res.json()
        if (aborted) return
        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to load coding assessment results.')
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
    return () => { aborted = true }
  }, [assessmentId, user?.token])

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
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#0D9488' }} size={32} />
        <span style={{ marginTop: '12px', fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
          Retrieving Coding Assessment Results...
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
          onClick={() => navigate('/participant')}
          style={{
            padding: '8px 20px',
            background: '#0D9488',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const isPublished = result?.resultStatus === 'PUBLISHED' || result?.status === 'PUBLISHED'
  const submissions = result?.submissions || []
  const percentage = result?.percentage ?? result?.score ?? 0
  const passStatus = result?.passStatus ?? (percentage >= 50 ? 'Pass' : 'Fail')
  const submissionTime = result?.submittedAt ? new Date(result.submittedAt).toLocaleString() : '—'
  const solvedCount = result?.problemsSolved ?? submissions.filter(s => (s.passedTestCases || 0) === (s.totalTestCases || 1) && s.totalTestCases > 0).length
  const totalProblems = result?.totalProblems ?? submissions.length

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
          {result?.attemptStatus === 'disqualified' ? (
            <>
              <XCircle size={48} color="#dc2626" style={{ margin: '0 auto 16px', animation: 'pulse 2s infinite' }} />
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#dc2626' }}>
                Coding Assessment Disqualified
              </h2>
              <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
                🚫 Your coding attempt was flagged and disqualified. Results are currently pending review by your trainer.
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
                Coding Assessment Submitted Successfully
              </h2>
              <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                {result?.message || 'Your coding assessment has been submitted successfully. Results will be published by the trainer.'}
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
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Your Coding Result</h2>
            <div style={{ fontSize: 44, fontWeight: 800, margin: '12px 0 6px', fontFamily: "'Poppins', sans-serif" }}>
              {Math.round(percentage)}%
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, fontWeight: 600 }}>
              {result.totalScore ?? 0} / {result.maxScore ?? 100} Marks Scored
            </div>
          </div>

          {/* Detailed Statistics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 24
          }}>
            {/* Status Card */}
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

            {/* Problems Solved Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Problems Solved
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0D9488' }}>
                {solvedCount} / {totalProblems}
              </div>
            </div>

            {/* Rank Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Rank
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#334155' }}>
                {result.rank ? `#${result.rank}` : '—'}
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

          {/* Problem Submissions Review */}
          {submissions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Problem Submissions
              </h3>

              {submissions.map((sub, i) => {
                const isAccepted = sub.status === 'ACCEPTED' || ((sub.passedTestCases || 0) === (sub.totalTestCases || 1) && sub.totalTestCases > 0)
                return (
                  <div
                    key={sub.id || i}
                    style={{
                      background: '#fff',
                      border: `1px solid ${isAccepted ? '#86efac' : '#fca5a5'}`,
                      borderRadius: 12,
                      padding: 18,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 5,
                      background: isAccepted ? '#10b981' : '#ef4444'
                    }} />

                    <div style={{ paddingLeft: 6 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8
                      }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          color: isAccepted ? '#10b981' : '#ef4444',
                          textTransform: 'uppercase'
                        }}>
                          {isAccepted ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {sub.status || (isAccepted ? 'Accepted' : 'Failed')} · Problem {i + 1}
                        </div>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#f1f5f9',
                          color: '#475569'
                        }}>
                          {sub.language || 'javascript'}
                        </span>
                      </div>

                      <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                        {sub.problemTitle || sub.title || `Problem ${i + 1}`}
                      </h4>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: '#475569' }}>
                        <div>
                          Test Cases:{' '}
                          <strong style={{ color: isAccepted ? '#16a34a' : '#dc2626' }}>
                            {sub.passedTestCases ?? 0} / {sub.totalTestCases ?? 0} Passed
                          </strong>
                        </div>
                        {sub.score !== undefined && (
                          <div>
                            Marks: <strong style={{ color: '#0f172a' }}>{sub.score}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
