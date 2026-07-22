import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { FileText, Upload, Download, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { assetUrl } from '../../../api/api';
import profileService from '../../../services/profileService';
import toast from 'react-hot-toast';

export default function ResumeUploader({ profile }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [resumeName, setResumeName] = useState(profile?.resume?.name || null);

  const handleFileSelect = async (file) => {
    if (!file) return;
    if (!file.name.match(/\.(pdf|docx)$/i)) {
      toast.error('Please select a PDF or DOCX file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      await profileService.uploadResume(file);
      setResumeName(file.name);
      toast.success('Resume uploaded');
    } catch {
      toast.error('Failed to upload resume');
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

  const handleDownload = () => {
    if (profile?.resume?.path) {
      window.open(assetUrl(profile.resume.path), '_blank');
    }
  };

  const handleDelete = async () => {
    setUploading(true);
    try {
      await profileService.deleteResume();
      setResumeName(null);
      toast.success('Resume removed');
    } catch {
      toast.error('Failed to remove resume');
    }
    setUploading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}
        >
          <FileText size={16} className="text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Resume
        </h3>
      </div>

      {resumeName ? (
        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{resumeName}</p>
              <p className="text-xs text-slate-500">Uploaded successfully</p>
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
            >
              <Download size={12} />
              Download
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDelete}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
            >
              <Trash2 size={12} />
              Remove
            </motion.button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              {uploading ? (
                <Loader2 size={20} className="text-emerald-600 animate-spin" />
              ) : (
                <Upload size={20} className="text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                {isDragOver ? 'Drop your resume here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-slate-500 mt-1">PDF or DOCX (max 5MB)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
