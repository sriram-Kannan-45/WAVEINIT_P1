import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  User, Edit3, Mail, Phone, Briefcase, GraduationCap,
  Award, BookOpen, Plus, CheckCircle2, Share2, FileText, CheckSquare, X, Calendar, Zap,
  Download, ExternalLink, Camera, Globe, ArrowLeft, Trash2, Pencil, AlertCircle, Link as LinkIcon
} from 'lucide-react';
import profileService from '../../services/profileService';
import { assetUrl } from '../../api/api';
import ProfileSkeleton from '../../components/profile/ProfileSkeleton';
import LearningActivityHeatmap from '../../components/profile/LearningActivityHeatmap';
import ActivitySummaryCard from '../../components/profile/ActivitySummaryCard';
import {
  AddSkillDialog, AddExperienceDialog, AddEducationDialog,
  AddCertificateDialog, AddProjectDialog, EditContactDialog, ResumeUploadDialog,
  ProfilePhotoDialog, EditPersonalInfoDialog, EditProfessionalInfoDialog, ConfirmDeleteDialog
} from '../../components/profile/ProfileDialogs';
import { EditProfileModal } from '../../components/profile/edit-modal';
import { getTwoLetterInitials } from '../../components/common/UserAvatar';

const ROLE_HOME = {
  ADMIN: '/admin',
  TRAINER: '/trainer',
  PARTICIPANT: '/participant',
};

const initials = (name) => getTwoLetterInitials(name);
const fmtMonthYear = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Aug 2026';

const LinkedinIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0077b5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const GithubIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const TwitterIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1da1f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
  </svg>
);

const InstagramIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const calcProfileCompletion = (profile, user, serverCompletion) => {
  if (serverCompletion && typeof serverCompletion === 'object' && typeof serverCompletion.pct === 'number') {
    return serverCompletion;
  }
  let count = 0;
  const total = 8;

  if ((user?.name || profile?.user?.name || profile?.name) && (profile?.headline || profile?.designation || profile?.department)) count++;
  if (user?.profilePic || profile?.user?.profilePic || profile?.profileImage || profile?.imagePath) count++;
  if ((user?.email || profile?.user?.email || profile?.email) && (profile?.phone || user?.phone)) count++;
  if (profile?.about && profile.about.trim().length > 0) count++;
  if (profile?.company || profile?.location || profile?.address || profile?.employeeId) count++;
  if ((profile?.skills && profile.skills.length > 0) || (profile?.skillsList && profile.skillsList.length > 0)) count++;
  if ((profile?.experiences && profile.experiences.length > 0) || (profile?.educations && profile.educations.length > 0) || (profile?.projects && profile.projects.length > 0)) count++;
  if (profile?.resume || (profile?.certificates && profile.certificates.length > 0) || (profile?.contactLinks && Object.values(profile.contactLinks).some(Boolean)) || profile?.socialLinks) count++;

  const pct = Math.min(100, Math.round((count / total) * 100));
  return { pct, count, total };
};

