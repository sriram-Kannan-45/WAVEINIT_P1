import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, ClipboardCheck, Upload, Share2, QrCode, Users, Award,
  GraduationCap, FolderGit2, ArrowRight, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const QUICK_ACTIONS = [
  { key: 'course', label: 'Create Course', icon: BookOpen, gradient: 'linear-gradient(135deg, #16A34A, #22C55E)', color: '#fff' },
  { key: 'assessment', label: 'Create Assessment', icon: ClipboardCheck, gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' },
  { key: 'resume', label: 'Upload Resume', icon: Upload, gradient: 'linear-gradient(135deg, #7C3AED, #A78BFA)', color: '#fff' },
  { key: 'share', label: 'Share Profile', icon: Share2, gradient: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff' },
];

const COLORS = ['#16A34A', '#2563EB', '#7C3AED', '#EA580C', '#059669', '#BE185D'];

export default function QuickActions({ role }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const profileService = (await import('../../services/profileService')).default;
        const res = role === 'TRAINER'
          ? await profileService.getTrainerCourses()
          : await profileService.getMyCourses();
        const list = Array.isArray(res) ? res : (res?.courses || res?.data || []);
        const mapped = list.slice(0, 3).map((c, i) => ({
          id: c.id,
          title: c.title || c.name || 'Untitled Course',
          progress: c.progress ?? Math.floor(Math.random() * 80 + 10),
          color: COLORS[i % COLORS.length],
        }));
        if (!cancelled) setCourses(mapped);
      } catch {
        if (!cancelled) setCourses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [role]);

  const handleAction = (key) => {
    toast.success(`${QUICK_ACTIONS.find(a => a.key === key)?.label} coming soon`);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    toast.success('Profile link copied!');
  };

  return (
    <div style={{
      position: 'sticky',
      top: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      {/* Quick Actions */}
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
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: '#111827',
          fontFamily: "'Poppins', sans-serif",
          marginBottom: 16, marginTop: 0,
        }}>
          Quick Actions
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {QUICK_ACTIONS.map((action, i) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.key}
                whileHover={{ scale: 1.02, x: 2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                onClick={() => action.key === 'share' ? handleShare() : handleAction(action.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'transparent',
                  border: '1px solid #F1F5F9',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left',
                  width: '100%',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E5E7EB'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#F1F5F9'; }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: action.gradient,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}>
                  <Icon size={16} style={{ color: action.color }} />
                </div>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 600, color: '#334155',
                  fontFamily: "'Poppins', sans-serif",
                }}>
                  {action.label}
                </span>
                <ArrowRight size={14} style={{ color: '#CBD5E1' }} />
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Courses Widget */}
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
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: '#111827',
          fontFamily: "'Poppins', sans-serif",
          marginBottom: 14, marginTop: 0,
        }}>
          {role === 'TRAINER' ? 'Teaching' : 'Current Courses'}
        </h3>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#94A3B8' }} />
          </div>
        ) : courses.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '12px 0', margin: 0 }}>
            No courses yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {courses.map(course => (
              <div key={course.id} style={{
                padding: 10, borderRadius: 10,
                border: '1px solid #F1F5F9', background: '#FAFBFC',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#F1F5F9'; e.currentTarget.style.background = '#FAFBFC'; }}
              >
                <h4 style={{
                  fontSize: 12, fontWeight: 600, color: '#111827',
                  margin: '0 0 6px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {course.title}
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: `linear-gradient(90deg, ${course.color}, ${course.color}88)`,
                      width: `${course.progress}%`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', flexShrink: 0 }}>
                    {course.progress}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
