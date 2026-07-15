import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { Loader2, AlertCircle, Trophy, Clock, CheckCircle2, XCircle, ArrowLeft, Code } from 'lucide-react'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
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
        const res = await fetch(`${API_BASE}/coding/participant/assessments/${assessmentId}/result`, {
          headers: authHeaders(user.token)
        })
        const data = await res.json()
        if (aborted) return
        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to load results.')
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
  }, [assessmentId, user.token])

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={32} color="#0D9488" />
        <span style={{ marginTop: 12, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Retrieving results…</span>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <AlertCircle size={44} color="#dc2626" style={{ marginBottom: 12 }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Unable to Load Results</h3>
        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 360, margin: '0 0 16px', lineHeight: 1.5 }}>{errorMsg}</p>
        <button onClick={() => navigate(`/trainings/${trainingId}`)} style={{
          padding: '8px 20px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>Back to Training</button>
      </div>
    )
  }

  const isPublished = result?.resultStatus === 'PUBLISHED'

  return (
    <div style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
      <button onClick={() => navigate(`/trainings/${trainingId}`)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
        background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 20,
      }}>
        <ArrowLeft size={14} /> Back to Training
      </button>

      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: 32, textAlign: 'center', marginBottom: 20,
      }}>
        <Code size={40} color="#0D9488" style={{ marginBottom: 12 }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{result?.title || 'Coding Assessment'}</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>Assessment Complete</p>

        {isPublished ? (
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: result?.percentage >= 50 ? '#059669' : '#dc2626', marginBottom: 8 }}>
              {result?.percentage != null ? `${Math.round(result.percentage)}%` : '—'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: result?.percentage >= 50 ? '#059669' : '#dc2626', marginBottom: 16 }}>
              {result?.percentage >= 50 ? 'Passed' : 'Failed'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Score</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{result.totalScore ?? '—'} / {result.maxScore ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rank</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{result.rank ? `#${result.rank}` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Time Taken</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{result.timeTaken ? `${result.timeTaken}s` : '—'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <Clock size={24} color="#f59e0b" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>Waiting for Results</div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Your trainer will review and publish results soon.</p>
          </div>
        )}
      </div>

      {result?.submissions?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Your Submissions</h3>
          {result.submissions.map((sub, i) => (
            <div key={i} style={{
              padding: 14, marginBottom: 8, borderRadius: 10, border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{sub.title || `Problem ${i + 1}`}</span>
                <span style={{ fontSize: 11, color: '#64748b', padding: '2px 8px', borderRadius: 999, background: '#f1f5f9' }}>
                  {sub.language || 'javascript'}
                </span>
              </div>
              {isPublished && (
                <div style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#059669' }}>{sub.passedTestCases || 0}</span>
                  <span style={{ color: '#94a3b8' }}> / {sub.totalTestCases || 0} test cases passed</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
