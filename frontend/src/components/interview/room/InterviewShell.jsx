/**
 * InterviewShell Component
 * Standard page container for all Interview Room stages.
 * Fits seamlessly inside the WAVE INIT LMS Layout.
 */
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

export default function InterviewShell({
  children,
  headerRight,
  step,
  status,
  interviewId,
  title = 'Interview Room',
  subtitle,
  statusBadge = 'Scheduled',
}) {
  const navigate = useNavigate()

  return (
    <div className="reg-admin interview-shell-root">
      {/* LMS Breadcrumb & Page Header */}
      <div className="interview-shell-header">
        {/* Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 6 }}>
          <button
            onClick={() => navigate('/interviews')}
            style={{ background: 'none', border: 'none', padding: 0, color: '#16A34A', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
          >
            Interviews
          </button>
          <ChevronRight size={14} color="#94a3b8" />
          <span style={{ color: '#0f172a', fontWeight: 600 }}>
            Interview #{interviewId || 'Details'}
          </span>
        </div>

        {/* Page Title & Badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="reg-admin-title" style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                {title}
              </h1>
              {statusBadge && (
                <span className="reg-admin-status" style={{
                  background: statusBadge === 'IN_PROGRESS' || statusBadge === 'In Progress' ? '#fef3c7' : '#dcfce7',
                  color: statusBadge === 'IN_PROGRESS' || statusBadge === 'In Progress' ? '#d97706' : '#15803D',
                  borderColor: statusBadge === 'IN_PROGRESS' || statusBadge === 'In Progress' ? '#fcd34d' : '#bbf7d0',
                  fontWeight: 600,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 6,
                }}>
                  {statusBadge?.replace('_', ' ')}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="reg-admin-subtitle" style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step && (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                background: '#f1f5f9',
                padding: '3px 8px',
                borderRadius: 20,
                border: '1px solid #e2e8f0'
              }}>
                {step}
              </span>
            )}
            {status && (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#15803D',
                background: '#f0fdf4',
                padding: '3px 8px',
                borderRadius: 20,
                border: '1px solid #bbf7d0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} />
                {status}
              </span>
            )}
            {headerRight}
          </div>
        </div>
      </div>

      {/* Main Page Area */}
      <motion.div
        className="interview-shell-body"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {children}
      </motion.div>
    </div>
  )
}
