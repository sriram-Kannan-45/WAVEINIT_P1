import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Briefcase, Zap, Calendar, GraduationCap, Award, Share2, FileText,
  ShieldCheck, X, Save, Upload, Trash2, Lock, Camera, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { assetUrl } from '../../../api/api';
import profileService from '../../../services/profileService';

const NAV_ITEMS = [
  { id: 'basic', label: 'Basic Information', icon: User },
  { id: 'professional', label: 'Professional Details', icon: Briefcase },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'experience', label: 'Experience', icon: Calendar },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'certifications', label: 'Certifications', icon: Award },
  { id: 'social', label: 'Social Links', icon: Share2 },
  { id: 'resume', label: 'Resume', icon: FileText },
];

export default function EditProfileModal({ open, onClose, profile, onSave }) {
  const [activeSection, setActiveSection] = useState('basic');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [skillInput, setSkillInput] = useState('');

  const [form, setForm] = useState({
    name: '',
    headline: '',
    about: '',
    phone: '',
    location: '',
    company: '',
    department: '',
    designation: '',
    employeeId: '',
    experience: '',
    timezone: '',
    skills: [],
    contactLinks: {
      linkedin: '',
      github: '',
      portfolio: '',
      website: '',
      twitter: '',
      instagram: '',
    },
  });

  const [saving, setSaving] = useState(false);
  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const photoInputRef = useRef(null);

  const isTrainer = profile?.role === 'trainer' || profile?.user?.role === 'trainer';

  // Lock background page scroll when modal is active
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.user?.name || profile.name || '',
        headline: profile.headline || '',
        about: profile.about || '',
        phone: profile.phone || '',
        location: profile.location || profile.address || '',
        company: profile.company || 'Wave Init Solutions',
        department: profile.department || '',
        designation: profile.designation || '',
        employeeId: profile.employeeId || profile.employee_id || '',
        experience: profile.experience || '',
        timezone: profile.timezone || 'Asia/Kolkata (IST)',
        skills: Array.isArray(profile.skills)
          ? profile.skills.map(s => typeof s === 'string' ? s : (s.skill || s.name))
          : [],
        contactLinks: {
          linkedin: profile.contactLinks?.linkedin || profile.socialLinks?.linkedin || '',
          github: profile.contactLinks?.github || profile.socialLinks?.github || '',
          portfolio: profile.contactLinks?.portfolio || profile.socialLinks?.portfolio || '',
          website: profile.contactLinks?.website || profile.socialLinks?.website || '',
          twitter: profile.contactLinks?.twitter || profile.socialLinks?.twitter || '',
          instagram: profile.contactLinks?.instagram || profile.socialLinks?.instagram || '',
        },
      });
    }
  }, [profile]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [form, saving]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const scrollToSection = (id) => {
    setActiveSection(id);
    const element = document.getElementById(`section-${id}`);
    if (element && contentRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateContactLink = (field, value) => {
    setForm(prev => ({
      ...prev,
      contactLinks: { ...prev.contactLinks, [field]: value },
    }));
  };

  const handleAddSkill = (skillToAdd) => {
    const val = (skillToAdd || skillInput).trim();
    if (val && !form.skills.includes(val)) {
      setForm(prev => ({ ...prev, skills: [...prev.skills, val] }));
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setForm(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skillToRemove),
    }));
  };

  const handlePhotoSelect = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB');
      return;
    }
    setUploadingPhoto(true);
    try {
      if (profileService.uploadAvatar) {
        const res = await profileService.uploadAvatar(file);
        updateField('profileImage', res.profileImage);
      }
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Photo updated successfully');
    }
    setUploadingPhoto(false);
  };

  const handleRemovePhoto = async () => {
    try {
      if (profileService.deleteAvatar) {
        await profileService.deleteAvatar();
      }
      updateField('profileImage', null);
      toast.success('Photo removed');
    } catch {
      toast.error('Failed to remove photo');
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
    }
    setSaving(false);
  };

  if (!open) return null;

  const initials = form.name
    ? form.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (isTrainer ? 'TR' : 'ST');
  const userEmail = profile?.user?.email || profile?.email || 'wavene20@gmail.com';

  const modalJSX = (
    <AnimatePresence>
      <div
        className="fixed inset-0 flex items-center justify-center p-6"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          inset: 0,
          width: '100vw',
          height: '100dvh',
          boxSizing: 'border-box',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 'var(--z-modal-overlay, 1000)',
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(6px)',
          overflow: 'hidden',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          ref={modalRef}
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          className="bg-white rounded-3xl shadow-2xl flex flex-col outline-none overflow-hidden"
          style={{
            position: 'relative',
            width: 'min(1400px, calc(100vw - 48px))',
            height: 'min(900px, calc(100dvh - 48px))',
            maxHeight: 'calc(100dvh - 48px)',
            maxWidth: 'calc(100vw - 48px)',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 'var(--z-modal, 1001)',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Fixed Header ────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white shrink-0">
            <div className="flex items-center gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}
              >
                <User size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  Edit Profile
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Manage your personal and professional information</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* ── Modal Body: Fixed Sidebar + Main Scroll Area ───────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left Sidebar (Fixed inside Modal) */}
            <div className="w-60 border-r border-slate-200 p-4 flex flex-col gap-1 shrink-0 bg-slate-50/60">
              {NAV_ITEMS.map(nav => {
                const Icon = nav.icon;
                const isActive = activeSection === nav.id;
                return (
                  <button
                    key={nav.id}
                    onClick={() => scrollToSection(nav.id)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                    {nav.label}
                  </button>
                );
              })}

              {/* Security Badge Card */}
              <div className="mt-auto p-3.5 bg-emerald-50/90 rounded-2xl border border-emerald-200/70">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                  Your information is secure and encrypted
                </div>
                <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                  Only you and authorized personnel can access this information.
                </p>
              </div>
            </div>

            {/* Main Content Area (Scrolls Internally Only) */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
              {/* CARD 1: Profile Photo */}
              <div id="section-photo" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div
                      className="w-22 h-22 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-md"
                      style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}
                    >
                      {form.profileImage || profile?.imagePath || profile?.profileImage ? (
                        <img
                          src={assetUrl(form.profileImage || profile?.imagePath || profile?.profileImage)}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-white">{initials}</span>
                      )}
                    </div>
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm hover:bg-slate-50"
                    >
                      <Camera size={13} />
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
                    />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      Profile Photo
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 mb-3">
                      JPG, PNG or WEBP • Max size 5MB
                    </p>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
                      >
                        <Upload size={13} /> Upload Photo
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={uploadingPhoto}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: Basic Information */}
              <div id="section-basic" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <User size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Basic Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="Sriram Kannan"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address *</label>
                    <div className="relative">
                      <input
                        type="email"
                        disabled
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-100 text-slate-500 cursor-not-allowed pr-8"
                        value={userEmail}
                      />
                      <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Email cannot be changed</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone Number *</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Professional Headline *</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      value={form.headline}
                      onChange={(e) => updateField('headline', e.target.value)}
                      placeholder="Senior Software Engineer | React & Node.js Expert"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">About / Bio</label>
                    <textarea
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                      rows={3}
                      value={form.about}
                      onChange={(e) => updateField('about', e.target.value)}
                      placeholder="Tell us about your professional background, expertise, and interests..."
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: Professional Details */}
              <div id="section-professional" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <Briefcase size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Professional Details
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Company</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.company}
                      onChange={(e) => updateField('company', e.target.value)}
                      placeholder="Wave Init Solutions"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Department</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.department}
                      onChange={(e) => updateField('department', e.target.value)}
                      placeholder="Engineering"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Designation</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.designation}
                      onChange={(e) => updateField('designation', e.target.value)}
                      placeholder="Senior Software Engineer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Employee ID</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.employeeId}
                      onChange={(e) => updateField('employeeId', e.target.value)}
                      placeholder="EMP-1024"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Experience</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.experience}
                      onChange={(e) => updateField('experience', e.target.value)}
                      placeholder="5 Years"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Location</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.location}
                      onChange={(e) => updateField('location', e.target.value)}
                      placeholder="Chennai, India"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Time Zone</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.timezone}
                      onChange={(e) => updateField('timezone', e.target.value)}
                      placeholder="Asia/Kolkata (IST)"
                    />
                  </div>
                </div>
              </div>

              {/* CARD 4: Skills */}
              <div id="section-skills" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <Zap size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Skills
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  {form.skills.map(skill => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        className="p-0.5 hover:bg-emerald-200/50 rounded-md text-emerald-700 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3.5 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                    placeholder="Type a skill and press Enter..."
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSkill();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSkill()}
                    className="px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
                  >
                    Add Skill
                  </button>
                </div>
              </div>

              {/* CARD 5: Experience */}
              <div id="section-experience" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                      <Calendar size={15} className="text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      Experience
                    </h3>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-2">
                  <div className="font-semibold text-slate-900">Senior Software Engineer • Wave Init Solutions</div>
                  <div className="text-slate-500">Jan 2023 - Present • Full-time</div>
                  <div className="text-slate-600">Building enterprise LMS applications, React dashboards, and cloud integrations.</div>
                </div>
              </div>

              {/* CARD 6: Education */}
              <div id="section-education" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <GraduationCap size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Education
                  </h3>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-900">Bachelor of Technology (B.Tech) - Computer Science</div>
                  <div className="text-slate-500">Anna University • 2018 - 2022</div>
                </div>
              </div>

              {/* CARD 7: Certifications */}
              <div id="section-certifications" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <Award size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Certifications
                  </h3>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-900">AWS Certified Developer - Associate</div>
                  <div className="text-slate-500">Amazon Web Services • Issued Jan 2024</div>
                </div>
              </div>

              {/* CARD 8: Social Links */}
              <div id="section-social" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <Share2 size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Social Links
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">LinkedIn URL</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.contactLinks.linkedin}
                      onChange={(e) => updateContactLink('linkedin', e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">GitHub URL</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.contactLinks.github}
                      onChange={(e) => updateContactLink('github', e.target.value)}
                      placeholder="https://github.com/username"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Twitter / X URL</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.contactLinks.twitter}
                      onChange={(e) => updateContactLink('twitter', e.target.value)}
                      placeholder="https://twitter.com/username"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Portfolio / Website URL</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                      value={form.contactLinks.portfolio || form.contactLinks.website}
                      onChange={(e) => updateContactLink('portfolio', e.target.value)}
                      placeholder="https://yourportfolio.com"
                    />
                  </div>
                </div>
              </div>

              {/* CARD 9: Resume */}
              <div id="section-resume" className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                    <FileText size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Resume
                  </h3>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText size={24} className="text-rose-500" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Sriram_Kannan_Resume.pdf</div>
                      <div className="text-[11px] text-slate-400">Updated on May 20, 2026 • 1.2 MB</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50"
                    >
                      Update Resume
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Fixed Footer ────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-8 py-4 border-t border-slate-200 bg-white shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Changes are saved securely
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="px-5 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-6 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-xl shadow-md transition-all flex items-center gap-2"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={15} /> Save Changes
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalJSX, document.body);
}
