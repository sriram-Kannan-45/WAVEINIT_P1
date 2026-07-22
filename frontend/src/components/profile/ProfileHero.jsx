import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Camera, Pencil, Share2, Download, ShieldCheck,
  Briefcase, Building2, MapPin, Calendar, ExternalLink,
} from 'lucide-react';
import { assetUrl } from '../../api/api';
import profileService from '../../services/profileService';
import toast from 'react-hot-toast';

const DEFAULT_BANNER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="280"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#059669"/><stop offset="50%" style="stop-color:#10B981"/><stop offset="100%" style="stop-color:#0D9488"/></linearGradient></defs><rect fill="url(#g)" width="1200" height="280"/><text x="600" y="140" text-anchor="middle" fill="rgba(255,255,255,0.08)" font-size="72" font-weight="bold" font-family="system-ui">WAVE INIT</text><circle cx="100" cy="60" r="80" fill="rgba(255,255,255,0.04)"/><circle cx="1100" cy="220" r="100" fill="rgba(255,255,255,0.04)"/><circle cx="400" cy="250" r="50" fill="rgba(255,255,255,0.03)"/></svg>'
);

const ROLE_STYLES = {
  ADMIN: { bg: 'linear-gradient(135deg, #FDF2F8, #FCE7F3)', color: '#BE185D', border: '#FBCFE8' },
  TRAINER: { bg: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#16A34A', border: '#BBF7D0' },
  PARTICIPANT: { bg: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', color: '#2563EB', border: '#BFDBFE' },
};

export default function ProfileHero({ profile, completion, onEditProfile, onBannerUpdate, onAvatarUpdate, onResume }) {
  const bannerInput = useRef(null);
  const avatarInput = useRef(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [bannerHover, setBannerHover] = useState(false);

  const user = profile?.user;
  const role = user?.role || 'PARTICIPANT';
  const roleStyle = ROLE_STYLES[role] || ROLE_STYLES.PARTICIPANT;
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const handleBannerChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const data = await profileService.uploadBanner(file);
      onBannerUpdate(data.bannerImage);
      toast.success('Banner updated');
    } catch { toast.error('Failed to upload banner'); }
    setUploadingBanner(false);
    e.target.value = '';
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const data = await profileService.uploadAvatar(file);
      onAvatarUpdate(data.profileImage);
      toast.success('Photo updated');
    } catch { toast.error('Failed to upload photo'); }
    setUploadingAvatar(false);
    e.target.value = '';
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    toast.success('Profile link copied!');
  };

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="profile-hero-card" style={{
      background: '#fff',
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
      border: '1px solid #E5E7EB',
    }}>
      {/* Banner */}
      <div
        onMouseEnter={() => setBannerHover(true)}
        onMouseLeave={() => setBannerHover(false)}
        style={{ position: 'relative', height: 280, overflow: 'hidden' }}
      >
        <img
          src={profile?.bannerImage ? assetUrl(profile.bannerImage) : DEFAULT_BANNER}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.5s ease',
            transform: bannerHover ? 'scale(1.02)' : 'scale(1)',
          }}
        />
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)',
        }} />

        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: 20, left: 30,
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
        }} />
        <div style={{
          position: 'absolute', bottom: 30, right: 60,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
        }} />

        {/* Edit Banner Button */}
        <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => bannerInput.current?.click()}
          disabled={uploadingBanner}
          style={{
            position: 'absolute', top: 16, right: 16,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.5)',
            color: '#334155',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            opacity: bannerHover || uploadingBanner ? 1 : 0,
            transition: 'opacity 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <Camera size={14} />
          {uploadingBanner ? 'Uploading...' : 'Change Banner'}
        </motion.button>

        {/* Completion Ring - Bottom Right */}
        <div style={{
          position: 'absolute', bottom: 16, right: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <div style={{ position: 'relative', width: 64, height: 64 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="32" cy="32" r="27" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.3)" strokeWidth="4" />
              <motion.circle
                cx="32" cy="32" r="27" fill="none"
                stroke="url(#completionGrad)" strokeWidth="4"
                strokeLinecap="round"
                initial={{ strokeDasharray: '0 169.6' }}
                animate={{ strokeDasharray: `${((completion || 0) / 100) * 169.6} 169.6` }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
              />
              <defs>
                <linearGradient id="completionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22C55E" />
                  <stop offset="100%" stopColor="#86EFAC" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: '#fff',
                fontFamily: "'Poppins', sans-serif",
                textShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}>
                {completion || 0}%
              </span>
            </div>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            letterSpacing: '0.05em',
          }}>
            COMPLETE
          </span>
        </div>
      </div>

      {/* Profile Info Section */}
      <div style={{
        position: 'relative',
        padding: '0 32px 28px',
      }}>
        {/* Avatar - overlapping banner */}
        <div style={{ marginTop: -60, marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            style={{ position: 'relative', flexShrink: 0 }}
          >
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              border: '4px solid #fff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #10B981, #0D9488)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {(profile?.profileImage || user?.profilePic) ? (
                <img
                  src={assetUrl(profile?.profileImage || user?.profilePic)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{
                  fontSize: 36, fontWeight: 700, color: '#fff',
                  fontFamily: "'Poppins', sans-serif",
                }}>
                  {initials}
                </span>
              )}
            </div>
            <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => avatarInput.current?.click()}
              disabled={uploadingAvatar}
              style={{
                position: 'absolute', bottom: 4, right: 4,
                width: 32, height: 32, borderRadius: '50%',
                background: '#fff',
                border: '2px solid #E5E7EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#64748B',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {uploadingAvatar ? (
                <div style={{
                  width: 14, height: 14, border: '2px solid #E5E7EB',
                  borderTopColor: '#22C55E', borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }} />
              ) : (
                <Camera size={14} />
              )}
            </motion.button>
          </motion.div>

          {/* Name and Info */}
          <div style={{ flex: '1 1 300px', minWidth: 0, paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{
                fontSize: 24, fontWeight: 700, color: '#111827',
                fontFamily: "'Poppins', sans-serif",
                letterSpacing: '-0.02em',
                margin: 0, lineHeight: 1.2,
              }}>
                {user?.name || 'User'}
              </h1>
              {user?.status === 'APPROVED' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: 'spring' }}
                >
                  <ShieldCheck size={20} style={{ color: '#22C55E' }} />
                </motion.div>
              )}
            </div>

            {profile?.headline && (
              <p style={{
                fontSize: 14, color: '#64748B', margin: '0 0 10px',
                fontWeight: 500, lineHeight: 1.4,
              }}>
                {profile.headline}
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 8,
                background: roleStyle.bg,
                color: roleStyle.color,
                border: `1px solid ${roleStyle.border}`,
                fontSize: 11, fontWeight: 600,
              }}>
                {role}
              </span>
              {profile?.designation && (
                <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Briefcase size={12} /> {profile.designation}
                </span>
              )}
              {profile?.company && (
                <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Building2 size={12} /> {profile.company}
                </span>
              )}
              {profile?.location && (
                <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} /> {profile.location}
                </span>
              )}
              {joinedDate && (
                <span style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={12} /> Joined {joinedDate}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 4 }}>
            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onEditProfile}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                background: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              <Pencil size={14} /> Edit Profile
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleShare}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                background: '#F8FAFC', color: '#475569',
                border: '1px solid #E5E7EB', cursor: 'pointer',
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              <Share2 size={14} /> Share Profile
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onResume}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                background: '#F8FAFC', color: '#475569',
                border: '1px solid #E5E7EB', cursor: 'pointer',
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              <Download size={14} /> Resume
            </motion.button>
          </div>
        </div>

        {/* Email and Phone row */}
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap',
          paddingTop: 8, borderTop: '1px solid #F1F5F9',
        }}>
          {user?.email && (
            <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Briefcase size={11} style={{ color: '#16A34A' }} />
              </div>
              {user.email}
            </span>
          )}
          {profile?.phone && (
            <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Briefcase size={11} style={{ color: '#2563EB' }} />
              </div>
              {profile.phone}
            </span>
          )}
          {profile?.location && (
            <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <MapPin size={11} style={{ color: '#D97706' }} />
              </div>
              {profile.location}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
