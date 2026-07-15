import { useState, useEffect } from 'react'
import { User, Mail, Phone, Calendar, Award, TrendingUp, BookOpen, Loader2, ExternalLink } from 'lucide-react'
import { API_BASE } from '../../../api/api'
import EditProfileModal from '../../participant/EditProfileModal'

function getAuthHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const token = user?.token || user?.accessToken || ''
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export default function ProfileSection({ user, enrollments = [], quizzes = [], onResume, onTabChange }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_BASE}/participant-profile/me`, {
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        })
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        if (!cancelled) setProfile(data.profile || data)
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchProfile()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    )
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'
  const avatarUrl = profile?.avatarUrl || user?.profileImage

  return (
    <div>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-medium)' }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>
              {initials}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Poppins', sans-serif", margin: 0 }}>{user?.name || 'Student'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0' }}>{user?.email || ''}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <span className="badge badge-blue"><User size={12} style={{ marginRight: 4 }} />{user?.role || 'PARTICIPANT'}</span>
              {profile?.bio && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{profile.bio}</span>}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(true)}>Edit Profile</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="stat-card">
          <span className="stat-label">Enrolled</span>
          <span className="stat-value">{enrollments.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Quizzes</span>
          <span className="stat-value">{quizzes.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{enrollments.filter(e => e.status === 'COMPLETED').length}</span>
        </div>
      </div>

      {profile?.skills?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h3>Skills</h3></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.skills.map((s, i) => (
              <span key={i} className="badge badge-green">{s}</span>
            ))}
          </div>
        </div>
      )}

      {profile?.links?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h3>Links</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profile.links.map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: 14 }}
              >
                <ExternalLink size={14} />
                {link.label || link.url}
              </a>
            ))}
          </div>
        </div>
      )}

      {showEdit && (
        <EditProfileModal
          user={user}
          profile={profile}
          onClose={() => setShowEdit(false)}
          onSave={(updated) => {
            setProfile(prev => ({ ...prev, ...updated }))
            setShowEdit(false)
          }}
        />
      )}
    </div>
  )
}
