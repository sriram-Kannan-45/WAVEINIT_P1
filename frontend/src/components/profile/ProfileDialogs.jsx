import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText } from 'lucide-react';
import profileService from '../../services/profileService';
import { assetUrl } from '../../api/api';

const overlay = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modal = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0 } };

function Dialog({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div variants={overlay} initial="hidden" animate="visible" exit="hidden" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div variants={modal} initial="hidden" animate="visible" exit="hidden" onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
          </div>
          <div className="p-5">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";
const labelCls = "block text-xs font-medium text-slate-600 mb-1";

export function EditProfileDialog({ open, onClose, profile, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (profile) setForm({
      name: profile.user?.name || '', headline: profile.headline || '', about: profile.about || '',
      phone: profile.phone || '', location: profile.location || '', company: profile.company || '',
      department: profile.department || '', designation: profile.designation || '',
      experience: profile.experience || '', timezone: profile.timezone || '', language: profile.language || '',
    });
  }, [profile]);

  const handleSave = async () => {
    await onSave(form);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Edit Profile">
      <div className="space-y-4">
        <div><label className={labelCls}>Full Name</label><input className={inputCls} value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={labelCls}>Headline</label><input className={inputCls} value={form.headline || ''} onChange={e => setForm({ ...form, headline: e.target.value })} placeholder="Senior Software Engineer | React & Node.js Expert" /></div>
        <div><label className={labelCls}>About</label><textarea className={inputCls + " resize-none"} rows={4} value={form.about || ''} onChange={e => setForm({ ...form, about: e.target.value })} maxLength={1000} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className={labelCls}>Location</label><input className={inputCls} value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="City, Country" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Company</label><input className={inputCls} value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
          <div><label className={labelCls}>Department</label><input className={inputCls} value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Designation</label><input className={inputCls} value={form.designation || ''} onChange={e => setForm({ ...form, designation: e.target.value })} /></div>
          <div><label className={labelCls}>Experience</label><input className={inputCls} value={form.experience || ''} onChange={e => setForm({ ...form, experience: e.target.value })} placeholder="5 years" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Timezone</label><input className={inputCls} value={form.timezone || ''} onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="IST" /></div>
          <div><label className={labelCls}>Language</label><input className={inputCls} value={form.language || ''} onChange={e => setForm({ ...form, language: e.target.value })} placeholder="English" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">Save Changes</button>
        </div>
      </div>
    </Dialog>
  );
}

export function AddExperienceDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (editData) setForm({ ...editData, startDate: editData.startDate?.split('T')[0] || '', endDate: editData.endDate?.split('T')[0] || '' });
    else setForm({ company: '', role: '', employmentType: 'FULL_TIME', location: '', startDate: '', endDate: '', currentlyWorking: false, description: '', logo: '' });
  }, [editData, open]);

  const handleSave = async () => { await onSave(form); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} title={editData ? 'Edit Experience' : 'Add Experience'}>
      <div className="space-y-4">
        <div><label className={labelCls}>Company *</label><input className={inputCls} value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
        <div><label className={labelCls}>Role *</label><input className={inputCls} value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Employment Type</label>
            <select className={inputCls} value={form.employmentType || 'FULL_TIME'} onChange={e => setForm({ ...form, employmentType: e.target.value })}>
              <option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option><option value="CONTRACT">Contract</option>
              <option value="INTERNSHIP">Internship</option><option value="FREELANCE">Freelance</option><option value="SELF_EMPLOYED">Self-employed</option>
            </select>
          </div>
          <div><label className={labelCls}>Location</label><input className={inputCls} value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Start Date *</label><input type="date" className={inputCls} value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
          <div><label className={labelCls}>End Date</label><input type="date" className={inputCls} value={form.endDate || ''} onChange={e => setForm({ ...form, endDate: e.target.value })} disabled={form.currentlyWorking} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.currentlyWorking || false} onChange={e => setForm({ ...form, currentlyWorking: e.target.checked })} className="rounded accent-emerald-600" />
          Currently working here
        </label>
        <div><label className={labelCls}>Description</label><textarea className={inputCls + " resize-none"} rows={3} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">{editData ? 'Update' : 'Add'}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function AddEducationDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (editData) setForm(editData);
    else setForm({ institution: '', degree: '', department: '', cgpa: '', year: '', logo: '' });
  }, [editData, open]);

  const handleSave = async () => { await onSave(form); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} title={editData ? 'Edit Education' : 'Add Education'}>
      <div className="space-y-4">
        <div><label className={labelCls}>Institution *</label><input className={inputCls} value={form.institution || ''} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Degree</label><input className={inputCls} value={form.degree || ''} onChange={e => setForm({ ...form, degree: e.target.value })} placeholder="B.Tech, MCA..." /></div>
          <div><label className={labelCls}>Department</label><input className={inputCls} value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Computer Science" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>CGPA</label><input className={inputCls} type="number" step="0.01" min="0" max="10" value={form.cgpa || ''} onChange={e => setForm({ ...form, cgpa: e.target.value })} /></div>
          <div><label className={labelCls}>Year</label><input className={inputCls} value={form.year || ''} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="2020-2024" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">{editData ? 'Update' : 'Add'}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function AddCertificateDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (editData) setForm({ ...editData, issueDate: editData.issueDate?.split('T')[0] || '', expiryDate: editData.expiryDate?.split('T')[0] || '' });
    else setForm({ title: '', issuer: '', credentialId: '', issueDate: '', expiryDate: '', verificationUrl: '' });
    setFile(null);
  }, [editData, open]);

  const handleSave = async () => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    if (file) fd.append('certificate', file);
    await onSave(fd, !!editData);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={editData ? 'Edit Certificate' : 'Add Certificate'}>
      <div className="space-y-4">
        <div><label className={labelCls}>Certificate Title *</label><input className={inputCls} value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={labelCls}>Issuer</label><input className={inputCls} value={form.issuer || ''} onChange={e => setForm({ ...form, issuer: e.target.value })} placeholder="Google, AWS..." /></div>
        <div><label className={labelCls}>Credential ID</label><input className={inputCls} value={form.credentialId || ''} onChange={e => setForm({ ...form, credentialId: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Issue Date</label><input type="date" className={inputCls} value={form.issueDate || ''} onChange={e => setForm({ ...form, issueDate: e.target.value })} /></div>
          <div><label className={labelCls}>Expiry Date</label><input type="date" className={inputCls} value={form.expiryDate || ''} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
        </div>
        <div><label className={labelCls}>Verification URL</label><input className={inputCls} value={form.verificationUrl || ''} onChange={e => setForm({ ...form, verificationUrl: e.target.value })} placeholder="https://..." /></div>
        <div>
          <label className={labelCls}>Certificate File</label>
          <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <Upload size={14} className="text-slate-400" />
            <span className="text-xs text-slate-500">{file ? file.name : 'Upload JPG, PNG, or PDF (max 5MB)'}</span>
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0])} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">{editData ? 'Update' : 'Add'}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function AddProjectDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (editData) setForm(editData);
    else setForm({ title: '', description: '', techStack: '', github: '', liveDemo: '', thumbnail: '' });
  }, [editData, open]);

  const handleSave = async () => { await onSave(form); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} title={editData ? 'Edit Project' : 'Add Project'}>
      <div className="space-y-4">
        <div><label className={labelCls}>Project Name *</label><input className={inputCls} value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={labelCls}>Description</label><textarea className={inputCls + " resize-none"} rows={3} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div><label className={labelCls}>Tech Stack</label><input className={inputCls} value={form.techStack || ''} onChange={e => setForm({ ...form, techStack: e.target.value })} placeholder="React, Node.js, MongoDB" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>GitHub URL</label><input className={inputCls} value={form.github || ''} onChange={e => setForm({ ...form, github: e.target.value })} /></div>
          <div><label className={labelCls}>Live Demo URL</label><input className={inputCls} value={form.liveDemo || ''} onChange={e => setForm({ ...form, liveDemo: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">{editData ? 'Update' : 'Add'}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function EditContactDialog({ open, onClose, onSave, contactLinks }) {
  const [form, setForm] = useState({});
  useEffect(() => { setForm(contactLinks || {}); }, [contactLinks, open]);

  const handleSave = async () => { await onSave(form); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} title="Edit Contact Links">
      <div className="space-y-4">
        {[
          { key: 'linkedin', label: 'LinkedIn' }, { key: 'github', label: 'GitHub' },
          { key: 'website', label: 'Website' }, { key: 'portfolio', label: 'Portfolio' },
          { key: 'twitter', label: 'Twitter' }, { key: 'youtube', label: 'YouTube' },
        ].map(f => (
          <div key={f.key}><label className={labelCls}>{f.label}</label><input className={inputCls} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={`https://...`} /></div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">Save</button>
        </div>
      </div>
    </Dialog>
  );
}

export function ResumeUploadDialog({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try { await profileService.uploadResume(file); onClose(true); } catch (e) { console.error(e); }
    setUploading(false);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} title="Upload Resume">
      <div className="space-y-4">
        <label className="flex flex-col items-center gap-3 px-6 py-8 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
          <FileText size={32} className="text-slate-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">{file ? file.name : 'Click to upload or drag and drop'}</p>
            <p className="text-xs text-slate-400 mt-1">PDF or DOCX (max 5MB)</p>
          </div>
          <input type="file" accept=".pdf,.docx" className="hidden" onChange={e => setFile(e.target.files?.[0])} />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={() => onClose(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleUpload} disabled={!file || uploading} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
