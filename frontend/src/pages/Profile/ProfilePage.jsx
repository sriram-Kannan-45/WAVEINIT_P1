import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import profileService from '../../services/profileService';
import ProfileSkeleton from '../../components/profile/ProfileSkeleton';
import ProfileHero from '../../components/profile/ProfileHero';
import ProfileStats from '../../components/profile/ProfileStats';
import ProfileCompletion from '../../components/profile/ProfileCompletion';
import AboutCard from '../../components/profile/AboutCard';
import SkillsCard from '../../components/profile/SkillsCard';
import ExperienceTimeline from '../../components/profile/ExperienceTimeline';
import EducationCard from '../../components/profile/EducationCard';
import CertificatesCard from '../../components/profile/CertificatesCard';
import PortfolioCard from '../../components/profile/PortfolioCard';
import ContactCard from '../../components/profile/ContactCard';
import AchievementsCard from '../../components/profile/AchievementsCard';
import RecentActivity from '../../components/profile/RecentActivity';
import QuickActions from '../../components/profile/QuickActions';
import {
  EditProfileDialog, AddExperienceDialog, AddEducationDialog,
  AddCertificateDialog, AddProjectDialog, EditContactDialog, ResumeUploadDialog,
} from '../../components/profile/ProfileDialogs';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };
const stagger = { visible: { transition: { staggerChildren: 0.04 } } };

