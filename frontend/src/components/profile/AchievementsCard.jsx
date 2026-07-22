import { motion } from 'framer-motion';
import { Trophy, Star, Flame, Target, Award, TrendingUp, BookOpen, GraduationCap, Users } from 'lucide-react';

function computeBadges(role, stats) {
  if (role === 'TRAINER') {
    return [
      { icon: Star, label: 'Top Trainer', unlocked: (stats.averageRating || 0) >= 4.5, gradient: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)', color: '#D97706' },
      { icon: Award, label: 'Course Champion', unlocked: (stats.coursesCreated || 0) >= 1, gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', color: '#7C3AED' },
      { icon: TrendingUp, label: 'Great Feedback', unlocked: (stats.averageRating || 0) >= 4.0, gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#059669' },
      { icon: Target, label: '10+ Assessments', unlocked: (stats.assessments || 0) >= 10, gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', color: '#2563EB' },
      { icon: Users, label: '50+ Students', unlocked: (stats.studentsTrained || 0) >= 50, gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', color: '#EA580C' },
      { icon: Trophy, label: '25 Certs Issued', unlocked: (stats.certificatesIssued || 0) >= 25, gradient: 'linear-gradient(135deg, #FDF2F8, #FCE7F3)', color: '#BE185D' },
    ];
  }
  return [
    { icon: Flame, label: 'Learning Streak', unlocked: (stats.studyHours || 0) >= 10, gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', color: '#EA580C' },
    { icon: BookOpen, label: 'First Course', unlocked: (stats.coursesEnrolled || 0) >= 1, gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', color: '#7C3AED' },
    { icon: GraduationCap, label: 'Course Complete', unlocked: (stats.completedCourses || 0) >= 1, gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#059669' },
    { icon: Star, label: 'Top Learner', unlocked: (stats.quizAverage || 0) >= 80, gradient: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)', color: '#D97706' },
    { icon: Target, label: '10+ Quizzes', unlocked: (stats.assignmentsSubmitted || 0) >= 10, gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', color: '#2563EB' },
    { icon: Trophy, label: 'Certificate Earner', unlocked: (stats.certificatesEarned || 0) >= 1, gradient: 'linear-gradient(135deg, #FDF2F8, #FCE7F3)', color: '#BE185D' },
  ];
}

export default function AchievementsCard({ role, stats }) {
  const badges = computeBadges(role, stats || {});
  const unlockedCount = badges.filter(b => b.unlocked).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
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
          fontFamily: "'Poppins', sans-serif", margin: 0,
        }}>
          Achievements
        </h3>
        <span style={{
          fontSize: 12, fontWeight: 600, color: '#16A34A',
          background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
          padding: '4px 10px', borderRadius: 8,
        }}>
          {unlockedCount}/{badges.length}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {badges.map((badge, i) => {
          const Icon = badge.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.03 }}
              whileHover={badge.unlocked ? { scale: 1.05, y: -2 } : {}}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 4px', borderRadius: 12,
                background: badge.unlocked ? badge.gradient : '#F8FAFC',
                border: `1px solid ${badge.unlocked ? 'transparent' : '#E5E7EB'}`,
                opacity: badge.unlocked ? 1 : 0.4,
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: badge.unlocked ? badge.gradient : '#F1F5F9',
                color: badge.unlocked ? badge.color : '#94A3B8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: badge.unlocked ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              }}>
                <Icon size={16} />
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, color: badge.unlocked ? '#334155' : '#94A3B8',
                textAlign: 'center', lineHeight: 1.3,
              }}>
                {badge.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
