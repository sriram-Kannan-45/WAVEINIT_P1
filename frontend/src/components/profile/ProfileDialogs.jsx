import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, FileText, Trash2, Camera, AlertTriangle,
  Sparkles, Check, Briefcase, GraduationCap, Award, Globe,
  User, Plus, Info, ExternalLink, Link as LinkIcon, ChevronDown,
  Calendar, Zap
} from 'lucide-react';
import profileService from '../../services/profileService';
import { assetUrl } from '../../api/api';
import toast from 'react-hot-toast';
import { getTwoLetterInitials } from '../common/UserAvatar';
import './ProfileDialogs.css';

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0 }
};

const SKILL_SUGGESTIONS = [
  'React', 'JavaScript', 'TypeScript', 'Node.js', 'Express.js', 'Python',
  'Java', 'Spring Boot', 'SQL', 'PostgreSQL', 'MongoDB', 'HTML5', 'CSS3',
  'TailwindCSS', 'Git', 'Docker', 'AWS', 'Selenium', 'Playwright', 'JMeter'
];

/**
 * Standardized Shared Profile Modal Shell
 */
function ProfileSectionModal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = 'md', // 'sm' | 'md' | 'lg'
  children,
  footer
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="pfd-backdrop"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        onClick={onClose}
      >
        <motion.div
          className={`pfd-modal pfd-modal--${size}`}
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="pfd-header">
            <div className="pfd-header-left">
              {Icon && (
                <div className="pfd-icon-box">
                  <Icon size={20} color="#16A34A" />
                </div>
              )}
              <div className="pfd-title-wrap">
                <h3 className="pfd-title">{title}</h3>
                {subtitle && <p className="pfd-subtitle">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              className="pfd-close-btn"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="pfd-body">
            {children}
          </div>

          {/* Fixed Footer */}
          {footer && (
            <div className="pfd-footer">
              {footer}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── 1. ADD / EDIT SKILL DIALOG ───────────────────────────────────
export function AddSkillDialog({ open, onClose, onSave, existingSkills = [] }) {
  const [skillName, setSkillName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSkillName('');
      setErrorMsg('');
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = skillName.trim();
    if (!trimmed) {
      setErrorMsg('Skill name is required.');
      return;
    }

    const alreadyHas = existingSkills.some(
      s => (typeof s === 'string' ? s : s.skill || s.name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (alreadyHas) {
      setErrorMsg(`"${trimmed}" is already in your skills list.`);
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      await onSave(trimmed);
      toast.success(`Skill "${trimmed}" added successfully`);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add skill. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentNames = existingSkills.map(
    s => (typeof s === 'string' ? s : s.skill || s.name || '').toLowerCase()
  );
  const suggestions = SKILL_SUGGESTIONS.filter(s => !currentNames.includes(s.toLowerCase()));

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title="Add Skill"
      subtitle="Add a skill to your professional profile."
      icon={Zap}
      size="sm"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !skillName.trim()}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Adding...
              </>
            ) : (
              'Add Skill'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="pfd-field">
        <label className="pfd-label">
          <span>Skill Name <span className="pfd-required">*</span></span>
        </label>
        <input
          type="text"
          className="pfd-input"
          placeholder="e.g. React, JavaScript, SQL, Docker"
          value={skillName}
          onChange={(e) => {
            setSkillName(e.target.value);
            if (errorMsg) setErrorMsg('');
          }}
          autoFocus
        />
        {errorMsg && <div className="pfd-error-msg">{errorMsg}</div>}

        {suggestions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B' }}>
              Suggested Skills:
            </span>
            <div className="pfd-chips-wrap">
              {suggestions.slice(0, 10).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setSkillName(s);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className="pfd-chip"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </ProfileSectionModal>
  );
}

// ── 2. ADD / EDIT EDUCATION DIALOG ──────────────────────────────
export function AddEducationDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({ institution: '', degree: '', department: '', year: '', cgpa: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        institution: editData.institution || '',
        degree: editData.degree || '',
        department: editData.department || '',
        year: editData.year || '',
        cgpa: editData.cgpa || '',
      });
    } else {
      setForm({ institution: '', degree: '', department: '', year: '', cgpa: '' });
    }
    setErrors({});
  }, [editData, open]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const newErrors = {};
    if (!form.institution.trim()) newErrors.institution = 'Institution is required.';
    if (!form.degree.trim()) newErrors.degree = 'Degree is required.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      await onSave(form, editData?.id);
      toast.success(editData ? 'Education updated successfully' : 'Education added successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save education details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title={editData ? 'Edit Education' : 'Add Education'}
      subtitle={editData ? 'Update your academic background details.' : 'Add your academic background.'}
      icon={GraduationCap}
      size="md"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : editData ? (
              'Save Changes'
            ) : (
              'Add Education'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-field">
          <label className="pfd-label">
            <span>Institution / University <span className="pfd-required">*</span></span>
          </label>
          <input
            className="pfd-input"
            placeholder="e.g. Anna University, IIT Madras"
            value={form.institution}
            onChange={(e) => {
              setForm({ ...form, institution: e.target.value });
              if (errors.institution) setErrors({ ...errors, institution: '' });
            }}
            autoFocus
          />
          {errors.institution && <div className="pfd-error-msg">{errors.institution}</div>}
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Degree <span className="pfd-required">*</span></span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Bachelor of Technology (B.Tech)"
              value={form.degree}
              onChange={(e) => {
                setForm({ ...form, degree: e.target.value });
                if (errors.degree) setErrors({ ...errors, degree: '' });
              }}
            />
            {errors.degree && <div className="pfd-error-msg">{errors.degree}</div>}
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Field of Study</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Computer Science & Engineering"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Year Range</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. 2018 - 2022"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>CGPA / Percentage</span>
            </label>
            <input
              className="pfd-input"
              type="number"
              step="0.01"
              min="0"
              max="10"
              placeholder="e.g. 8.75"
              value={form.cgpa}
              onChange={(e) => setForm({ ...form, cgpa: e.target.value })}
            />
          </div>
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 3. ADD / EDIT EXPERIENCE DIALOG ─────────────────────────────
export function AddExperienceDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({
    company: '', role: '', employmentType: 'FULL_TIME', location: '',
    startDate: '', endDate: '', currentlyWorking: false, description: ''
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        company: editData.company || '',
        role: editData.role || '',
        employmentType: editData.employmentType || 'FULL_TIME',
        location: editData.location || '',
        startDate: editData.startDate?.split('T')[0] || '',
        endDate: editData.endDate?.split('T')[0] || '',
        currentlyWorking: !!editData.currentlyWorking,
        description: editData.description || ''
      });
    } else {
      setForm({
        company: '', role: '', employmentType: 'FULL_TIME', location: '',
        startDate: '', endDate: '', currentlyWorking: false, description: ''
      });
    }
    setErrors({});
  }, [editData, open]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const newErrors = {};
    if (!form.company.trim()) newErrors.company = 'Company name is required.';
    if (!form.role.trim()) newErrors.role = 'Role / Title is required.';
    if (!form.startDate) newErrors.startDate = 'Start date is required.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      await onSave(form, editData?.id);
      toast.success(editData ? 'Experience updated successfully' : 'Experience added successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save experience.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title={editData ? 'Edit Experience' : 'Add Experience'}
      subtitle={editData ? 'Update your professional experience.' : 'Add your professional experience to your profile.'}
      icon={Briefcase}
      size="lg"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : editData ? (
              'Save Changes'
            ) : (
              'Add Experience'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Company / Organization <span className="pfd-required">*</span></span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Wave Init Solutions"
              value={form.company}
              onChange={(e) => {
                setForm({ ...form, company: e.target.value });
                if (errors.company) setErrors({ ...errors, company: '' });
              }}
              autoFocus
            />
            {errors.company && <div className="pfd-error-msg">{errors.company}</div>}
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Role / Job Title <span className="pfd-required">*</span></span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Trainee Software Engineer"
              value={form.role}
              onChange={(e) => {
                setForm({ ...form, role: e.target.value });
                if (errors.role) setErrors({ ...errors, role: '' });
              }}
            />
            {errors.role && <div className="pfd-error-msg">{errors.role}</div>}
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Employment Type</span>
            </label>
            <div className="pfd-select-wrap">
              <select
                className="pfd-select"
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
              >
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="INTERNSHIP">Internship</option>
                <option value="CONTRACT">Contract</option>
                <option value="FREELANCE">Freelance</option>
                <option value="SELF_EMPLOYED">Self-employed</option>
              </select>
              <ChevronDown size={16} className="pfd-select-arrow" />
            </div>
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Location</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Chennai, India / Remote"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Start Date <span className="pfd-required">*</span></span>
            </label>
            <input
              type="date"
              className="pfd-input"
              value={form.startDate}
              onChange={(e) => {
                setForm({ ...form, startDate: e.target.value });
                if (errors.startDate) setErrors({ ...errors, startDate: '' });
              }}
            />
            {errors.startDate && <div className="pfd-error-msg">{errors.startDate}</div>}
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>End Date</span>
            </label>
            <input
              type="date"
              className={`pfd-input ${form.currentlyWorking ? 'pfd-input--readonly' : ''}`}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              disabled={form.currentlyWorking}
            />
          </div>
        </div>

        <label className="pfd-checkbox-label">
          <input
            type="checkbox"
            className="pfd-checkbox"
            checked={form.currentlyWorking}
            onChange={(e) => setForm({
              ...form,
              currentlyWorking: e.target.checked,
              endDate: e.target.checked ? '' : form.endDate
            })}
          />
          <span>Currently working here</span>
        </label>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>Description</span>
          </label>
          <textarea
            className="pfd-textarea"
            rows={3}
            placeholder="Tell us about your role, projects, and technologies used..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 4. ADD / EDIT PROJECT DIALOG ────────────────────────────────
export function AddProjectDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({ title: '', techStack: '', description: '', github: '', liveDemo: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        title: editData.title || '',
        techStack: editData.techStack || '',
        description: editData.description || '',
        github: editData.github || '',
        liveDemo: editData.liveDemo || '',
      });
    } else {
      setForm({ title: '', techStack: '', description: '', github: '', liveDemo: '' });
    }
    setErrors({});
  }, [editData, open]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) {
      setErrors({ title: 'Project title is required.' });
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      await onSave(form, editData?.id);
      toast.success(editData ? 'Project updated successfully' : 'Project added successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title={editData ? 'Edit Project' : 'Add Project'}
      subtitle={editData ? 'Update your project details.' : 'Showcase a project you built or contributed to.'}
      icon={Briefcase}
      size="md"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : editData ? (
              'Save Changes'
            ) : (
              'Add Project'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-field">
          <label className="pfd-label">
            <span>Project Title <span className="pfd-required">*</span></span>
          </label>
          <input
            className="pfd-input"
            placeholder="e.g. E-Commerce Microservices Platform"
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value });
              if (errors.title) setErrors({});
            }}
            autoFocus
          />
          {errors.title && <div className="pfd-error-msg">{errors.title}</div>}
        </div>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>Technologies / Skills</span>
          </label>
          <input
            className="pfd-input"
            placeholder="e.g. React, Node.js, Express, MongoDB, Tailwind"
            value={form.techStack}
            onChange={(e) => setForm({ ...form, techStack: e.target.value })}
          />
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>GitHub Repository URL</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://github.com/..."
              value={form.github}
              onChange={(e) => setForm({ ...form, github: e.target.value })}
            />
          </div>
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Live Demo URL</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://myproject.dev"
              value={form.liveDemo}
              onChange={(e) => setForm({ ...form, liveDemo: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>Description</span>
          </label>
          <textarea
            className="pfd-textarea"
            rows={3}
            placeholder="Brief overview of features, architecture, and responsibilities..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 5. ADD / EDIT CERTIFICATE DIALOG ────────────────────────────
export function AddCertificateDialog({ open, onClose, onSave, editData }) {
  const [form, setForm] = useState({
    title: '', issuer: '', credentialId: '', issueDate: '', expiryDate: '', verificationUrl: ''
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        title: editData.title || '',
        issuer: editData.issuer || '',
        credentialId: editData.credentialId || '',
        issueDate: editData.issueDate?.split('T')[0] || '',
        expiryDate: editData.expiryDate?.split('T')[0] || '',
        verificationUrl: editData.verificationUrl || ''
      });
    } else {
      setForm({ title: '', issuer: '', credentialId: '', issueDate: '', expiryDate: '', verificationUrl: '' });
    }
    setFile(null);
    setErrors({});
  }, [editData, open]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) {
      setErrors({ title: 'Certificate title is required.' });
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (file) fd.append('certificate', file);

      await onSave(fd, editData?.id);
      toast.success(editData ? 'Certificate updated successfully' : 'Certificate added successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save certificate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title={editData ? 'Edit Certificate' : 'Add Certificate'}
      subtitle={editData ? 'Update your certification details.' : 'Add your certification details to your professional profile.'}
      icon={Award}
      size="lg"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : editData ? (
              'Save Changes'
            ) : (
              'Add Certificate'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-field">
          <label className="pfd-label">
            <span>Certificate Title <span className="pfd-required">*</span></span>
          </label>
          <input
            className="pfd-input"
            placeholder="e.g. Full Stack Web Developer"
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value });
              if (errors.title) setErrors({});
            }}
            autoFocus
          />
          {errors.title && <div className="pfd-error-msg">{errors.title}</div>}
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Issuer</span>
            </label>
            <input
              className="pfd-input"
              placeholder="Google, AWS, Microsoft, Wave Init..."
              value={form.issuer}
              onChange={(e) => setForm({ ...form, issuer: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Credential ID</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. CERT-2026-9812"
              value={form.credentialId}
              onChange={(e) => setForm({ ...form, credentialId: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Issue Date</span>
            </label>
            <input
              type="date"
              className="pfd-input"
              value={form.issueDate}
              onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Expiry Date</span>
            </label>
            <input
              type="date"
              className="pfd-input"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>Verification URL</span>
          </label>
          <input
            className="pfd-input"
            placeholder="https://verify.certificate.com/..."
            value={form.verificationUrl}
            onChange={(e) => setForm({ ...form, verificationUrl: e.target.value })}
          />
        </div>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>Certificate File</span>
          </label>
          {file ? (
            <div className="pfd-file-selected">
              <div className="pfd-file-left">
                <FileText size={20} color="#16A34A" />
                <div>
                  <div className="pfd-file-name">{file.name}</div>
                  <div className="pfd-file-ready">✓ Ready to upload</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }}
                title="Remove file"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="pfd-dropzone">
              <div className="pfd-dropzone-icon-wrap">
                <Upload size={20} />
              </div>
              <div>
                <div className="pfd-dropzone-title">Upload certificate file</div>
                <div className="pfd-dropzone-hint">PDF, JPG, PNG · Maximum 5 MB</div>
              </div>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 6. RESUME UPLOAD DIALOG ─────────────────────────────────────
export function ResumeUploadDialog({ open, onClose, currentResume, onSave }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) setFile(null);
  }, [open]);

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a resume file');
      return;
    }

    try {
      setUploading(true);
      await profileService.uploadResume(file);
      toast.success('Resume uploaded successfully');
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title="Update Resume"
      subtitle="Upload your latest resume in PDF or DOCX format."
      icon={FileText}
      size="sm"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <span className="pfd-spinner" /> Uploading...
              </>
            ) : (
              'Upload Resume'
            )}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {currentResume && !file && (
          <div className="pfd-file-selected" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
            <div className="pfd-file-left">
              <FileText size={20} color="#DC2626" />
              <div>
                <div className="pfd-file-name">{currentResume.split('/').pop() || 'Current Resume'}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Active resume on your profile</div>
              </div>
            </div>
          </div>
        )}

        {file ? (
          <div className="pfd-file-selected">
            <div className="pfd-file-left">
              <FileText size={20} color="#16A34A" />
              <div>
                <div className="pfd-file-name">{file.name}</div>
                <div className="pfd-file-ready">✓ Ready to upload</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }}
              title="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="pfd-dropzone">
            <div className="pfd-dropzone-icon-wrap">
              <Upload size={20} />
            </div>
            <div>
              <div className="pfd-dropzone-title">Drag & drop your resume here</div>
              <div className="pfd-dropzone-hint">PDF or DOCX · Maximum 5 MB</div>
            </div>
            <input
              type="file"
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        )}
      </div>
    </ProfileSectionModal>
  );
}

// ── 7. PROFILE PHOTO / AVATAR DIALOG ────────────────────────────
export function ProfilePhotoDialog({ open, onClose, currentPhoto, userName, onSave, onDelete }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
    }
  }, [open]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      await profileService.uploadAvatar(file);
      toast.success('Profile photo updated successfully');
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update profile photo');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setUploading(true);
      await profileService.deleteAvatar();
      toast.success('Profile photo removed');
      onDelete?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to remove photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title="Update Profile Photo"
      subtitle="Upload a new avatar photo for your LMS profile."
      icon={Camera}
      size="sm"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {currentPhoto ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={uploading}
              style={{
                fontSize: 12, fontWeight: 600, color: '#DC2626', background: 'none',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <Trash2 size={13} /> Remove Photo
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="pfd-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="pfd-btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                <>
                  <span className="pfd-spinner" /> Saving...
                </>
              ) : (
                'Save Photo'
              )}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{
          width: 90, height: 90, borderRadius: '50%', border: '2.5px solid #16A34A',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
        }}>
          {preview ? (
            <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : currentPhoto ? (
            <img
              src={currentPhoto.startsWith('http') ? currentPhoto : assetUrl(currentPhoto)}
              alt={userName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 28, fontWeight: 700, color: '#16A34A' }}>
              {getTwoLetterInitials(userName || 'User')}
            </span>
          )}
        </div>

        <div>
          <label
            className="pfd-btn-cancel"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', height: 38 }}
          >
            <Camera size={14} color="#16A34A" /> Choose Image
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
          <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 6 }}>
            JPG, PNG, WebP · Maximum 5 MB
          </div>
        </div>
      </div>
    </ProfileSectionModal>
  );
}

