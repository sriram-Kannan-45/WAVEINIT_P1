import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Briefcase, MapPin, Calendar } from 'lucide-react';

const TYPE_LABELS = {
  FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract',
  INTERNSHIP: 'Internship', FREELANCE: 'Freelance', SELF_EMPLOYED: 'Self-employed',
};

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ExperienceTimeline({ experiences, isOwn, onAdd, onEdit, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 }}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Briefcase size={16} style={{ color: '#2563EB' }} />
          </div>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#111827',
            fontFamily: "'Poppins', sans-serif", margin: 0,
          }}>
            Experience
          </h3>
        </div>
        {isOwn && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAdd}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
              border: '1px solid #BBF7D0', color: '#16A34A',
              cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Add
          </motion.button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {(experiences || []).map((exp, i) => (
          <motion.div
            key={exp.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            style={{ display: 'flex', gap: 16 }}
          >
            {/* Timeline line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: exp.currentlyWorking
                  ? 'linear-gradient(135deg, #16A34A, #22C55E)'
                  : '#E5E7EB',
                border: exp.currentlyWorking ? 'none' : '2px solid #D1D5DB',
                flexShrink: 0, marginTop: 4,
                boxShadow: exp.currentlyWorking ? '0 0 0 4px rgba(34,197,94,0.15)' : 'none',
              }} />
              {i < (experiences?.length || 0) - 1 && (
                <div style={{
                  width: 2, flex: 1, minHeight: 20,
                  background: 'linear-gradient(180deg, #E5E7EB, #F1F5F9)',
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: 20, minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
                padding: 16, borderRadius: 14,
                border: '1px solid #F1F5F9', background: '#FAFBFC',
                transition: 'all 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#F1F5F9'; e.currentTarget.style.background = '#FAFBFC'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>
                      {exp.role}
                    </h4>
                    {exp.currentlyWorking && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
                        color: '#16A34A', border: '1px solid #BBF7D0',
                      }}>
                        Current
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
                      {exp.company}
                    </span>
                    {exp.location && (
                      <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <MapPin size={10} /> {exp.location}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94A3B8' }}>
                    <Calendar size={11} />
                    {formatDate(exp.startDate)} — {exp.currentlyWorking ? 'Present' : formatDate(exp.endDate)}
                    {exp.employmentType && (
                      <span style={{
                        padding: '2px 7px', borderRadius: 5,
                        background: '#F1F5F9', fontSize: 10, fontWeight: 500,
                        color: '#64748B',
                      }}>
                        {TYPE_LABELS[exp.employmentType] || exp.employmentType}
                      </span>
                    )}
                  </div>
                  {exp.description && (
                    <p style={{
                      fontSize: 13, color: '#64748B', lineHeight: 1.6,
                      margin: '8px 0 0', whiteSpace: 'pre-line',
                    }}>
                      {exp.description}
                    </p>
                  )}
                </div>
                {isOwn && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <motion.button
                      whileHover={{ scale: 1.1, backgroundColor: '#F0FDF4' }}
                      onClick={() => onEdit(exp)}
                      style={{
                        width: 28, height: 28, borderRadius: 6, border: 'none',
                        background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Pencil size={12} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1, backgroundColor: '#FEF2F2' }}
                      onClick={() => onDelete(exp.id)}
                      style={{
                        width: 28, height: 28, borderRadius: 6, border: 'none',
                        background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={12} />
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {(!experiences || experiences.length === 0) && (
        <div style={{
          textAlign: 'center', padding: '28px 20px',
          background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
          borderRadius: 12, border: '1px dashed #E5E7EB',
        }}>
          <Briefcase size={24} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            No experience added yet.
          </p>
        </div>
      )}
    </motion.div>
  );
}
