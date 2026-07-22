import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, CheckCircle2, Shield, Download, Share2, Pencil, MapPin, Building2, Briefcase, Mail, Phone, Calendar, Globe } from 'lucide-react';
import { assetUrl } from '../../api/api';
import profileService from '../../services/profileService';

const roleColors = {
  ADMIN: 'bg-pink-100 text-pink-700 border-pink-200',
  TRAINER: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTICIPANT: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function ProfileHeader({ profile, user, onEditProfile, onAvatarUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const fileRef = useRef();

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await profileService.uploadAvatar(file);
      onAvatarUpdate(result.profileImage);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

  const avatarSrc = profile?.profileImage
    ? assetUrl(profile.profileImage)
    : user?.profilePic
      ? assetUrl(user.profilePic)
      : null;

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

  return (
    <div className="px-8 pb-8 -mt-20 relative z-10">
      <div className="flex flex-col sm:flex-row items-start gap-6">
        {/* Avatar */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="relative group shrink-0"
        >
          <div className="w-[170px] h-[170px] rounded-full border-4 border-white shadow-xl overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            {avatarSrc ? (
              <img src={avatarSrc} alt={user?.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-2 right-2 w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-700 transition-all opacity-0 group-hover:opacity-100"
          >
            <Camera size={16} />
          </button>
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex-1 pt-4 min-w-0"
        >
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-900">{user?.name || 'Unknown User'}</h1>
            <CheckCircle2 size={18} className="text-emerald-500" />
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${roleColors[user?.role] || 'bg-slate-100 text-slate-600'}`}>
              <Shield size={10} className="inline mr-1" />
              {user?.role}
            </span>
          </div>

          {profile?.headline && (
            <p className="text-lg text-slate-600 mb-3">{profile.headline}</p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500 mb-4">
            {profile?.company && (
              <span className="flex items-center gap-1"><Building2 size={13} /> {profile.company}</span>
            )}
            {profile?.designation && (
              <span className="flex items-center gap-1"><Briefcase size={13} /> {profile.designation}</span>
            )}
            {profile?.location && (
              <span className="flex items-center gap-1"><MapPin size={13} /> {profile.location}</span>
            )}
            {user?.email && (
              <span className="flex items-center gap-1"><Mail size={13} /> {user.email}</span>
            )}
            {profile?.phone && (
              <span className="flex items-center gap-1"><Phone size={13} /> {profile.phone}</span>
            )}
            {user?.created_at && (
              <span className="flex items-center gap-1"><Calendar size={13} /> Joined {formatDate(user.created_at)}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={onEditProfile} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
              <Pencil size={14} /> Edit Profile
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
              <Share2 size={14} /> Share
            </button>
            {profile?.resume && (
              <a href={assetUrl(profile.resume)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                <Download size={14} /> Resume
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