export default function ProfilePage({ user }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({});
  const [completion, setCompletion] = useState({ pct: 25, count: 2, total: 8 });
  const [heatmapDays, setHeatmapDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Section-specific Dialogs state
  const [dialogs, setDialogs] = useState({
    edit: false,
    skill: false,
    experience: false,
    project: false,
    education: false,
    certificate: false,
    resume: false,
    photo: false,
    personal: false,
    professional: false,
    contact: false,
  });

  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleBackToDashboard = () => {
    const home = ROLE_HOME[user?.role] || '/admin';
    navigate(home, { state: { tab: 'overview' } });
  };

  const fetchProfile = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileService.getMyProfile(signal);
      if (data && data.profile) {
        setProfile(data.profile);
        setStats(data.stats || {});
        const comp = calcProfileCompletion(data.profile, user, data.completion);
        setCompletion(comp);
        setError(null);
      } else {
        throw new Error('Profile information could not be retrieved.');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load profile:', err.message);
      setError(err.message || 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProfile(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchProfile]);

  const openDialog = (key, item = null) => {
    setEditItem(item);
    setDialogs(d => ({ ...d, [key]: true }));
  };

  const closeDialog = (key) => {
    setDialogs(d => ({ ...d, [key]: false }));
    setEditItem(null);
  };

  // Section-specific API Handlers
  const handleSaveSkill = async (skillName) => {
    await profileService.addSkill(skillName);
    await fetchProfile();
  };

  const handleSaveEducation = async (formData, id) => {
    if (id) await profileService.updateEducation(id, formData);
    else await profileService.addEducation(formData);
    await fetchProfile();
  };

  const handleSaveExperience = async (formData, id) => {
    if (id) await profileService.updateExperience(id, formData);
    else await profileService.addExperience(formData);
    await fetchProfile();
  };

  const handleSaveProject = async (formData, id) => {
    if (id) await profileService.updateProject(id, formData);
    else await profileService.addProject(formData);
    await fetchProfile();
  };

  const handleSaveCertificate = async (formData, id) => {
    if (id) await profileService.updateCertificate(id, formData);
    else await profileService.addCertificate(formData);
    await fetchProfile();
  };

  const handleSavePersonal = async (formData) => {
    await profileService.updateProfile(formData);
    await fetchProfile();
  };

  const handleSaveProfessional = async (formData) => {
    await profileService.updateProfile(formData);
    await fetchProfile();
  };

  const handleSaveContact = async (formData) => {
    await profileService.updateContactLinks(formData);
    await fetchProfile();
  };

  const handleSaveFullProfile = async (data) => {
    try {
      const { skills, contactLinks, ...profileData } = data;
      await profileService.updateProfile(profileData);
      if (contactLinks) await profileService.updateContactLinks(contactLinks);
      toast.success('Profile updated');
      fetchProfile();
    } catch {
      toast.error('Failed to update profile');
    }
  };

  // Delete Handler with Confirmation
  const confirmDeleteAction = (type, id, name) => {
    setDeleteTarget({ type, id, name });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const { type, id, name } = deleteTarget;

      if (type === 'skill') {
        await profileService.deleteSkill(id);
        toast.success(`Skill "${name || 'item'}" removed`);
      } else if (type === 'education') {
        await profileService.deleteEducation(id);
        toast.success('Education removed');
      } else if (type === 'experience') {
        await profileService.deleteExperience(id);
        toast.success('Experience removed');
      } else if (type === 'project') {
        await profileService.deleteProject(id);
        toast.success('Project removed');
      } else if (type === 'certificate') {
        await profileService.deleteCertificate(id);
        toast.success('Certificate removed');
      } else if (type === 'resume') {
        await profileService.deleteResume();
        toast.success('Resume removed');
      }

      await fetchProfile();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete item');
    } finally {
      setDeleting(false);
    }
  };

  const handleShareProfile = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Profile link copied to clipboard!');
  };

  if (loading) return <ProfileSkeleton />;

  if (error && !profile) {
    return (
      <div className="reg-admin" style={{ paddingBottom: 24, maxWidth: 1280, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 20,
          padding: '60px 24px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          minHeight: 380,
        }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF2F2', display: 'grid', placeItems: 'center', color: '#EF4444' }}>
            <AlertCircle size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Unable to Load Profile</h3>
            <p style={{ fontSize: 13, color: '#64748B', maxWidth: 440, margin: '6px auto 0', lineHeight: 1.5 }}>
              {error || 'We encountered a connection issue while fetching your profile information.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={handleBackToDashboard}
              style={{ height: 40, padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={15} /> Back to Dashboard
            </button>
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--primary"
              onClick={() => fetchProfile()}
              style={{ height: 40, padding: '0 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const participantName = profile?.user?.name || user?.name || 'sriram';
  const participantEmail = profile?.user?.email || user?.email || 'titooram123@gmail.com';
  const joinedDate = fmtMonthYear(profile?.createdAt || user?.createdAt || profile?.user?.created_at);
  const userRole = (user?.role || 'PARTICIPANT').toUpperCase();
  const profilePhotoUrl = profile?.profileImage || profile?.user?.profilePic || user?.profilePic;

  const userSkills = Array.isArray(profile?.skills) && profile.skills.length > 0 ? profile.skills : [];
  const userExperiences = Array.isArray(profile?.experiences) && profile.experiences.length > 0 ? profile.experiences : [];
  const userProjects = Array.isArray(profile?.projects) && profile.projects.length > 0 ? profile.projects : [];
  const userEducations = Array.isArray(profile?.educations) && profile.educations.length > 0 ? profile.educations : [];
  const userCertificates = Array.isArray(profile?.certificates) && profile.certificates.length > 0 ? profile.certificates : [];

  return (
    <div className="reg-admin" style={{ paddingBottom: 24, maxWidth: 1280, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
      
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="reg-admin-header" style={{ marginBottom: 16 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center' }}>
          <User size={22} color="#16A34A" />
        </div>
        <div>
          <h2 className="reg-admin-title" style={{ fontSize: 20, fontWeight: 700 }}>My Profile</h2>
          <p className="reg-admin-subtitle" style={{ fontSize: 12 }}>View and manage your professional profile and information</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--secondary"
            onClick={handleBackToDashboard}
            style={{ height: 38, padding: '0 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={14} color="#16A34A" /> Back to Dashboard
          </button>
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--primary"
            onClick={() => openDialog('edit')}
            style={{ height: 38, padding: '0 18px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16A34A' }}
          >
            <Edit3 size={14} /> Edit Profile
          </button>
        </div>
      </div>

      {/* ── Profile Summary Banner Card ─────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        padding: '18px 24px', background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
        borderRadius: 16, border: '1px solid #bbf7d0', marginBottom: 16, boxShadow: '0 2px 6px rgba(22, 163, 74, 0.05)',
      }}>
        {/* Photo & Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: '#FFFFFF',
              border: '2.5px solid #16A34A', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}>
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl.startsWith('http') ? profilePhotoUrl : assetUrl(profilePhotoUrl)}
                  alt={participantName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                initials(participantName)
              )}
            </div>
            <button
              onClick={() => openDialog('photo')}
              style={{
                position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%',
                background: '#FFFFFF', border: '1.5px solid #16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#16A34A', boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}
              title="Update Profile Photo"
            >
              <Camera size={13} color="#16A34A" />
            </button>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>{participantName}</h3>
              <CheckCircle2 size={16} color="#16A34A" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10.5, fontWeight: 700, padding: '2px 8px' }}>
                {userRole}
              </span>
              <span style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={11} /> Joined {joinedDate}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#475569', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} color="#16A34A" /> {participantEmail}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} color="#16A34A" /> {profile?.phone || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Middle Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 18px', background: '#ffffff', padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Participant ID</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{profile?.studentId || profile?.employeeId || 'PAR-1048'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Department</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{profile?.department || 'Software Development'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Designation</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{profile?.designation || profile?.headline || 'Trainee Software Engineer'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Enrolled Trainings</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#16A34A' }}>{stats?.coursesEnrolled || stats?.enrolledCount || 1} Programs</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Account Status</span>
            <span style={{ display: 'block', marginTop: 1 }}>
              <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, padding: '1px 6px' }}>Active</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Learning Activity Heatmap & Activity Summary Row (Participant Profile) ── */}
      <div
        className="profile-activity-container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 240px) 1fr minmax(260px, 290px)',
          gap: 16,
          marginBottom: 16,
          alignItems: 'stretch',
        }}
      >
        {/* 1. Profile Completion Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '20px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          gap: 12,
        }}>
          {/* Circular Progress Ring */}
          <div style={{
            position: 'relative',
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: `conic-gradient(#16A34A ${completion?.pct ?? 25}%, #E2E8F0 ${completion?.pct ?? 25}% 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)',
          }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 800,
              color: '#15803D',
            }}>
              {completion?.pct ?? 25}%
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', margin: 0 }}>Profile Completion</h4>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', marginTop: 3 }}>
              {completion?.count ?? 2}/{completion?.total ?? 8} Sections Complete
            </div>
            <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 3, lineHeight: 1.4 }}>
              {(completion?.pct ?? 25) === 100
                ? 'Your profile is completely up-to-date!'
                : 'Add more details to reach 100%'}
            </div>
          </div>
        </div>

        {/* 2. Learning Activity Heatmap */}
        <LearningActivityHeatmap
          dailyActivities={stats?.dailyActivities || {}}
          selectedDays={heatmapDays}
          onDaysChange={setHeatmapDays}
          userId={user?.id || profile?.id || 'participant'}
        />

        {/* 3. Activity Summary Card */}
        <ActivitySummaryCard
          stats={stats}
          selectedDays={heatmapDays}
          onViewAnalytics={() => {
            const home = ROLE_HOME[user?.role] || '/participant';
            navigate(home, { state: { tab: 'overview' } });
          }}
        />
      </div>

      <style>{`
        @media (max-width: 1200px) {
          .profile-activity-container {
            grid-template-columns: 1fr 1fr !important;
          }
          .profile-activity-container > div:nth-child(2) {
            grid-column: 1 / -1;
            order: 1;
          }
          .profile-activity-container > div:nth-child(1) {
            order: 2;
          }
          .profile-activity-container > div:nth-child(3) {
            order: 3;
          }
        }
        @media (max-width: 768px) {
          .profile-activity-container {
            grid-template-columns: 1fr !important;
          }
          .profile-activity-container > div:nth-child(2) {
            grid-column: auto;
          }
        }
      `}</style>

      {/* ── Main Content Grid (3-Column SaaS Layout) ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        
        {/* ── COLUMN 1: Personal & Professional Info ──────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* 1. Personal Information Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Personal Information</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('personal')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Pencil size={11} color="#16A34A" /> Edit
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Full Name', val: participantName },
                { label: 'Email Address', val: `${participantEmail} (Cannot be changed)`, isMuted: true },
                { label: 'Phone Number', val: profile?.phone || 'Not set' },
                { label: 'Participant ID', val: profile?.studentId || profile?.employeeId || 'PAR-1048' },
                { label: 'Department', val: profile?.department || 'Software Development' },
                { label: 'Designation', val: profile?.designation || profile?.headline || 'Trainee Software Engineer' },
                { label: 'Account Status', badge: 'Active' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{item.label}</span>
                  {item.badge ? (
                    <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, padding: '1px 6px' }}>Active</span>
                  ) : (
                    <span style={{ fontWeight: 600, color: item.isMuted ? '#64748b' : '#1E293B', textAlign: 'right' }}>{item.val}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2. Professional Information Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Professional Information</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('professional')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Pencil size={11} color="#16A34A" /> Edit
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Company / Org', val: profile?.company || 'Wave Init Solutions' },
                { label: 'Department', val: profile?.department || 'Software Development' },
                { label: 'Designation', val: profile?.designation || 'Trainee Software Engineer' },
                { label: 'Professional Headline', val: profile?.headline || 'Full Stack Developer Learner' },
                { label: 'Location', val: profile?.location || profile?.address || 'Chennai, India' },
                { label: 'Time Zone', val: profile?.timezone || 'Asia/Kolkata (IST)' },
                { label: 'Language', val: profile?.language || 'English' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontWeight: 600, color: '#1E293B', textAlign: 'right' }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. About Me Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>About Me</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('personal')}
                style={{ height: 24, padding: '0 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Pencil size={11} color="#16A34A" /> Edit
              </button>
            </div>
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              {profile?.about || 'Enthusiastic software engineering participant at Wave Init LMS, focusing on web development, full-stack technologies, and technical interview preparation.'}
            </div>
          </div>

        </div>

        {/* ── COLUMN 2: Skills, Experience, Projects, Social Links ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* 4. Skills Card (Section-Specific Add & Delete) */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                  Skills {userSkills.length > 0 && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>({userSkills.length})</span>}
                </div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('skill')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Plus size={12} color="#16A34A" /> Add Skill
              </button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {userSkills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 12 }}>
                  No skills added yet.
                  <button
                    type="button"
                    onClick={() => openDialog('skill')}
                    style={{ display: 'block', margin: '8px auto 0', color: '#16A34A', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    + Add your first skill
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {userSkills.map((s, i) => {
                    const skillName = typeof s === 'string' ? s : s.skill || s.name || '';
                    const skillId = typeof s === 'object' ? s.id : null;
                    return (
                      <span
                        key={skillId || i}
                        style={{
                          background: '#f0fdf4', color: '#15803D', border: '1px solid #bbf7d0',
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          display: 'inline-flex', alignItems: 'center', gap: 6
                        }}
                      >
                        {skillName}
                        {skillId && (
                          <button
                            type="button"
                            onClick={() => confirmDeleteAction('skill', skillId, skillName)}
                            style={{
                              border: 'none', background: 'transparent', cursor: 'pointer',
                              color: '#16A34A', display: 'flex', alignItems: 'center', padding: 0,
                              opacity: 0.75
                            }}
                            title={`Remove ${skillName}`}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 5. Experience & Projects Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Experience & Projects</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--secondary"
                  onClick={() => openDialog('experience')}
                  style={{ height: 26, padding: '0 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                >
                  <Plus size={11} color="#16A34A" /> Experience
                </button>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--secondary"
                  onClick={() => openDialog('project')}
                  style={{ height: 26, padding: '0 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                >
                  <Plus size={11} color="#16A34A" /> Project
                </button>
              </div>
            </div>
            
            <div style={{ padding: '14px 16px' }}>
              {userExperiences.length === 0 && userProjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 12 }}>
                  No experience or projects listed yet.
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => openDialog('experience')}
                      style={{ color: '#16A34A', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      + Add Experience
                    </button>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => openDialog('project')}
                      style={{ color: '#16A34A', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      + Add Project
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Experience items */}
                  {userExperiences.map((exp) => (
                    <div key={`exp-${exp.id}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{exp.role}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => openDialog('experience', exp)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}
                              title="Edit Experience"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDeleteAction('experience', exp.id, `${exp.role} at ${exp.company}`)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                              title="Delete Experience"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>{exp.company} {exp.location ? `• ${exp.location}` : ''}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                          {exp.startDate ? new Date(exp.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''} -{' '}
                          {exp.currentlyWorking ? 'Present • Ongoing' : exp.endDate ? new Date(exp.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}
                        </div>
                        {exp.description && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>{exp.description}</div>}
                      </div>
                    </div>
                  ))}

                  {/* Project items */}
                  {userProjects.map((proj) => (
                    <div key={`proj-${proj.id}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{proj.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => openDialog('project', proj)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}
                              title="Edit Project"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDeleteAction('project', proj.id, proj.title)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                              title="Delete Project"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        {proj.techStack && <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>{proj.techStack}</div>}
                        {proj.description && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{proj.description}</div>}
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          {proj.github && (
                            <a href={proj.github} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <GithubIcon width={12} height={12} /> Code
                            </a>
                          )}
                          {proj.liveDemo && (
                            <a href={proj.liveDemo} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#16A34A', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <ExternalLink size={11} /> Live Demo
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 6. Social Links Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Social Links</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('contact')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Pencil size={11} color="#16A34A" /> Edit
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { name: 'LinkedIn', icon: LinkedinIcon, val: profile?.contactLinks?.linkedin || profile?.socialLinks?.linkedin },
                { name: 'GitHub', icon: GithubIcon, val: profile?.contactLinks?.github || profile?.socialLinks?.github },
                { name: 'Twitter / X', icon: TwitterIcon, val: profile?.contactLinks?.twitter || profile?.socialLinks?.twitter },
                { name: 'Instagram', icon: InstagramIcon, val: profile?.contactLinks?.instagram || profile?.socialLinks?.instagram },
                { name: 'Portfolio', icon: Globe, val: profile?.contactLinks?.portfolio || profile?.socialLinks?.portfolio },
                { name: 'Website', icon: LinkIcon, val: profile?.contactLinks?.website || profile?.socialLinks?.website },
              ].map(s => {
                const isSet = !!s.val;
                return (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <s.icon size={15} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.name}</div>
                      {isSet ? (
                        <a
                          href={s.val.startsWith('http') ? s.val : `https://${s.val}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#16A34A', fontSize: 10.5, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                        >
                          {s.val.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 10.5 }}>Not linked</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── COLUMN 3: Education, Certifications, Resume, Actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* 7. Education Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Education</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('education')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Plus size={12} color="#16A34A" /> Add
              </button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {userEducations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 12 }}>
                  No education records added yet.
                  <button
                    type="button"
                    onClick={() => openDialog('education')}
                    style={{ display: 'block', margin: '8px auto 0', color: '#16A34A', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    + Add Education
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {userEducations.map((edu) => (
                    <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
                          {edu.degree || 'Degree'} {edu.department ? `(${edu.department})` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{edu.institution}</div>
                        {edu.cgpa && <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600, marginTop: 1 }}>CGPA: {edu.cgpa}</div>}
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{edu.year || ''}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => openDialog('education', edu)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}
                            title="Edit Education"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDeleteAction('education', edu.id, `${edu.degree || 'Education'} at ${edu.institution}`)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                            title="Delete Education"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 8. Certifications Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Certifications</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('certificate')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Plus size={12} color="#16A34A" /> Add
              </button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {userCertificates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 12 }}>
                  No certifications listed yet.
                  <button
                    type="button"
                    onClick={() => openDialog('certificate')}
                    style={{ display: 'block', margin: '8px auto 0', color: '#16A34A', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    + Add Certification
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {userCertificates.map((cert) => (
                    <div key={cert.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{cert.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{cert.issuer || 'Wave Init LMS'}</div>
                        {cert.credentialId && (
                          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>ID: {cert.credentialId}</div>
                        )}
                        {cert.verificationUrl && (
                          <a href={cert.verificationUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: '#16A34A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <ExternalLink size={10} /> Verify Credential
                          </a>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {cert.issueDate ? `Issued: ${new Date(cert.issueDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => openDialog('certificate', cert)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}
                            title="Edit Certificate"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDeleteAction('certificate', cert.id, cert.title)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                            title="Delete Certificate"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 9. Resume Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Resume</div>
              </div>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => openDialog('resume')}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <ExternalLink size={12} color="#16A34A" /> {profile?.resume ? 'Update Resume' : 'Upload Resume'}
              </button>
            </div>
            
            <div style={{ padding: '14px 16px' }}>
              {profile?.resume ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <FileText size={22} color="#dc2626" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile.resume.split('/').pop() || 'My_Resume.pdf'}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>PDF Document • Active</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={profile.resume.startsWith('http') ? profile.resume : assetUrl(profile.resume)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#16A34A', padding: 4, display: 'flex' }}
                      title="Download Resume"
                    >
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => confirmDeleteAction('resume', null, 'your resume')}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 4, display: 'flex' }}
                      title="Delete Resume"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#94a3b8', fontSize: 12 }}>
                  No resume uploaded yet.
                  <button
                    type="button"
                    onClick={() => openDialog('resume')}
                    style={{ display: 'block', margin: '6px auto 0', color: '#16A34A', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    + Upload Resume
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 10. Quick Actions Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="reg-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Quick Actions</div>
              </div>
            </div>
            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => navigate(user?.role === 'TRAINER' ? '/trainer/trainings' : '/participant')}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, cursor: 'pointer' }}
              >
                <BookOpen size={18} color="#16A34A" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803D' }}>My Courses</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/participant', { state: { tab: 'exams' } })}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, cursor: 'pointer' }}
              >
                <CheckSquare size={18} color="#2563eb" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1d4ed8' }}>Assessments</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/participant', { state: { tab: 'certificates' } })}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, cursor: 'pointer' }}
              >
                <Award size={18} color="#7c3aed" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6d28d9' }}>Certificates</span>
              </button>
              <button
                type="button"
                onClick={handleShareProfile}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, cursor: 'pointer' }}
              >
                <Share2 size={18} color="#ea580c" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c2410c' }}>Share Profile</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* ── Section-Specific Modals / Dialogs ───────────────────── */}
      
      {/* 1. Add Skill Dialog */}
      <AddSkillDialog
        open={dialogs.skill}
        onClose={() => closeDialog('skill')}
        onSave={handleSaveSkill}
        existingSkills={userSkills}
      />

      {/* 2. Add / Edit Education Dialog */}
      <AddEducationDialog
        open={dialogs.education}
        onClose={() => closeDialog('education')}
        onSave={handleSaveEducation}
        editData={editItem}
      />

      {/* 3. Add / Edit Experience Dialog */}
      <AddExperienceDialog
        open={dialogs.experience}
        onClose={() => closeDialog('experience')}
        onSave={handleSaveExperience}
        editData={editItem}
      />

      {/* 4. Add / Edit Project Dialog */}
      <AddProjectDialog
        open={dialogs.project}
        onClose={() => closeDialog('project')}
        onSave={handleSaveProject}
        editData={editItem}
      />

      {/* 5. Add / Edit Certificate Dialog */}
      <AddCertificateDialog
        open={dialogs.certificate}
        onClose={() => closeDialog('certificate')}
        onSave={handleSaveCertificate}
        editData={editItem}
      />

      {/* 6. Resume Upload Dialog */}
      <ResumeUploadDialog
        open={dialogs.resume}
        onClose={() => closeDialog('resume')}
        currentResume={profile?.resume}
        onSave={fetchProfile}
      />

      {/* 7. Profile Photo Dialog */}
      <ProfilePhotoDialog
        open={dialogs.photo}
        onClose={() => closeDialog('photo')}
        currentPhoto={profilePhotoUrl}
        userName={participantName}
        onSave={fetchProfile}
        onDelete={fetchProfile}
      />

      {/* 8. Edit Personal Information Dialog */}
      <EditPersonalInfoDialog
        open={dialogs.personal}
        onClose={() => closeDialog('personal')}
        profile={profile}
        user={user}
        onSave={handleSavePersonal}
      />

      {/* 9. Edit Professional Information Dialog */}
      <EditProfessionalInfoDialog
        open={dialogs.professional}
        onClose={() => closeDialog('professional')}
        profile={profile}
        onSave={handleSaveProfessional}
      />

      {/* 10. Edit Social Links Dialog */}
      <EditContactDialog
        open={dialogs.contact}
        onClose={() => closeDialog('contact')}
        contactLinks={profile?.contactLinks}
        socialLinks={profile?.socialLinks}
        onSave={handleSaveContact}
      />

      {/* 11. Reusable Confirmation Dialog for Deletes */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title={`Delete ${deleteTarget?.type ? deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1) : 'Item'}`}
        message="Are you sure you want to delete this"
        itemName={deleteTarget?.name || deleteTarget?.type}
        loading={deleting}
      />

      {/* 12. Full Edit Profile Modal (Accessible only from top-level "Edit Profile" button) */}
      <EditProfileModal
        open={dialogs.edit}
        onClose={() => closeDialog('edit')}
        profile={profile}
        onSave={handleSaveFullProfile}
      />

    </div>
  );
}
