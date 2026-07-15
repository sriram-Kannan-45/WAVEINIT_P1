import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Clock, MessageSquare, X, Star } from 'lucide-react'
import { useState } from 'react'
import { Button, Badge } from '../../ui'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

function StarPicker({ value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      {[1, 2, 3, 4, 5].map((s) => {
        const active = s <= value
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, color: active ? '#F79009' : 'var(--neutral-200)',
              transition: 'transform 150ms, color 150ms',
            }}
          >
            <Star size={26} fill={active ? '#F79009' : 'transparent'} strokeWidth={1.6} />
          </button>
        )
      })}
    </div>
  )
}

export default function FeedbackSection({
  enrollments = [],
  feedbacks = [],
  loading = false,
  onSubmit,
  fetchQuestions,
}) {
  const [modal, setModal] = useState(null)
  const [questions, setQuestions] = useState([])
  const [fbForm, setFbForm] = useState({ trainerRating: 0, subjectRating: 0, comments: '', anonymous: false })
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const hasFeedback = (id) => feedbacks.some((f) => f.trainingId === id)

  const openModal = async (enrollment) => {
    setModal(enrollment)
    setFbForm({ trainerRating: 0, subjectRating: 0, comments: '', anonymous: false })
    setAnswers({})
    if (fetchQuestions) {
      const qs = await fetchQuestions(enrollment.trainingId)
      setQuestions(qs || [])
    }
  }
  const closeModal = () => { setModal(null); setQuestions([]) }

  const submit = async (e) => {
    e.preventDefault()
    if (!fbForm.trainerRating || !fbForm.subjectRating) return
    setSubmitting(true)
    try {
      const surveyAnswers = Object.entries(answers).map(([qid, val]) => {
        const q = questions.find((x) => x.id === parseInt(qid))
        return {
          questionId: parseInt(qid),
          answerText: q?.questionType !== 'RATING' ? val : null,
          answerRating: q?.questionType === 'RATING' ? parseInt(val) : null,
        }
      })
      await onSubmit?.({ enrollment: modal, fbForm, surveyAnswers })
      closeModal()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--neutral-900)', letterSpacing: '-0.03em', margin: 0, marginBottom: 4 }}>Share Course Feedback</h2>
        <p style={{ fontSize: 14, color: 'var(--neutral-500)', margin: 0 }}>Rate your experience to help instructors improve</p>
      </div>

      {!loading && enrollments.length === 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card__body">
            <div className="empty-state">
              <div className="empty-state__icon" style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}>
                <MessageSquare size={28} />
              </div>
              <h3 className="empty-state__title">No courses to review</h3>
              <p className="empty-state__description">Join a course first; you can review it once it has started.</p>
            </div>
          </div>
        </div>
      )}

      {enrollments.length > 0 && (
        <div className="enterprise-card" style={{ overflow: 'hidden' }}>
          {enrollments.map((e, i) => {
            const started = new Date() >= new Date(e.startDate)
            const submitted = hasFeedback(e.trainingId)
            return (
              <div
                key={e.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
                  padding: 'var(--space-4) var(--space-6)',
                  borderBottom: i < enrollments.length - 1 ? '1px solid var(--neutral-100)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--neutral-900)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.trainingTitle}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--neutral-400)' }}>
                    {e.trainerName || 'TBA'} &middot; started {fmtDate(e.startDate)}
                  </div>
                </div>
                {submitted ? (
                  <span className="badge badge--success"><CheckCircle size={11} /> Submitted</span>
                ) : !started ? (
                  <span className="badge badge--neutral"><Clock size={11} /> Not started</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => openModal(e)}>
                    <MessageSquare size={12} /> Give feedback
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Feedback modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeModal}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)', zIndex: 1100,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
            }}
          >
            <motion.form
              onSubmit={submit}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              className="enterprise-card"
              style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', overflow: 'auto' }}
            >
              <div className="enterprise-card__header">
                <div>
                  <h3 className="enterprise-card__title">Course feedback</h3>
                  <p style={{ fontSize: 13, color: 'var(--neutral-400)', marginTop: 2 }}>{modal.trainingTitle}</p>
                </div>
                <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 4, borderRadius: 'var(--radius-md)' }} aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="enterprise-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--neutral-400)' }}>Instructor rating</label>
                  <StarPicker value={fbForm.trainerRating} onChange={(v) => setFbForm((p) => ({ ...p, trainerRating: v }))} ariaLabel="Instructor rating" />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--neutral-400)' }}>Subject rating</label>
                  <StarPicker value={fbForm.subjectRating} onChange={(v) => setFbForm((p) => ({ ...p, subjectRating: v }))} ariaLabel="Subject rating" />
                </div>
                <div className="field-group">
                  <label className="field-label">Comments (optional)</label>
                  <textarea
                    rows={3}
                    placeholder="What did you enjoy? Anything to improve?"
                    value={fbForm.comments}
                    onChange={(e) => setFbForm((p) => ({ ...p, comments: e.target.value }))}
                    className="field-input"
                    style={{ paddingLeft: 14, minHeight: 80, resize: 'vertical' }}
                  />
                </div>

                {questions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {questions.map((q) => (
                      <div key={q.id} className="field-group">
                        <label className="field-label">{q.questionText}</label>
                        {q.questionType === 'RATING' ? (
                          <StarPicker
                            value={parseInt(answers[q.id]) || 0}
                            onChange={(v) => setAnswers((p) => ({ ...p, [q.id]: v }))}
                            ariaLabel={q.questionText}
                          />
                        ) : q.questionType === 'MULTIPLE_CHOICE' && q.options ? (
                          <select
                            className="field-input"
                            style={{ paddingLeft: 14 }}
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                          >
                            <option value="">Select...</option>
                            {q.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="field-input"
                            style={{ paddingLeft: 14 }}
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 13, color: 'var(--neutral-500)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={fbForm.anonymous}
                    onChange={(e) => setFbForm((p) => ({ ...p, anonymous: e.target.checked }))}
                    style={{ width: 'auto', height: 'auto', cursor: 'pointer' }}
                  />
                  Submit anonymously
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--neutral-100)' }}>
                <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting || !fbForm.trainerRating || !fbForm.subjectRating}
                  loading={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit feedback'}
                </Button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
