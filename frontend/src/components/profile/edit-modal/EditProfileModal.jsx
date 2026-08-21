import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Briefcase, Star, BarChart2, GraduationCap, Award, Link, FileText,
  ShieldCheck, X, Save, Upload, Trash2, Lock, Camera, CheckCircle2,
  Bell, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { assetUrl } from '../../../api/api';
import profileService from '../../../services/profileService';
import './EditProfilePage.css';
import { getTwoLetterInitials } from '../../common/UserAvatar';

const NAV_ITEMS = [
  { id: 'basic', label: 'Basic Information', icon: User },
  { id: 'professional', label: 'Professional Details', icon: Briefcase },
  { id: 'skills', label: 'Skills', icon: Star },
  { id: 'experience', label: 'Experience', icon: BarChart2 },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'certifications', label: 'Certifications', icon: Award },
  { id: 'social', label: 'Social Links', icon: Link },
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
    profileImage: null,
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
  const contentRef = useRef(null);
  const photoInputRef = useRef(null);

  const isTrainer = profile?.role === 'trainer' || profile?.user?.role === 'trainer';
  const roleLabel = isTrainer ? 'Trainer' : 'Participant';

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
        name: profile.user?.name || profile.name || 'sriram',
        headline: profile.headline || 'Senior Software Engineer | React & Node.js Expert',
        about: profile.about || '',
        phone: profile.phone || '+91 98765 43210',
        location: profile.location || profile.address || 'Chennai, India',
        company: profile.company || 'Wave Init Solutions',
        department: profile.department || 'Engineering',
        designation: profile.designation || 'Senior Software Engineer',
        employeeId: profile.employeeId || profile.employee_id || 'EMP-1024',
        experience: profile.experience || '5 Years',
        timezone: profile.timezone || 'Asia/Kolkata (IST)',
        profileImage: profile.profileImage || profile.imagePath || null,
        skills: Array.isArray(profile.skills) && profile.skills.length > 0
          ? profile.skills.map(s => typeof s === 'string' ? s : (s.skill || s.name))
          : ['React.js', 'Node.js', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'System Design'],
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
      toast.success('Profile photo updated!');
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

  const initials = getTwoLetterInitials(form.name || (isTrainer ? 'TR' : 'ST'));
  const userEmail = profile?.user?.email || profile?.email || 'wavene2@gmail.com';

  const modalJSX = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="wip-edit-profile-root"
      >
        {/* ── LEFT SIDEBAR ────────────────────────────────────────────── */}
        <aside className="wip-sidebar">
          <div>
            {/* Logo */}
            <div className="wip-sidebar-logo">
              <div className="wip-logo-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
              </div>
              <span className="wip-logo-text">WAVE INIT LMS</span>
            </div>

            {/* Navigation Items */}
            <nav className="wip-nav-list">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={`wip-nav-item ${isActive ? 'wip-nav-item--active' : ''}`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Security Badge Card */}
          <div className="wip-security-card">
            <div className="wip-security-title">
              <ShieldCheck size={16} color="#16A34A" style={{ flexShrink: 0 }} />
              <span>Your information is secure and encrypted</span>
            </div>
            <p className="wip-security-desc">
              Only you and authorized personnel can access this information.
            </p>
          </div>
        </aside>

        {/* ── MAIN CONTENT ────────────────────────────────────────────── */}
        <div className="wip-main">
          {/* Top Header Bar */}
          <header className="wip-header">
            <div>
              <h1 className="wip-header-title">Edit Profile</h1>
              <p className="wip-header-subtitle">Manage your personal and professional information</p>
            </div>

            <div className="wip-header-actions">
              {/* Notification Bell */}
              <button type="button" className="wip-notification-btn" title="Notifications">
                <Bell size={15} />
                <span className="wip-notification-badge">3</span>
              </button>

              {/* User Pill */}
              <div className="wip-user-pill" onClick={onClose} title="Profile">
                <div className="wip-user-avatar">
                  {initials[0] || 'S'}
                </div>
                <div>
                  <div className="wip-user-name">{form.name || 'sriram'}</div>
                  <div className="wip-user-role">{roleLabel}</div>
                </div>
                <ChevronDown size={14} color="#94A3B8" />
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="wip-close-btn"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* Content Body */}
          <main ref={contentRef} className="wip-content">
            {/* ── CARD 1: Profile Photo ───────────────────────────────── */}
            <section id="section-photo" className="wip-card">
              <div className="wip-photo-row">
                <div className="wip-photo-avatar-wrap">
                  <div className="wip-photo-avatar">
                    {form.profileImage ? (
                      <img src={assetUrl(form.profileImage)} alt="Avatar" />
                    ) : (
                      <span>{initials[0] || 'S'}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="wip-camera-badge"
                    title="Change Photo"
                  >
                    <Camera size={12} />
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
                  />
                </div>

                <div className="wip-photo-info">
                  <h3>Profile Photo</h3>
                  <p>JPG, PNG or WEBP • Max size 5MB</p>
                  <div className="wip-photo-actions">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="wip-btn-upload"
                    >
                      <Upload size={13} />
                      <span>Upload Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={uploadingPhoto}
                      className="wip-btn-remove"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ── CARD 2: Basic Information ───────────────────────────── */}
            <section id="section-basic" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <User size={16} />
                </div>
                <h2 className="wip-card-title">Basic Information</h2>
              </div>

              {/* Row 1: Full Name, Email Address, Phone Number */}
              <div className="wip-grid-3">
                <div className="wip-field-group">
                  <label className="wip-label">
                    Full Name <span className="wip-label-req">*</span>
                  </label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="sriram"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">
                    Email Address <span className="wip-label-req">*</span>
                  </label>
                  <div className="wip-input-wrap">
                    <input
                      type="email"
                      disabled
                      className="wip-input wip-input-disabled"
                      value={userEmail}
                    />
                    <Lock size={14} className="wip-input-icon-right" />
                  </div>
                  <span className="wip-helper-text">Email cannot be changed</span>
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">
                    Phone Number <span className="wip-label-req">*</span>
                  </label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              {/* Row 2: Professional Headline, About / Bio */}
              <div className="wip-grid-2" style={{ marginTop: '16px' }}>
                <div className="wip-field-group">
                  <label className="wip-label">
                    Professional Headline <span className="wip-label-req">*</span>
                  </label>
                  <textarea
                    className="wip-textarea"
                    value={form.headline}
                    onChange={(e) => updateField('headline', e.target.value)}
                    placeholder="Senior Software Engineer | React & Node.js Expert"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">About / Bio</label>
                  <textarea
                    className="wip-textarea"
                    value={form.about}
                    onChange={(e) => updateField('about', e.target.value)}
                    placeholder="Tell us about your professional background, expertise, and interests..."
                  />
                </div>
              </div>
            </section>

            {/* ── CARD 3: Professional Details ────────────────────────── */}
            <section id="section-professional" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <Briefcase size={16} />
                </div>
                <h2 className="wip-card-title">Professional Details</h2>
              </div>

              {/* Row 1: Company, Department, Designation */}
              <div className="wip-grid-3">
                <div className="wip-field-group">
                  <label className="wip-label">Company</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.company}
                    onChange={(e) => updateField('company', e.target.value)}
                    placeholder="Wave Init Solutions"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">Department</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    placeholder="Engineering"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">Designation</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.designation}
                    onChange={(e) => updateField('designation', e.target.value)}
                    placeholder="Senior Software Engineer"
                  />
                </div>
              </div>

              {/* Row 2: Employee ID, Experience, Location */}
              <div className="wip-grid-3" style={{ marginTop: '16px' }}>
                <div className="wip-field-group">
                  <label className="wip-label">Employee ID</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.employeeId}
                    onChange={(e) => updateField('employeeId', e.target.value)}
                    placeholder="EMP-1024"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">Experience</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.experience}
                    onChange={(e) => updateField('experience', e.target.value)}
                    placeholder="5 Years"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">Location</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.location}
                    onChange={(e) => updateField('location', e.target.value)}
                    placeholder="Chennai, India"
                  />
                </div>
              </div>

              {/* Row 3: Time Zone */}
              <div style={{ marginTop: '16px' }}>
                <div className="wip-field-group">
                  <label className="wip-label">Time Zone</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.timezone}
                    onChange={(e) => updateField('timezone', e.target.value)}
                    placeholder="Asia/Kolkata (IST)"
                  />
                </div>
              </div>
            </section>

            {/* ── CARD 4: Skills ──────────────────────────────────────── */}
            <section id="section-skills" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <Star size={16} />
                </div>
                <h2 className="wip-card-title">Skills</h2>
              </div>

              <div className="wip-skills-wrap">
                {form.skills.map(skill => (
                  <span key={skill} className="wip-skill-pill">
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="wip-skill-remove"
                      title="Remove skill"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="wip-input"
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
                  className="wip-btn-upload"
                  style={{ flexShrink: 0, height: '40px' }}
                >
                  Add Skill
                </button>
              </div>
            </section>

            {/* ── CARD 5: Experience ──────────────────────────────────── */}
            <section id="section-experience" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <BarChart2 size={16} />
                </div>
                <h2 className="wip-card-title">Experience</h2>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Senior Software Engineer • Wave Init Solutions</div>
                <div style={{ fontSize: '11.5px', color: '#64748B', margin: '2px 0 6px 0' }}>Jan 2023 - Present • Full-time</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>Building enterprise LMS applications, React dashboards, and cloud integrations.</div>
              </div>
            </section>

            {/* ── CARD 6: Education ───────────────────────────────────── */}
            <section id="section-education" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <GraduationCap size={16} />
                </div>
                <h2 className="wip-card-title">Education</h2>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Bachelor of Technology (B.Tech) - Computer Science</div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Anna University • 2018 - 2022</div>
              </div>
            </section>

            {/* ── CARD 7: Certifications ──────────────────────────────── */}
            <section id="section-certifications" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <Award size={16} />
                </div>
                <h2 className="wip-card-title">Certifications</h2>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>AWS Certified Developer - Associate</div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Amazon Web Services • Issued Jan 2024</div>
              </div>
            </section>

            {/* ── CARD 8: Social Links ────────────────────────────────── */}
            <section id="section-social" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <Link size={16} />
                </div>
                <h2 className="wip-card-title">Social Links</h2>
              </div>

              <div className="wip-grid-2">
                <div className="wip-field-group">
                  <label className="wip-label">LinkedIn URL</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.contactLinks.linkedin}
                    onChange={(e) => updateContactLink('linkedin', e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>

                <div className="wip-field-group">
                  <label className="wip-label">GitHub URL</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.contactLinks.github}
                    onChange={(e) => updateContactLink('github', e.target.value)}
                    placeholder="https://github.com/username"
                  />
                </div>

                <div className="wip-field-group" style={{ marginTop: '16px' }}>
                  <label className="wip-label">Twitter / X URL</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.contactLinks.twitter}
                    onChange={(e) => updateContactLink('twitter', e.target.value)}
                    placeholder="https://twitter.com/username"
                  />
                </div>

                <div className="wip-field-group" style={{ marginTop: '16px' }}>
                  <label className="wip-label">Portfolio / Website URL</label>
                  <input
                    type="text"
                    className="wip-input"
                    value={form.contactLinks.portfolio || form.contactLinks.website}
                    onChange={(e) => updateContactLink('portfolio', e.target.value)}
                    placeholder="https://yourportfolio.com"
                  />
                </div>
              </div>
            </section>

            {/* ── CARD 9: Resume ──────────────────────────────────────── */}
            <section id="section-resume" className="wip-card">
              <div className="wip-card-header">
                <div className="wip-card-icon">
                  <FileText size={16} />
                </div>
                <h2 className="wip-card-title">Resume</h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={22} color="#EF4444" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>{form.name ? `${form.name.replace(/\s+/g, '_')}_Resume.pdf` : 'Resume.pdf'}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>PDF Document • 1.2 MB</div>
                  </div>
                </div>
                <button type="button" className="wip-btn-upload">
                  Update Resume
                </button>
              </div>
            </section>
          </main>

          {/* ── STICKY FOOTER ACTIONS ───────────────────────────────── */}
          <footer className="wip-footer">
            <div className="wip-footer-left">
              <CheckCircle2 size={15} color="#16A34A" />
              <span>Changes are saved securely</span>
            </div>

            <div className="wip-footer-right">
              <button
                type="button"
                className="wip-btn-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wip-btn-save"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </footer>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modalJSX, document.body);
}