export default function ProfilePage({ user }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({});
  const [completion, setCompletion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogs, setDialogs] = useState({
    edit: false, experience: false, education: false, certificate: false,
    project: false, contact: false, resume: false,
  });
  const [editItem, setEditItem] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const data = await profileService.getMyProfile();
      setProfile(data.profile);
      setStats(data.stats);
      setCompletion(data.completion);
    } catch {
      toast.error('Failed to load profile');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const openDialog = (key, item = null) => { setEditItem(item); setDialogs(d => ({ ...d, [key]: true })); };
  const closeDialog = (key) => { setDialogs(d => ({ ...d, [key]: false })); setEditItem(null); };

  const handleSaveProfile = async (data) => {
    try { await profileService.updateProfile(data); toast.success('Profile updated'); fetchProfile(); }
    catch { toast.error('Failed to update'); }
  };
  const handleBannerUpdate = (path) => { setProfile(p => p ? { ...p, bannerImage: path } : p); };
  const handleAvatarUpdate = (path) => { setProfile(p => p ? { ...p, profileImage: path } : p); };

  const handleAddSkill = async (skill) => {
    try { await profileService.addSkill(skill); toast.success('Skill added'); fetchProfile(); }
    catch (e) { toast.error(e.message); }
  };
  const handleDeleteSkill = async (id) => {
    try { await profileService.deleteSkill(id); toast.success('Skill removed'); fetchProfile(); }
    catch { toast.error('Failed'); }
  };

  const handleSaveExperience = async (data) => {
    try {
      if (editItem) await profileService.updateExperience(editItem.id, data);
      else await profileService.addExperience(data);
      toast.success(editItem ? 'Experience updated' : 'Experience added'); fetchProfile();
    } catch { toast.error('Failed'); }
  };
  const handleDeleteExperience = async (id) => {
    try { await profileService.deleteExperience(id); toast.success('Removed'); fetchProfile(); }
    catch { toast.error('Failed'); }
  };

  const handleSaveEducation = async (data) => {
    try {
      if (editItem) await profileService.updateEducation(editItem.id, data);
      else await profileService.addEducation(data);
      toast.success(editItem ? 'Education updated' : 'Education added'); fetchProfile();
    } catch { toast.error('Failed'); }
  };
  const handleDeleteEducation = async (id) => {
    try { await profileService.deleteEducation(id); toast.success('Removed'); fetchProfile(); }
    catch { toast.error('Failed'); }
  };

  const handleSaveCertificate = async (formData) => {
    try {
      if (editItem) await profileService.updateCertificate(editItem.id, formData);
      else await profileService.addCertificate(formData);
      toast.success(editItem ? 'Certificate updated' : 'Certificate added'); fetchProfile();
    } catch { toast.error('Failed'); }
  };
  const handleDeleteCertificate = async (id) => {
    try { await profileService.deleteCertificate(id); toast.success('Removed'); fetchProfile(); }
    catch { toast.error('Failed'); }
  };

  const handleSaveProject = async (data) => {
    try {
      if (editItem) await profileService.updateProject(editItem.id, data);
      else await profileService.addProject(data);
      toast.success(editItem ? 'Project updated' : 'Project added'); fetchProfile();
    } catch { toast.error('Failed'); }
  };
  const handleDeleteProject = async (id) => {
    try { await profileService.deleteProject(id); toast.success('Removed'); fetchProfile(); }
    catch { toast.error('Failed'); }
  };

  const handleSaveContact = async (data) => {
    try { await profileService.updateContactLinks(data); toast.success('Contact links updated'); fetchProfile(); }
    catch { toast.error('Failed'); }
  };

  if (loading) return <ProfileSkeleton />;

  const role = profile?.user?.role;
  const isOwn = true;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* Hero + Stats */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.div variants={fadeUp} transition={{ duration: 0.4 }}>
            <ProfileHero
              profile={profile}
              completion={completion}
              onEditProfile={() => openDialog('edit')}
              onBannerUpdate={handleBannerUpdate}
              onAvatarUpdate={handleAvatarUpdate}
              onResume={() => openDialog('resume')}
            />
          </motion.div>

          <motion.div variants={fadeUp} transition={{ duration: 0.4, delay: 0.04 }}>
            <ProfileStats stats={stats} role={role} />
          </motion.div>
        </motion.div>

        {/* Profile Completion */}
        <div style={{ marginTop: 20 }}>
          <ProfileCompletion completion={completion} profile={profile} role={role} />
        </div>

        {/* 12-Column Grid: 8 main + 4 sidebar */}
        <div className="profile-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: 20,
          marginTop: 20,
        }}>
          {/* LEFT — 8 columns */}
          <div className="profile-main-col" style={{
            gridColumn: 'span 8',
            display: 'flex', flexDirection: 'column', gap: 20,
            minWidth: 0,
          }}>
            <AboutCard about={profile?.about} isOwn={isOwn} onSave={handleSaveProfile} />
            <SkillsCard skills={profile?.skills} isOwn={isOwn} onAdd={handleAddSkill} onDelete={handleDeleteSkill} />
            <ExperienceTimeline
              experiences={profile?.experiences} isOwn={isOwn}
              onAdd={() => openDialog('experience')}
              onEdit={(exp) => openDialog('experience', exp)}
              onDelete={handleDeleteExperience}
            />
            <EducationCard
              educations={profile?.educations} isOwn={isOwn}
              onAdd={() => openDialog('education')}
              onEdit={(edu) => openDialog('education', edu)}
              onDelete={handleDeleteEducation}
            />
            <CertificatesCard
              certificates={profile?.certificates} isOwn={isOwn}
              onAdd={() => openDialog('certificate')}
              onEdit={(cert) => openDialog('certificate', cert)}
              onDelete={handleDeleteCertificate}
            />
            <PortfolioCard
              projects={profile?.projects} isOwn={isOwn}
              onAdd={() => openDialog('project')}
              onEdit={(proj) => openDialog('project', proj)}
              onDelete={handleDeleteProject}
            />
          </div>

          {/* RIGHT — 4 columns */}
          <div className="profile-side-col" style={{
            gridColumn: 'span 4',
            display: 'flex', flexDirection: 'column', gap: 20,
            minWidth: 0,
          }}>
            <QuickActions role={role} />
            <ContactCard
              contactLinks={profile?.contactLinks}
              email={profile?.user?.email}
              phone={profile?.phone}
              location={profile?.location}
              isOwn={isOwn}
              onEdit={() => openDialog('contact')}
            />
            <AchievementsCard role={role} stats={stats} />
            <RecentActivity activities={profile?.activityLogs} />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .profile-main-col { grid-column: span 12 !important; }
          .profile-side-col { grid-column: span 12 !important; }
        }
        @media (max-width: 640px) {
          .profile-grid { gap: 16px !important; }
        }
      `}</style>

      {/* Dialogs */}
      <EditProfileDialog open={dialogs.edit} onClose={() => closeDialog('edit')} profile={profile} onSave={handleSaveProfile} />
      <AddExperienceDialog open={dialogs.experience} onClose={() => closeDialog('experience')} onSave={handleSaveExperience} editData={editItem} />
      <AddEducationDialog open={dialogs.education} onClose={() => closeDialog('education')} onSave={handleSaveEducation} editData={editItem} />
      <AddCertificateDialog open={dialogs.certificate} onClose={() => closeDialog('certificate')} onSave={handleSaveCertificate} editData={editItem} />
      <AddProjectDialog open={dialogs.project} onClose={() => closeDialog('project')} onSave={handleSaveProject} editData={editItem} />
      <EditContactDialog open={dialogs.contact} onClose={() => closeDialog('contact')} onSave={handleSaveContact} contactLinks={profile?.contactLinks} />
      <ResumeUploadDialog open={dialogs.resume} onClose={(done) => { closeDialog('resume'); if (done) fetchProfile(); }} />
    </div>
  );
}
