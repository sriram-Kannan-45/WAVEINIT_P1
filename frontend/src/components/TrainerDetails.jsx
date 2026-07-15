import { useState } from 'react'

import { API_BASE as API } from '../api/api'

/**
 * TrainerDetails — expanded profile panel shown when admin clicks a trainer card.
 * Fetches full profile from /api/admin/trainer/:id on first expand.
 */
function TrainerDetails({ trainer, token }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  // Fetch full profile data (lazy, only once)
  const loadProfile = async () => {
    if (fetched) return
    setLoading(true)
    try {
      const r = await fetch(`${API}/admin/trainer/${trainer.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await r.json()
      setProfile(d.trainer || null)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }

  // Run on mount inside the expanded card
  if (!fetched && !loading) loadProfile()

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const imgSrc = profile?.profile?.imagePath
    ? (profile.profile.imagePath.startsWith('data:') ? profile.profile.imagePath : `${API.replace('/api', '')}${profile.profile.imagePath}`)
    : null

  const initials = (name) => name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'

  return (
    <div className="trainer-details-panel">
      {loading ? (
        <div className="trainer-details-loading">
          <div className="spinner" />
          <span>Loading profile…</span>
        </div>
      ) : (
        <div className="trainer-details-inner">
          {/* Avatar / Image */}
          <div className="trainer-profile-avatar-wrap">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={`${profile?.name} profile`}
                className="trainer-profile-image"
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
              />
            ) : null}
            <div
              className="trainer-profile-initials"
              style={{ display: imgSrc ? 'none' : 'flex' }}
            >
              {initials(profile?.name || trainer.name)}
            </div>
          </div>

          {/* Info grid */}
          <div className="trainer-details-grid">
            <div className="trainer-detail-item">
              <span className="detail-label">Full Name</span>
              <span className="detail-value">{profile?.name || trainer.name}</span>
            </div>
            <div className="trainer-detail-item">
              <span className="detail-label">Email</span>
              <span className="detail-value">{profile?.email || trainer.email}</span>
            </div>
            <div className="trainer-detail-item">
              <span className="detail-label">Phone</span>
              <span className="detail-value">{profile?.profile?.phone || trainer.profile?.phone || '—'}</span>
            </div>
            <div className="trainer-detail-item">
              <span className="detail-label">Date of Birth</span>
              <span className="detail-value">{fmtDate(profile?.profile?.dob)}</span>
            </div>
            <div className="trainer-detail-item">
              <span className="detail-label">Qualification</span>
              <span className="detail-value">{profile?.profile?.qualification || '—'}</span>
            </div>
            <div className="trainer-detail-item">
              <span className="detail-label">Experience</span>
              <span className="detail-value experience-text">{profile?.profile?.experience || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TrainerDetails
