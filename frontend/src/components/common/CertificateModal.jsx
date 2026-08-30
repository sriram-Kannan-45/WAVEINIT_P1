import React from 'react'
import { motion } from 'framer-motion'
import { Award, Printer, X, ShieldCheck, CheckCircle2 } from 'lucide-react'

export default function CertificateModal({ isOpen, onClose, certificate, studentName }) {
  if (!isOpen || !certificate) return null

  const handlePrint = () => {
    window.print()
  }

  const certCode = certificate.certificateCode || 'WAVE-CERT-2026'
  const courseTitle = certificate.title || certificate.courseTitle || 'Advanced Professional Specialization'
  const issueDate = certificate.issuedAt
    ? new Date(certificate.issuedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      padding: 16
    }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 740,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column'
        }}
      >
        {/* Modal Top Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
            <Award size={18} color="#D97706" /> Verified Certificate of Completion
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, border: 'none',
                background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Printer size={14} /> Print Certificate
            </button>
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Certificate Canvas */}
        <div
          id="printable-certificate"
          style={{
            padding: '40px 48px',
            background: 'linear-gradient(135deg, #FFFCF5 0%, #FFFFFF 100%)',
            border: '8px solid #F3E8D2',
            margin: '16px',
            borderRadius: 12,
            textAlign: 'center',
            position: 'relative'
          }}
        >
          {/* Decorative Corner Ornaments */}
          <div style={{ position: 'absolute', top: 12, left: 12, width: 24, height: 24, borderTop: '2px solid #D97706', borderLeft: '2px solid #D97706' }} />
          <div style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderTop: '2px solid #D97706', borderRight: '2px solid #D97706' }} />
          <div style={{ position: 'absolute', bottom: 12, left: 12, width: 24, height: 24, borderBottom: '2px solid #D97706', borderLeft: '2px solid #D97706' }} />
          <div style={{ position: 'absolute', bottom: 12, right: 12, width: 24, height: 24, borderBottom: '2px solid #D97706', borderRight: '2px solid #D97706' }} />

          {/* Header */}
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: '#D97706', textTransform: 'uppercase', marginBottom: 6 }}>
            WAVE INIT LEARNING SYSTEMS
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', margin: '0 0 10px', fontFamily: "'Outfit', 'Poppins', sans-serif" }}>
            CERTIFICATE OF COMPLETION
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic', margin: '0 0 16px' }}>
            This officially certifies that
          </p>

          {/* Student Name */}
          <div style={{
            fontSize: 24, fontWeight: 800, color: '#1E3A8A',
            borderBottom: '2px solid #D97706', display: 'inline-block',
            padding: '0 24px 6px', margin: '0 auto 16px',
            fontFamily: "'Outfit', sans-serif"
          }}>
            {studentName || 'Learner'}
          </div>

          <p style={{ fontSize: 13, color: '#475569', maxWidth: 500, margin: '0 auto 16px', lineHeight: 1.6 }}>
            has successfully fulfilled all curriculum requirements, assessments, practical projects, and attendance milestones for
          </p>

          {/* Course Name */}
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 28 }}>
            {courseTitle}
          </div>

          {/* Footer Details */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Issued Date</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{issueDate}</div>
            </div>

            {/* Official Seal */}
            <div style={{
              width: 58, height: 58, borderRadius: '50%',
              border: '2px dashed #D97706', background: '#FFFBEB',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: '#D97706', fontSize: 9, fontWeight: 800, textTransform: 'uppercase'
            }}>
              <ShieldCheck size={20} />
              <span>Verified</span>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Certificate ID</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', fontFamily: 'monospace' }}>
                {certCode}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
