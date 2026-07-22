import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, Trash2, Save, X } from 'lucide-react';
import { assetUrl } from '../../api/api';
import profileService from '../../services/profileService';

const DEFAULT_BANNER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="320"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#059669"/><stop offset="50%" style="stop-color:#10B981"/><stop offset="100%" style="stop-color:#0D9488"/></linearGradient></defs><rect fill="url(#g)" width="1200" height="320"/><text x="600" y="160" text-anchor="middle" fill="rgba(255,255,255,0.12)" font-size="64" font-weight="bold" font-family="system-ui">WAVE INIT</text><circle cx="100" cy="60" r="80" fill="rgba(255,255,255,0.05)"/><circle cx="1100" cy="260" r="100" fill="rgba(255,255,255,0.05)"/><circle cx="400" cy="280" r="50" fill="rgba(255,255,255,0.03)"/></svg>');

export default function ProfileBanner({ bannerImage, onBannerUpdate }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!fileRef.current?.files?.[0]) return;
    setUploading(true);
    try {
      const result = await profileService.uploadBanner(fileRef.current.files[0]);
      onBannerUpdate(result.bannerImage);
      setPreview(null);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

  const handleDelete = async () => {
    try {
      await profileService.deleteBanner();
      onBannerUpdate(null);
      setPreview(null);
    } catch (err) {
      console.error(err);
    }
  };

  const bannerSrc = preview || (bannerImage ? assetUrl(bannerImage) : DEFAULT_BANNER);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative h-[320px] w-full overflow-hidden rounded-t-2xl group"
    >
      <img src={bannerSrc} alt="Banner" className="w-full h-full object-cover" />

      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-sm font-medium text-slate-700 hover:bg-white transition-colors shadow-sm">
          <Camera size={14} /> Change Banner
        </button>
        {(bannerImage || preview) && (
          <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/90 backdrop-blur-sm rounded-lg text-sm font-medium text-white hover:bg-red-600 transition-colors shadow-sm">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {preview && (
        <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleSave} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 rounded-lg text-sm font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
            <Save size={14} /> {uploading ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setPreview(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 rounded-lg text-sm font-medium text-white hover:bg-slate-700 transition-colors shadow-sm">
            <X size={14} /> Cancel
          </button>
        </div>
      )}
    </motion.div>
  );
}
