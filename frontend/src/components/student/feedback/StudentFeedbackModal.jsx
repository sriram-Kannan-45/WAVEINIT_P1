import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, MessageSquare, Shield, CheckCircle2, X } from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function StudentFeedbackModal({ isOpen, onClose, enrollments = [], user, onSuccess }) {
  const { error: showError, success: showSuccess } = useToast()

  const [courseId, setCourseId] = useState('')
  const [courseRating, setCourseRating] = useState(5)
  const [trainerRating, setTrainerRating] = useState(5)
  const [subjectRating, setSubjectRating] = useState(5)
  const [comments, setComments] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!courseId) {
      showError?.('Please select a course to review')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetchWithTimeout(API.FEEDBACK_SYSTEM.SUBMIT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(user) },
        body: JSON.stringify({
          courseId,
          feedbackType: 'COURSE',
          courseRating,
          trainerRating,
          subjectRating,
          comments,
          anonymous,
        })
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        showSuccess?.('Thank you! Your feedback was submitted successfully.')
        onSuccess?.()
        onClose()
      } else {
        throw new Error(data.error || 'Failed to submit feedback')
      }
    } catch (err) {
      console.error('Feedback submit error:', err.message)
      showError?.(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const renderStars = (value, onChange) => {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              color: star <= value ? '#F59E0B' : '#E2E8F0',
              transition: 'color 120ms',
            }}
          >
            <Star size={24} fill={star <= value ? '#F59E0B' : 'none'} />
          </button>
        ))}
        <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginLeft: 8 }}>
          {value} / 5
        </span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 16
    }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 520,
          padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          position: 'relative'
        }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: 18, top: 18, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ padding: 8, borderRadius: 10, background: '#FEF3C7', color: '#D97706' }}>
            <MessageSquare size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Course & Instructor Feedback
            </h3>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
              Help us improve learning quality with your honest evaluation.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Select Course */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
              Select Course *
            </label>
            <select
              required
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
            >
              <option value="">Choose an enrolled course...</option>
              {enrollments.map(e => (
                <option key={e.courseId || e.id} value={e.courseId || e.id}>
                  {e.course?.title || e.training?.title || `Course #${e.courseId}`}
                </option>
              ))}
            </select>
          </div>

          {/* Course Rating */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
              Course Curriculum & Content Quality
            </label>
            {renderStars(courseRating, setCourseRating)}
          </div>

          {/* Trainer Rating */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
              Instructor Teaching & Support
            </label>
            {renderStars(trainerRating, setTrainerRating)}
          </div>

          {/* Subject Rating */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
              Practical Exercises & Labs
            </label>
            {renderStars(subjectRating, setSubjectRating)}
          </div>

          {/* Comments */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
              Detailed Feedback & Suggestions (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="What did you like best? What could be improved?"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, resize: 'vertical' }}
            />
          </div>

          {/* Anonymous Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0'
          }}>
            <input
              type="checkbox"
              id="anon-check"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="anon-check" style={{ fontSize: 12.5, color: '#334155', cursor: 'pointer', flex: 1 }}>
              <b>Submit Anonymously</b>
              <div style={{ fontSize: 11, color: '#64748B' }}>Your name and email will be concealed from the instructor.</div>
            </label>
            <Shield size={16} color="#64748B" />
          </div>

          {/* Submit Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', opacity: submitting ? 0.7 : 1
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
