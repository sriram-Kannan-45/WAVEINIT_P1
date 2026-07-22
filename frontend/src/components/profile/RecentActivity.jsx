import { motion } from 'framer-motion';
import { Clock, FileText, BookOpen, Award, Upload, CheckCircle, ClipboardCheck } from 'lucide-react';

const ACTIVITY_CONFIG = {
  'uploaded': { icon: Upload, gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', color: '#2563EB' },
  'completed': { icon: CheckCircle, gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#16A34A' },
  'created': { icon: BookOpen, gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#059669' },
  'submitted': { icon: ClipboardCheck, gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', color: '#7C3AED' },
  'received': { icon: Award, gradient: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)', color: '#D97706' },
  'added': { icon: FileText, gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#059669' },
  'updated': { icon: FileText, gradient: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)', color: '#64748B' },
  'default': { icon: Clock, gradient: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)', color: '#64748B' },
};

function getConfig(activity) {
  const text = (activity || '').toLowerCase();
  for (const [key, val] of Object.entries(ACTIVITY_CONFIG)) {
    if (key !== 'default' && text.includes(key)) return val;
  }
  return ACTIVITY_CONFIG.default;
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecentActivity({ activities }) {
  const items = (activities || []).slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
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
        Recent Activity
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((item, i) => {
          const { icon: Icon, gradient, color } = getConfig(item.activity);
          return (
            <motion.div
              key={item.id || i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              style={{ display: 'flex', gap: 12, padding: '10px 0' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: gradient, color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0, borderBottom: i < items.length - 1 ? '1px solid #F1F5F9' : 'none', paddingBottom: 10 }}>
                <p style={{ fontSize: 13, color: '#334155', margin: 0, lineHeight: 1.5 }}>
                  {item.activity}
                </p>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>
                  {timeAgo(item.created_at)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '20px',
          background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
          borderRadius: 12, border: '1px dashed #E5E7EB',
        }}>
          <Clock size={20} style={{ color: '#CBD5E1', margin: '0 auto 6px' }} />
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            No recent activity.
          </p>
        </div>
      )}
    </motion.div>
  );
}