// ── 8. EDIT PERSONAL INFORMATION DIALOG ─────────────────────────
export function EditPersonalInfoDialog({ open, onClose, profile, user, onSave }) {
  const [form, setForm] = useState({
    name: '', phone: '', department: '', designation: '', about: ''
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: profile?.user?.name || user?.name || '',
        phone: profile?.phone || '',
        department: profile?.department || '',
        designation: profile?.designation || profile?.headline || '',
        about: profile?.about || '',
      });
      setErrors({});
    }
  }, [open, profile, user]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'Full name is required.' });
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      await onSave(form);
      toast.success('Personal information updated successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update personal information');
    } finally {
      setSubmitting(false);
    }
  };

  const email = profile?.user?.email || user?.email || '';
  const participantId = profile?.studentId || profile?.employeeId || 'PAR-1048';

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title="Edit Personal Information"
      subtitle="Update your personal details and bio."
      icon={User}
      size="md"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-field">
          <label className="pfd-label">
            <span>Full Name <span className="pfd-required">*</span></span>
          </label>
          <input
            className="pfd-input"
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              if (errors.name) setErrors({});
            }}
            required
            autoFocus
          />
          {errors.name && <div className="pfd-error-msg">{errors.name}</div>}
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Email Address</span>
              <span className="pfd-readonly-tag">Cannot be changed</span>
            </label>
            <input className="pfd-input pfd-input--readonly" value={email} disabled />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Participant ID</span>
              <span className="pfd-readonly-tag">Read-only</span>
            </label>
            <input className="pfd-input pfd-input--readonly" value={participantId} disabled />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Phone Number</span>
            </label>
            <input
              className="pfd-input"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Department</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Software Development"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>Designation</span>
          </label>
          <input
            className="pfd-input"
            placeholder="e.g. Trainee Software Engineer"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
          />
        </div>

        <div className="pfd-field">
          <label className="pfd-label">
            <span>About Me</span>
          </label>
          <textarea
            className="pfd-textarea"
            rows={3}
            placeholder="Brief bio or professional summary..."
            value={form.about}
            onChange={(e) => setForm({ ...form, about: e.target.value })}
          />
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 9. EDIT PROFESSIONAL INFORMATION DIALOG ─────────────────────
export function EditProfessionalInfoDialog({ open, onClose, profile, onSave }) {
  const [form, setForm] = useState({
    company: '', department: '', designation: '', headline: '', location: '', timezone: '', language: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        company: profile?.company || '',
        department: profile?.department || '',
        designation: profile?.designation || '',
        headline: profile?.headline || '',
        location: profile?.location || profile?.address || '',
        timezone: profile?.timezone || 'Asia/Kolkata (IST)',
        language: profile?.language || 'English',
      });
    }
  }, [open, profile]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    try {
      setSubmitting(true);
      await onSave(form);
      toast.success('Professional information updated successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update professional information');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title="Edit Professional Information"
      subtitle="Update your career details and work preferences."
      icon={Briefcase}
      size="md"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-field">
          <label className="pfd-label">
            <span>Professional Headline</span>
          </label>
          <input
            className="pfd-input"
            placeholder="e.g. Full Stack Developer | React & Node.js Enthusiast"
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            autoFocus
          />
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Company / Organization</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Wave Init Solutions"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Department</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Software Development"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Designation / Role</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Trainee Software Engineer"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Location</span>
            </label>
            <input
              className="pfd-input"
              placeholder="e.g. Chennai, India"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Time Zone</span>
            </label>
            <input
              className="pfd-input"
              placeholder="Asia/Kolkata (IST)"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Language</span>
            </label>
            <input
              className="pfd-input"
              placeholder="English"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            />
          </div>
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 10. EDIT SOCIAL LINKS DIALOG ────────────────────────────────
export function EditContactDialog({ open, onClose, onSave, contactLinks, socialLinks }) {
  const [form, setForm] = useState({
    linkedin: '', github: '', twitter: '', instagram: '', portfolio: '', website: '', youtube: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const merged = { ...(socialLinks || {}), ...(contactLinks || {}) };
      setForm({
        linkedin: merged.linkedin || '',
        github: merged.github || '',
        twitter: merged.twitter || '',
        instagram: merged.instagram || '',
        portfolio: merged.portfolio || '',
        website: merged.website || '',
        youtube: merged.youtube || '',
      });
    }
  }, [open, contactLinks, socialLinks]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    try {
      setSubmitting(true);
      await onSave(form);
      toast.success('Social links updated successfully');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update social links');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title="Edit Social Links"
      subtitle="Connect your professional profiles and portfolios."
      icon={Globe}
      size="md"
      footer={
        <>
          <button type="button" className="pfd-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="pfd-spinner" /> Saving...
              </>
            ) : (
              'Save Links'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>LinkedIn URL</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://linkedin.com/in/..."
              value={form.linkedin}
              onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>GitHub URL</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://github.com/..."
              value={form.github}
              onChange={(e) => setForm({ ...form, github: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Twitter / X</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://twitter.com/..."
              value={form.twitter}
              onChange={(e) => setForm({ ...form, twitter: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Instagram</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://instagram.com/..."
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
          </div>
        </div>

        <div className="pfd-grid-2">
          <div className="pfd-field">
            <label className="pfd-label">
              <span>Portfolio Website</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://myportfolio.dev"
              value={form.portfolio}
              onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
            />
          </div>

          <div className="pfd-field">
            <label className="pfd-label">
              <span>Personal Website / Blog</span>
            </label>
            <input
              className="pfd-input"
              placeholder="https://mywebsite.com"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
        </div>
      </form>
    </ProfileSectionModal>
  );
}

// ── 11. REUSABLE CONFIRM DELETE DIALOG ──────────────────────────
export function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm Deletion',
  message = 'Are you sure you want to delete this item? This action cannot be undone.',
  itemName = '',
  loading = false
}) {
  return (
    <ProfileSectionModal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="This action cannot be undone."
      icon={AlertTriangle}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="pfd-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pfd-btn-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="pfd-spinner" /> Deleting...
              </>
            ) : (
              <>
                <Trash2 size={14} /> Delete
              </>
            )}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
        {message}{' '}
        {itemName && (
          <strong style={{ color: '#0F172A', display: 'block', marginTop: 4 }}>
            "{itemName}"
          </strong>
        )}
      </div>
    </ProfileSectionModal>
  );
}
