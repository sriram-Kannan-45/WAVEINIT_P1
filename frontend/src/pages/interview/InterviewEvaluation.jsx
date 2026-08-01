/**
 * InterviewEvaluation Page
 * Post-interview evaluation form — matches admin portal design system.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardCheck, Star, CheckCircle, XCircle, Clock } from 'lucide-react'
import interviewService from '../../services/interviewService'
import { Button, Card, CardBody, Textarea, Spinner, EmptyState, Badge } from '../../components/ui'
import PageHeader from '../../components/ui/PageHeader'
import { colors, spacing, radius, typography } from '../../theme/tokens'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

const DECISION_OPTIONS = [
  { value: 'SELECTED', label: 'Selected', icon: CheckCircle, bg: colors.success[50], fg: colors.success[700], border: colors.success[200], activeBg: colors.success[100] },
  { value: 'REJECTED', label: 'Rejected', icon: XCircle, bg: colors.danger[50], fg: colors.danger[600], border: colors.danger[200], activeBg: colors.danger[100] },
  { value: 'ON_HOLD', label: 'On Hold', icon: Clock, bg: colors.warning[50], fg: colors.warning[700], border: colors.warning[200], activeBg: colors.warning[100] },
]

export default function InterviewEvaluation({ user }) {
  const { id: interviewId } = useParams()
  const navigate = useNavigate()
  const [interview, setInterview] = useState(null)
  const [feedbacks, setFeedbacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [rating, setRating] = useState(5)
  const [notes, setNotes] = useState('')
  const [decision, setDecision] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [interviewRes, feedbackRes] = await Promise.all([
          interviewService.get(interviewId),
          interviewService.getFeedback(interviewId),
        ])
        setInterview(interviewRes.interview)
        setFeedbacks(feedbackRes.feedbacks || [])
      } catch (err) {
        console.error('Failed to fetch interview data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [interviewId])

  const handleSubmitFeedback = async (e) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      await interviewService.submitFeedback(interviewId, { rating, notes })
      const res = await interviewService.getFeedback(interviewId)
      setFeedbacks(res.feedbacks || [])
      setNotes('')
      setRating(5)
    } catch (err) {
      console.error('Failed to submit feedback:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitResult = async () => {
    if (!decision) return
    try {
      setSubmitting(true)
      await interviewService.submitResult(interviewId, { decision, notes })
      navigate('/interviews')
    } catch (err) {
      console.error('Failed to submit result:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: spacing[20] }}>
        <Spinner text="Loading interview..." />
      </div>
    )
  }

  if (!interview) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Interview not found"
        description="The interview you're looking for doesn't exist or you don't have access."
        action={<Button variant="primary" onClick={() => navigate('/interviews')}>Back to Interviews</Button>}
      />
    )
  }

  const isInterviewer = user?.role === 'TRAINER' || user?.role === 'ADMIN'
  const canFeedback = isInterviewer && interview.status === 'COMPLETED'
  const canDecide = canFeedback && !interview.result

  const ratingColor = rating <= 3 ? colors.danger[600] : rating <= 6 ? colors.warning[600] : colors.success[600]
  const ratingLabel = rating <= 3 ? 'Poor' : rating <= 6 ? 'Average' : 'Excellent'

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <PageHeader
        title="Interview Evaluation"
        subtitle={interview.title || `Interview #${interviewId}`}
        backLink="/interviews"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[5], maxWidth: 720 }}>
        {/* Interview Summary */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardBody>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary, marginBottom: spacing[4], fontFamily: typography.fontFamily }}>
                Interview Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing[4] }}>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: colors.text.muted }}>Type</span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>{interview.type}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: colors.text.muted }}>Status</span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>{interview.status}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: colors.text.muted }}>Candidate</span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>{interview.candidate?.name || '—'}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: colors.text.muted }}>Scheduled</span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>
                    {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Feedback Form */}
        {canFeedback && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardBody>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary, marginBottom: spacing[4], fontFamily: typography.fontFamily }}>
                  Submit Feedback
                </h3>
                <form onSubmit={handleSubmitFeedback} style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
                  {/* Rating */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary, marginBottom: spacing[2], fontFamily: typography.fontFamily }}>
                      Rating (1–10)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[4] }}>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={rating}
                        onChange={(e) => setRating(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: colors.primary[600], height: 6 }}
                      />
                      <div style={{ textAlign: 'center', minWidth: 48 }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: ratingColor, fontFamily: typography.fontFamily }}>
                          {rating}
                        </span>
                        <div style={{ fontSize: '0.6875rem', color: colors.text.muted, marginTop: 2 }}>{ratingLabel}</div>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <Textarea
                    label="Notes"
                    placeholder="Add interview notes, observations, strengths, areas for improvement..."
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />

                  <div>
                    <Button type="submit" variant="primary" loading={submitting}>
                      Submit Feedback
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {/* Decision */}
        {canDecide && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardBody>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary, marginBottom: spacing[4], fontFamily: typography.fontFamily }}>
                  Final Decision
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing[3], marginBottom: spacing[4] }}>
                  {DECISION_OPTIONS.map(opt => {
                    const Icon = opt.icon
                    const isActive = decision === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDecision(opt.value)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing[2],
                          padding: `${spacing[4]} ${spacing[3]}`, borderRadius: radius.lg, cursor: 'pointer',
                          border: `1.5px solid ${isActive ? opt.fg : colors.border.default}`,
                          background: isActive ? opt.activeBg : colors.surface.primary,
                          color: isActive ? opt.fg : colors.text.secondary,
                          transition: 'all 150ms ease',
                          fontFamily: typography.fontFamily,
                        }}
                      >
                        <Icon size={20} />
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
                <Button
                  variant="primary"
                  onClick={handleSubmitResult}
                  disabled={!decision || submitting}
                  loading={submitting}
                  style={{ width: '100%' }}
                >
                  Submit Final Decision
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {/* Existing Result */}
        {interview.result && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardBody>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary, marginBottom: spacing[3], fontFamily: typography.fontFamily }}>
                  Final Decision
                </h3>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: spacing[2],
                  padding: `${spacing[2]} ${spacing[4]}`, borderRadius: radius.md,
                  background: interview.result.decision === 'SELECTED' ? colors.success[50] : interview.result.decision === 'REJECTED' ? colors.danger[50] : colors.warning[50],
                  color: interview.result.decision === 'SELECTED' ? colors.success[700] : interview.result.decision === 'REJECTED' ? colors.danger[600] : colors.warning[700],
                  fontWeight: 700, fontSize: '0.9375rem',
                }}>
                  {interview.result.decision === 'SELECTED' ? <CheckCircle size={18} /> : interview.result.decision === 'REJECTED' ? <XCircle size={18} /> : <Clock size={18} />}
                  {interview.result.decision}
                </div>
                <p style={{ fontSize: '0.75rem', color: colors.text.muted, marginTop: spacing[2] }}>
                  Decided on {new Date(interview.result.decided_at).toLocaleString('en-IN')}
                </p>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {/* Previous Feedbacks */}
        {feedbacks.length > 0 && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardBody>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text.primary, marginBottom: spacing[4], fontFamily: typography.fontFamily }}>
                  Feedback ({feedbacks.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
                  {feedbacks.map((fb) => (
                    <div key={fb.id} style={{
                      padding: spacing[4], borderRadius: radius.lg,
                      background: colors.surface.secondary, border: `1px solid ${colors.border.light}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[2] }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.text.primary }}>
                          {fb.interviewer?.name || 'Interviewer'}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.875rem', fontWeight: 700, color: colors.primary[600] }}>
                          <Star size={14} fill={colors.primary[600]} />
                          {fb.rating}/10
                        </span>
                      </div>
                      {fb.notes && (
                        <p style={{ fontSize: '0.8125rem', color: colors.text.secondary, lineHeight: 1.6 }}>{fb.notes}</p>
                      )}
                      <p style={{ fontSize: '0.6875rem', color: colors.text.muted, marginTop: spacing[2] }}>
                        {new Date(fb.created_at).toLocaleString('en-IN')}
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
