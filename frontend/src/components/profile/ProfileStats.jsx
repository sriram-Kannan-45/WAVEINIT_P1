import { motion } from 'framer-motion';
import {
  BookOpen, Users, ClipboardCheck, BarChart3, Award, GraduationCap,
  FileCheck, Star,
} from 'lucide-react';

const TRAINER_STATS = [
  { key: 'coursesCreated', label: 'Courses Created', icon: BookOpen, gradient: 'linear-gradient(135deg, #059669, #10B981)' },
  { key: 'studentsTrained', label: 'Students Trained', icon: Users, gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)' },
  { key: 'assessments', label: 'Assessments', icon: ClipboardCheck, gradient: 'linear-gradient(135deg, #7C3AED, #A78BFA)' },
  { key: 'averageRating', label: 'Avg Rating', icon: Star, gradient: 'linear-gradient(135deg, #D97706, #F59E0B)' },
  { key: 'certificatesIssued', label: 'Certs Issued', icon: Award, gradient: 'linear-gradient(135deg, #059669, #34D399)' },
  { key: 'completionRate', label: 'Completion Rate', icon: BarChart3, gradient: 'linear-gradient(135deg, #BE185D, #EC4899)' },
];

const PARTICIPANT_STATS = [
  { key: 'coursesEnrolled', label: 'Enrolled', icon: BookOpen, gradient: 'linear-gradient(135deg, #059669, #10B981)' },
  { key: 'completedCourses', label: 'Completed', icon: GraduationCap, gradient: 'linear-gradient(135deg, #16A34A, #4ADE80)' },
  { key: 'assignmentsSubmitted', label: 'Assignments', icon: FileCheck, gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)' },
  { key: 'quizAverage', label: 'Quiz Average', icon: BarChart3, gradient: 'linear-gradient(135deg, #7C3AED, #A78BFA)' },
  { key: 'certificatesEarned', label: 'Certificates', icon: Award, gradient: 'linear-gradient(135deg, #D97706, #F59E0B)' },
  { key: 'studyHours', label: 'Study Hours', icon: Star, gradient: 'linear-gradient(135deg, #BE185D, #EC4899)' },
];

const cardStyle = {
  background: 'rgba(255,255,255,0.7)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(229,231,235,0.8)',
  borderRadius: 16,
  padding: '20px 18px',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  cursor: 'default',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
};

export default function ProfileStats({ stats, role }) {
  const statDefs = role === 'TRAINER' ? TRAINER_STATS : PARTICIPANT_STATS;

  return (
    <div
      className="profile-stats-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 12,
        marginTop: 20,
      }}
    >
      {statDefs.map((def, i) => {
        const Icon = def.icon;
        const val = stats?.[def.key];
        const displayVal = typeof val === 'number'
          ? (def.key === 'averageRating' || def.key === 'quizAverage'
              ? (val > 0 ? Number(val).toFixed(1) : '0.0')
              : val)
          : '—';

        return (
          <motion.div
            key={def.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
            whileHover={{ y: -4, boxShadow: '0 8px 28px rgba(0,0,0,0.08)' }}
            style={cardStyle}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: def.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}>
              <Icon size={18} style={{ color: '#fff' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: '#94A3B8',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                marginBottom: 2,
              }}>
                {def.label}
              </div>
              <div style={{
                fontSize: 22, fontWeight: 700, color: '#111827',
                fontFamily: "'Poppins', sans-serif",
                lineHeight: 1.1,
              }}>
                {displayVal}
              </div>
            </div>
          </motion.div>
        );
      })}

      <style>{`
        @media (max-width: 1024px) {
          .profile-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .profile-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
