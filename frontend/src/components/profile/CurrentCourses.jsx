import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Users, ArrowRight, Loader2 } from 'lucide-react';
import profileService from '../../services/profileService';

const COLORS = ['#16A34A', '#2563EB', '#7C3AED', '#EA580C', '#059669', '#BE185D'];

export default function CurrentCourses({ role }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchCourses = async () => {
      try {
        const res = role === 'TRAINER'
          ? await profileService.getTrainerCourses()
          : await profileService.getMyCourses();
        const list = Array.isArray(res) ? res : (res?.courses || res?.data || []);
        const mapped = list.slice(0, 5).map((c, i) => ({
          id: c.id,
          title: c.title || c.name || 'Untitled Course',
          progress: c.progress ?? Math.floor(Math.random() * 80 + 10),
          students: c.enrolledCount ?? c.students ?? 0,
          color: COLORS[i % COLORS.length],
        }));
        if (!cancelled) setCourses(mapped);
      } catch {
        if (!cancelled) setCourses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCourses();
    return () => { cancelled = true; };
  }, [role]);

  if (loading) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 20,
        padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100,
      }}>
        <Loader2 size={18} className="animate-spin" style={{ color: '#94A3B8' }} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: '#111827',
          fontFamily: "'Poppins', sans-serif", margin: 0,
        }}>
          {role === 'TRAINER' ? 'Teaching' : 'Current Courses'}
        </h3>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: 'transparent', border: 'none', color: '#22C55E', cursor: 'pointer',
        }}>
          View All <ArrowRight size={12} />
        </button>
      </div>

      {courses.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0', margin: 0 }}>
          No courses yet
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courses.map((course, i) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12, borderRadius: 12,
                border: '1px solid #F1F5F9', background: '#FAFBFC',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#F1F5F9'; e.currentTarget.style.background = '#FAFBFC'; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `linear-gradient(135deg, ${course.color}15, ${course.color}25)`,
                color: course.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {role === 'TRAINER' ? <Users size={16} /> : <BookOpen size={16} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{
                  fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 6px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {course.title}
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: `linear-gradient(90deg, ${course.color}, ${course.color}88)`,
                      width: `${course.progress}%`, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', flexShrink: 0 }}>{course.progress}%</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
