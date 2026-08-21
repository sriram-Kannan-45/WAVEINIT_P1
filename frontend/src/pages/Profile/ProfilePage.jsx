import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  User, Edit3, Mail, Phone, Briefcase, GraduationCap,
  Award, BookOpen, Plus, CheckCircle2, Share2, FileText, CheckSquare, X, Calendar, Zap,
  Download, ExternalLink, Camera, Globe, ArrowLeft
} from 'lucide-react';
import profileService from '../../services/profileService';
import ProfileSkeleton from '../../components/profile/ProfileSkeleton';
import {
  AddExperienceDialog, AddEducationDialog,
  AddCertificateDialog, AddProjectDialog, EditContactDialog, ResumeUploadDialog,
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
  if (profile?.resume || (profile?.certificates && profile.certificates.length > 0) || (profile?.contactLinks && profile.contactLinks.length > 0) || profile?.socialLinks) count++;

  const pct = Math.min(100, Math.round((count / total) * 100));
  return { pct, count, total };
};

export default function ProfilePage({ user }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({});
  const [completion, setCompletion] = useState({ pct: 100, count: 8, total: 8 });
  const [loading, setLoading] = useState(true);
  const [dialogs, setDialogs] = useState({
    edit: false, experience: false, education: false, certificate: false,
    project: false, contact: false, resume: false,
  });
  const [editItem, setEditItem] = useState(null);

  const handleBackToDashboard = () => {
    const home = ROLE_HOME[user?.role] || '/admin';
    navigate(home, { state: { tab: 'overview' } });
  };

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const data = await profileService.getMyProfile();
      setProfile(data.profile);
      setStats(data.stats || {});
      const comp = calcProfileCompletion(data.profile, user, data.completion);
      setCompletion(comp);
    } catch {
      toast.error('Failed to load profile');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const openDialog = (key, item = null) => { setEditItem(item); setDialogs(d => ({ ...d, [key]: true })); };
  const closeDialog = (key) => { setDialogs(d => ({ ...d, [key]: false })); setEditItem(null); };

  const handleSaveProfile = async (data) => {
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

  const handleShareProfile = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Profile link copied to clipboard!');
  };

  if (loading) return <ProfileSkeleton />;

  const participantName = profile?.user?.name || user?.name || 'Sriram Kannan';
  const participantEmail = profile?.user?.email || user?.email || 'wavene20@gmail.com';
  const joinedDate = fmtMonthYear(profile?.createdAt || user?.createdAt);
  const userRole = (user?.role || 'PARTICIPANT').toUpperCase();

  return (
    <div className="reg-admin" style={{ paddingBottom: 0, maxWidth: 1280, margin: '0 auto' }}>
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="reg-admin-header" style={{ marginBottom: 12 }}>
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
          <User size={26} color="#fff" />
        </div>
        <div>
          <h2 className="reg-admin-title">My Profile</h2>
          <p className="reg-admin-subtitle">View and manage your professional profile and information</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--secondary"
            onClick={handleBackToDashboard}
            style={{ height: 42, padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={15} /> Back to Dashboard
          </button>
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--primary"
            onClick={() => openDialog('edit')}
            style={{ height: 42, padding: '0 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Edit3 size={15} /> Edit Profile
          </button>
        </div>
      </div>

      {/* ── Profile Summary Banner Card ─────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        padding: '16px 22px', background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
        borderRadius: 16, border: '1px solid #bbf7d0', marginBottom: 14, boxShadow: '0 2px 6px rgba(22, 163, 74, 0.05)',
      }}>
        {/* Photo & Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #16A34A, #15803D)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, overflow: 'hidden', border: '3px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}>
              {profile?.profileImage
                ? <img src={profile.profileImage} alt={participantName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials(participantName)}
            </div>
            <button onClick={() => openDialog('edit')} style={{
              position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%',
              background: '#fff', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#475569', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }} title="Change Avatar">
              <Camera size={12} />
            </button>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>{participantName}</h3>
              <CheckCircle2 size={18} color="#16A34A" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
              <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, fontWeight: 700 }}>
                {userRole}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} /> Joined {joinedDate}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#475569', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} color="#16A34A" /> {participantEmail}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} color="#16A34A" /> {profile?.phone || '+91 98765 43210'}</span>
            </div>
          </div>
        </div>

        {/* Middle Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 20px', background: '#ffffff', padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Participant ID</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{profile?.studentId || profile?.employeeId || 'PAR-1048'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Department</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{profile?.department || 'Software Development'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Designation</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{profile?.designation || profile?.headline || 'Trainee Software Engineer'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Enrolled Trainings</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#16A34A' }}>{stats?.enrolledCount || 4} Courses</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Account Status</span>
            <span style={{ display: 'block', marginTop: 1 }}>
              <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, padding: '1px 6px' }}>Active</span>
            </span>
          </div>
        </div>

        {/* Far Right Profile Completion Ring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#ffffff', padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', border: '4px solid #16A34A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#15803D', background: '#f0fdf4', flexShrink: 0,
          }}>
            {completion?.pct ?? 100}%
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Profile Completion</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', marginTop: 1 }}>
              {completion?.count ?? 8}/{completion?.total ?? 8} Complete
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              {(completion?.pct ?? 100) === 100
                ? 'Great job! Your profile is complete.'
                : 'Complete your profile for better visibility.'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Grid (3-Column SaaS Layout) ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* ── COLUMN 1 ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Personal Information */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Personal Information</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'Full Name', val: participantName },
                { label: 'Email Address', val: `${participantEmail} (Cannot be changed)` },
                { label: 'Phone Number', val: profile?.phone || '+91 98765 43210' },
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
                    <span style={{ fontWeight: 600, color: '#1E293B', textAlign: 'right' }}>{item.val}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Professional Information */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Professional Information</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'Company / Org', val: profile?.company || 'Wave Init Solutions' },
                { label: 'Department', val: profile?.department || 'Software Development' },
                { label: 'Designation', val: profile?.designation || 'Trainee Software Engineer' },
                { label: 'Professional Headline', val: profile?.headline || 'Full Stack Developer Learner' },
                { label: 'Location', val: profile?.location || profile?.address || 'Chennai, India' },
                { label: 'Time Zone', val: 'Asia/Kolkata (IST)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontWeight: 600, color: '#1E293B', textAlign: 'right' }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* About Me */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>About Me</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => openDialog('edit')} style={{ height: 24, padding: '0 8px', fontSize: 11 }}>
                <Edit3 size={11} /> Edit
              </button>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
              {profile?.about || 'Enthusiastic software engineering participant at Wave Init LMS, focusing on web development, full-stack technologies, and technical interview preparation.'}
            </div>
          </div>
        </div>

        {/* ── COLUMN 2 ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Skills */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Skills</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => openDialog('edit')} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add Skill
              </button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(Array.isArray(profile?.skills) && profile.skills.length > 0 ? profile.skills : [
                  'React', 'JavaScript', 'HTML', 'CSS', 'Node.js', 'Express.js', 'Git', 'SQL'
                ]).map((s, i) => (
                  <span key={i} style={{
                    background: '#f0fdf4', color: '#15803D', border: '1px solid #bbf7d0',
                    padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  }}>{typeof s === 'string' ? s : s.name}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Enrolled Trainings / Experience */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Experience & Projects</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => openDialog('experience')} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { title: 'Full Stack Web Development Program', company: 'Wave Init LMS', range: 'Aug 2026 - Present • Ongoing', desc: 'Hands-on training covering React, Node.js, REST APIs and LMS architecture.' },
                  { title: 'Frontend Developer Project', company: 'Academic Capstone', range: 'Jan 2026 - May 2026 • 5 Months', desc: 'Built responsive web interfaces with modern state management.' },
                ].map((exp, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{exp.title}</div>
                      <div style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>{exp.company}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{exp.range}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{exp.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Social Links</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { name: 'LinkedIn', icon: LinkedinIcon, handle: 'linkedin.com/in/sriramkannan' },
                { name: 'GitHub', icon: GithubIcon, handle: 'github.com/sriramkannan' },
                { name: 'Twitter / X', icon: TwitterIcon, handle: 'twitter.com/sriramkannan' },
                { name: 'Instagram', icon: InstagramIcon, handle: 'instagram.com/sriramkannan' },
                { name: 'Portfolio', icon: Globe, handle: 'sriramkannan.dev' },
                { name: 'Website', icon: Globe, handle: 'sriramkannan.com' },
              ].map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <s.icon size={15} color="#000" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.name}</div>
                    <div style={{ color: '#64748b', fontSize: 10.5 }}>{s.handle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COLUMN 3 ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Education */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Education</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => openDialog('education')} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Bachelor of Technology (B.Tech)</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Computer Science and Engineering • Anna University</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>2018 - 2022</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Higher Secondary (12th)</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>State Board</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>2016 - 2018</div>
              </div>
            </div>
          </div>

          {/* Certifications */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Certifications</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => openDialog('certificate')} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Full Stack Web Developer Certificate</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Wave Init LMS</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Issued: Aug 2026</div>
              </div>
            </div>
          </div>

          {/* Resume */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Resume</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => openDialog('resume')} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <ExternalLink size={12} /> Update Resume
              </button>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={22} color="#dc2626" />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Sriram_Kannan_Resume.pdf</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Updated on May 20, 2026 • 1.2 MB</div>
                </div>
              </div>
              <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', padding: 4 }}>
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Quick Actions</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, cursor: 'pointer' }}>
                <BookOpen size={20} color="#16A34A" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803D' }}>My Courses</span>
              </button>
              <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, cursor: 'pointer' }}>
                <CheckSquare size={20} color="#2563eb" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1d4ed8' }}>My Assessments</span>
              </button>
              <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, cursor: 'pointer' }}>
                <Award size={20} color="#7c3aed" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6d28d9' }}>My Certificates</span>
              </button>
              <button onClick={handleShareProfile} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, cursor: 'pointer' }}>
                <Share2 size={20} color="#ea580c" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c2410c' }}>Share Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <EditProfileModal open={dialogs.edit} onClose={() => closeDialog('edit')} profile={profile} onSave={handleSaveProfile} />
      <AddExperienceDialog open={dialogs.experience} onClose={() => closeDialog('experience')} onSave={fetchProfile} editData={editItem} />
      <AddEducationDialog open={dialogs.education} onClose={() => closeDialog('education')} onSave={fetchProfile} editData={editItem} />
      <AddCertificateDialog open={dialogs.certificate} onClose={() => closeDialog('certificate')} onSave={fetchProfile} editData={editItem} />
      <AddProjectDialog open={dialogs.project} onClose={() => closeDialog('project')} onSave={fetchProfile} editData={editItem} />
      <EditContactDialog open={dialogs.contact} onClose={() => closeDialog('contact')} onSave={fetchProfile} contactLinks={profile?.contactLinks} />
      <ResumeUploadDialog open={dialogs.resume} onClose={(done) => { closeDialog('resume'); if (done) fetchProfile(); }} />
    </div>
  );
}

