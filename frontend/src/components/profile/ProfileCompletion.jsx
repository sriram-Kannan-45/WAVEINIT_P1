import { motion } from 'framer-motion';
import { CheckCircle, Circle } from 'lucide-react';

const TRAINER_FIELDS = [
  { key: 'bannerImage', label: 'Banner', check: (p) => !!p?.bannerImage },
  { key: 'profileImage', label: 'Profile Photo', check: (p) => !!(p?.profileImage || p?.user?.profilePic) },
  { key: 'about', label: 'About', check: (p) => !!p?.about },
  { key: '_skills', label: 'Skills', check: (p) => (p?.skills || []).length > 0 },
  { key: '_experience', label: 'Experience', check: (p) => (p?.experiences || []).length > 0 },
  { key: '_education', label: 'Education', check: (p) => (p?.educations || []).length > 0 },
  { key: 'resume', label: 'Resume', check: (p) => !!p?.resume },
  { key: '_certificates', label: 'Certificates', check: (p) => (p?.certificates || []).length > 0 },
];

const PARTICIPANT_FIELDS = [
  { key: 'bannerImage', label: 'Banner', check: (p) => !!p?.bannerImage },
  { key: 'profileImage', label: 'Profile Photo', check: (p) => !!(p?.profileImage || p?.user?.profilePic) },
  { key: 'about', label: 'About', check: (p) => !!p?.about },
  { key: '_skills', label: 'Skills', check: (p) => (p?.skills || []).length > 0 },
  { key: '_experience', label: 'Experience', check: (p) => (p?.experiences || []).length > 0 },
  { key: '_education', label: 'Education', check: (p) => (p?.educations || []).length > 0 },
  { key: 'resume', label: 'Resume', check: (p) => !!p?.resume },
  { key: '_certificates', label: 'Certificates', check: (p) => (p?.certificates || []).length > 0 },
];

export default function ProfileCompletion({ completion, profile, role }) {
  const fields = role === 'TRAINER' ? TRAINER_FIELDS : PARTICIPANT_FIELDS;
  const completedCount = fields.filter(f => f.check(profile)).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: '#111827',
          fontFamily: "'Poppins', sans-serif",
          margin: 0,
        }}>
          Profile Completion
        </h3>
        <span style={{
          fontSize: 12, fontWeight: 600, color: '#22C55E',
          background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
          padding: '4px 10px', borderRadius: 8,
        }}>
          {completedCount}/{fields.length}
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginBottom: 6,
        }}>
          <span style={{ fontSize: 12, color: '#64748B' }}>Overall Progress</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22C55E', fontFamily: "'Poppins', sans-serif" }}>
            {completion || 0}%
          </span>
        </div>
        <div style={{
          height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${completion || 0}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
            style={{
              height: '100%', borderRadius: 4,
              background: 'linear-gradient(90deg, #16A34A, #22C55E, #4ADE80)',
            }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fields.map((f, i) => {
          const done = f.check(profile);
          return (
            <motion.div
              key={f.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.3 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 10,
                background: done ? 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' : '#F8FAFC',
                border: `1px solid ${done ? '#BBF7D0' : '#F1F5F9'}`,
                transition: 'all 0.2s',
              }}
            >
              {done ? (
                <CheckCircle size={16} style={{ color: '#22C55E', flexShrink: 0 }} />
              ) : (
                <Circle size={16} style={{ color: '#CBD5E1', flexShrink: 0 }} />
              )}
              <span style={{
                fontSize: 13, fontWeight: done ? 600 : 400,
                color: done ? '#111827' : '#94A3B8',
              }}>
                {f.label}
              </span>
              {done && (
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                  color: '#22C55E', background: '#DCFCE7',
                  padding: '2px 6px', borderRadius: 4,
                }}>
                  Done
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
