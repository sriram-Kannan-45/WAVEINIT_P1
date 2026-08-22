import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, Trash2, Loader2 } from 'lucide-react';
import { assetUrl } from '../../../api/api';
import profileService from '../../../services/profileService';
import toast from 'react-hot-toast';
import { getTwoLetterInitials } from '../../common/UserAvatar';

export default function ProfilePhotoUploader({ profile, onAvatarUpdate }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const user = profile?.user;
  const initials = getTwoLetterInitials(user?.name);

  const handleFileSelect = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const data = await profileService.uploadAvatar(file);
      onAvatarUpdate(data.profileImage);
      toast.success('Photo updated');
    } catch {
      toast.error('Failed to upload photo');
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDelete = async () => {
    setUploading(true);
    try {
      await profileService.deleteAvatar();
      onAvatarUpdate(null);
      toast.success('Photo removed');
    } catch {
      toast.error('Failed to remove photo');
    }
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-6">
      <div
        className={`relative rounded-full transition-all duration-200 ${
          isDragOver ? 'ring-4 ring-emerald-500 ring-offset-2' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
          style={{
            background: '#FFFFFF',
            border: '3px solid #16A34A',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          {profile?.profileImage || user?.profilePic ? (
            <img
              src={assetUrl(profile?.profileImage || user?.profilePic)}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl font-bold" style={{ fontFamily: "'Poppins', sans-serif", color: '#16A34A' }}>
              {initials}
            </span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center cursor-pointer shadow-lg"
        >
          {uploading ? (
            <Loader2 size={14} className="text-emerald-600 animate-spin" />
          ) : (
            <Camera size={14} className="text-slate-500" />
          )}
        </motion.button>
      </div>

      <div className="flex-1">
        <h4 className="text-sm font-bold text-slate-900 mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Profile Photo
        </h4>
        <p className="text-xs text-slate-500 mb-3">
          JPG, PNG or WEBP. Max size 5MB.
        </p>
        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
          >
            <Upload size={13} />
            Upload Photo
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDelete}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50/80 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all"
          >
            <Trash2 size={13} />
            Remove
          </motion.button>
        </div>
      </div>
    </div>
  );
}
