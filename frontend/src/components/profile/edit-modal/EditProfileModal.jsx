import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2 } from 'lucide-react';
import ProfilePhotoUploader from './ProfilePhotoUploader';
import BasicInformationSection from './BasicInformationSection';
import ProfessionalSection from './ProfessionalSection';
import ContactSection from './ContactSection';
import SkillsInput from './SkillsInput';
import ResumeUploader from './ResumeUploader';
import SocialLinksSection from './SocialLinksSection';
import ModalFooter from './ModalFooter';

const overlay = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modal = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 20 },
};

const SKILL_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'React', 'Vue.js', 'Angular', 'Node.js',
  'Python', 'Java', 'C++', 'Go', 'Rust', 'SQL', 'MongoDB',
  'AWS', 'Docker', 'Kubernetes', 'Git', 'REST APIs', 'GraphQL',
  'HTML/CSS', 'Tailwind CSS', 'Next.js', 'Express.js', 'Django',
  'Machine Learning', 'Data Science', 'DevOps', 'Agile', 'Scrum',
];

export default function EditProfileModal({ open, onClose, profile, onSave }) {
  const [form, setForm] = useState({
    name: '',
    headline: '',
    about: '',
    phone: '',
    location: '',
    company: '',
    department: '',
    designation: '',
    experience: '',
    timezone: '',
    language: '',
    skills: [],
    contactLinks: {
      linkedin: '',
      github: '',
      portfolio: '',
      website: '',
      twitter: '',
      youtube: '',
      instagram: '',
    },
  });
  const [saving, setSaving] = useState(false);
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.user?.name || '',
        headline: profile.headline || '',
        about: profile.about || '',
        phone: profile.phone || '',
        location: profile.location || '',
        company: profile.company || '',
        department: profile.department || '',
        designation: profile.designation || '',
        experience: profile.experience || '',
        timezone: profile.timezone || '',
        language: profile.language || '',
        skills: profile.skills?.map(s => s.skill || s.name) || [],
        contactLinks: {
          linkedin: profile.contactLinks?.linkedin || '',
          github: profile.contactLinks?.github || '',
          portfolio: profile.contactLinks?.portfolio || '',
          website: profile.contactLinks?.website || '',
          twitter: profile.contactLinks?.twitter || '',
          youtube: profile.contactLinks?.youtube || '',
          instagram: profile.contactLinks?.instagram || '',
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
      previousFocusRef.current = document.activeElement;
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (open && modalRef.current) {
      modalRef.current.focus();
    }
    if (!open && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [open]);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateContactLink = (field, value) => {
    setForm(prev => ({
      ...prev,
      contactLinks: { ...prev.contactLinks, [field]: value },
    }));
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

  return (
    <AnimatePresence>
      <motion.div
        variants={overlay}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          ref={modalRef}
          tabIndex={-1}
          variants={modal}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-white rounded-3xl shadow-2xl flex flex-col outline-none"
          style={{
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sticky Header */}
          <div
            className="flex items-center justify-between px-8 py-6 border-b border-slate-100"
            style={{ borderBottomWidth: '1px', borderBottomColor: '#E5E7EB' }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #10B981, #22C55E)' }}
              >
                <Save size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  Edit Profile
                </h2>
                <p className="text-sm text-slate-500">Update your professional information</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-8">
              {/* Photo Uploader */}
              <ProfilePhotoUploader
                profile={profile}
                onAvatarUpdate={(path) => updateField('profileImage', path)}
              />

              {/* Basic Information */}
              <BasicInformationSection
                name={form.name}
                headline={form.headline}
                about={form.about}
                onNameChange={(v) => updateField('name', v)}
                onHeadlineChange={(v) => updateField('headline', v)}
                onAboutChange={(v) => updateField('about', v)}
              />

              {/* Professional Information */}
              <ProfessionalSection
                company={form.company}
                department={form.department}
                designation={form.designation}
                experience={form.experience}
                location={form.location}
                timezone={form.timezone}
                language={form.language}
                onCompanyChange={(v) => updateField('company', v)}
                onDepartmentChange={(v) => updateField('department', v)}
                onDesignationChange={(v) => updateField('designation', v)}
                onExperienceChange={(v) => updateField('experience', v)}
                onLocationChange={(v) => updateField('location', v)}
                onTimezoneChange={(v) => updateField('timezone', v)}
                onLanguageChange={(v) => updateField('language', v)}
              />

              {/* Contact Information */}
              <ContactSection
                phone={form.phone}
                email={profile?.user?.email || ''}
                onPhoneChange={(v) => updateField('phone', v)}
              />

              {/* Skills */}
              <SkillsInput
                skills={form.skills}
                suggestions={SKILL_SUGGESTIONS}
                onChange={(v) => updateField('skills', v)}
              />

              {/* Social Links */}
              <SocialLinksSection
                contactLinks={form.contactLinks}
                onChange={updateContactLink}
              />

              {/* Resume */}
              <ResumeUploader profile={profile} />
            </div>
          </div>

          {/* Sticky Footer */}
          <ModalFooter
            onCancel={onClose}
            onSave={handleSave}
            saving={saving}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
