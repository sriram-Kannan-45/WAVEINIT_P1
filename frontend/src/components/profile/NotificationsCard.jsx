import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Award, FileCheck, Bell, Loader2 } from 'lucide-react';
import profileService from '../../services/profileService';

const ICON_MAP = {
  assignment_due: { icon: Clock, color: '#d97706', bg: '#fffbeb' },
  feedback_pending: { icon: AlertTriangle, color: '#ea580c', bg: '#fff7ed' },
  certificate_ready: { icon: Award, color: '#059669', bg: '#f0fdf4' },
  quiz_result: { icon: FileCheck, color: '#2563eb', bg: '#eff6ff' },
  default: { icon: Bell, color: '#64748b', bg: '#f1f5f9' },
};

function getIcon(type) {
  return ICON_MAP[type] || ICON_MAP.default;
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
  return `${days}d ago`;
}

export default function NotificationsCard() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchNotifications = async () => {
      try {
        const res = await profileService.getNotifications();
        const list = Array.isArray(res) ? res : (res?.notifications || res?.data || []);
        if (!cancelled) setNotifications(list.slice(0, 4));
      } catch {
        if (!cancelled) setNotifications([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchNotifications();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
        padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80,
      }}>
        <Loader2 size={18} className="animate-spin" style={{ color: '#94a3b8' }} />
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
      padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: "'Poppins', sans-serif", margin: 0 }}>
          Notifications
        </h3>
        {notifications.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: '50%',
            background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 600,
          }}>
            {notifications.length}
          </span>
        )}
      </div>

      {notifications.length === 0 ? (
        <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '16px 0', margin: 0 }}>
          No new notifications
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notifications.map((notif, i) => {
            const { icon: Icon, color, bg } = getIcon(notif.type);
            return (
              <div key={notif.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: 8, borderRadius: 8,
                border: '1px solid #f1f5f9', background: '#fafbfc',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.background = '#fafbfc'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: bg, color: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={12} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{notif.title || notif.message || 'Notification'}</div>
                  <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {notif.description || notif.body || ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 500, color: color, background: bg,
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  {notif.timeAgo || timeAgo(notif.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
