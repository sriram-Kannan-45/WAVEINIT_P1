const { sequelize } = require('../config/db');
const {
  User, UserProfile, ProfileSkill, ProfileExperience, ProfileEducation,
  ProfileCertificate, ProfileProject, ProfileContactLink, ProfileActivityLog,
  Enrollment, Course, Certificate, Training, AIQuiz, QuizAttempt,
  CourseTrainerAssignment, LessonProgress, CodingAttempt, AssessmentSubmission,
  ActivityLog, Attendance
} = require('../models');

const getFullProfile = async (userId) => {
  return UserProfile.findOne({
    where: { userId },
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'status', 'profilePic', 'created_at'] },
      { model: ProfileSkill, as: 'skills', attributes: ['id', 'skill'] },
      { model: ProfileExperience, as: 'experiences', attributes: { exclude: ['profileId'] } },
      { model: ProfileEducation, as: 'educations', attributes: { exclude: ['profileId'] } },
      { model: ProfileCertificate, as: 'certificates', attributes: { exclude: ['profileId'] } },
      { model: ProfileProject, as: 'projects', attributes: { exclude: ['profileId'] } },
      { model: ProfileContactLink, as: 'contactLinks', attributes: { exclude: ['profileId'] } },
      { model: ProfileActivityLog, as: 'activityLogs', order: [['created_at', 'DESC']], limit: 20 },
    ],
  });
};

const getStats = async (userId, role) => {
  const stats = {};
  try {
    if (role === 'TRAINER') {
      const [createdCourses, assignedRows, assessmentsCount, avgResult, certCount] = await Promise.all([
        Course.findAll({ where: { trainerId: userId }, attributes: ['id'], raw: true }).catch(() => []),
        CourseTrainerAssignment.findAll({ where: { trainerId: userId }, attributes: ['courseId'], raw: true }).catch(() => []),
        AIQuiz.count({ where: { trainerId: userId } }).catch(() => 0),
        QuizAttempt.findOne({
          attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avg']],
          include: [{ model: AIQuiz, as: 'quiz', where: { trainerId: userId }, attributes: [] }],
          raw: true,
        }).catch(() => ({ avg: null })),
        Certificate.count({ where: { userId } }).catch(() => 0),
      ]);

      const createdIds = createdCourses.map(c => c.id).filter(Boolean);
      const assignedIds = assignedRows.map(r => r.courseId).filter(Boolean);
      const allCourseIds = [...new Set([...createdIds, ...assignedIds])];

      stats.coursesCreated = allCourseIds.length || createdIds.length;
      stats.assessments = assessmentsCount || 0;
      stats.averageRating = avgResult?.avg ? parseFloat(parseFloat(avgResult.avg).toFixed(1)) : 0;
      stats.certificatesIssued = certCount || 0;

      // Parallelize student enrollment count
      const [studentsTrained, completedEnrolled] = await Promise.all([
        Enrollment.count({
          where: allCourseIds.length ? { courseId: allCourseIds } : { trainerId: userId },
        }).catch(() => 0),
        Enrollment.count({
          where: allCourseIds.length ? { courseId: allCourseIds, status: 'COMPLETED' } : { trainerId: userId, status: 'COMPLETED' },
        }).catch(() => 0),
      ]);

      stats.studentsTrained = studentsTrained || 0;
      stats.completionRate = studentsTrained > 0 ? Math.round((completedEnrolled / studentsTrained) * 100) : 0;
    } else {
      const [
        coursesEnrolled,
        completedCourses,
        assignmentsSubmitted,
        avgResult,
        certsEarned,
        lessonProgressRows,
        quizAttemptRows,
        codingAttemptRows,
        assessmentSubRows,
        activityLogRows,
        attendanceRows,
        enrollmentRows,
        feedbackRows,
        discussionRows
      ] = await Promise.all([
        Enrollment.count({ where: { participantId: userId } }).catch(() => 0),
        Enrollment.count({ where: { participantId: userId, status: 'COMPLETED' } }).catch(() => 0),
        QuizAttempt.count({ where: { participantId: userId } }).catch(() => 0),
        QuizAttempt.findOne({
          attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avg']],
          where: { participantId: userId },
          raw: true,
        }).catch(() => ({ avg: null })),
        Certificate.count({ where: { userId } }).catch(() => 0),
        LessonProgress.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'contentViewed', 'completedAt', 'created_at', 'updated_at'], raw: true }).catch(() => []),
        QuizAttempt.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'startedAt', 'submittedAt', 'timeTaken', 'created_at'], raw: true }).catch(() => []),
        CodingAttempt.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'startedAt', 'submittedAt', 'timeTaken', 'created_at'], raw: true }).catch(() => []),
        AssessmentSubmission.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'submittedAt', 'created_at'], raw: true }).catch(() => []),
        ActivityLog.findAll({ where: { userId }, attributes: ['id', 'action', 'created_at'], raw: true }).catch(() => []),
        Attendance.findAll({ where: { userId }, attributes: ['id', 'joinTime', 'leaveTime', 'durationSeconds', 'created_at'], raw: true }).catch(() => []),
        Enrollment.findAll({ where: { participantId: userId }, attributes: ['id', 'courseId', 'trainingId', 'enrolled_at', 'created_at'], raw: true }).catch(() => []),
        (require('../models').Feedback || { findAll: () => [] }).findAll({ where: { participantId: userId }, attributes: ['id', 'submitted_at'], raw: true }).catch(() => []),
        (require('../models').DiscussionPost || { findAll: () => [] }).findAll({ where: { userId }, attributes: ['id', 'created_at'], raw: true }).catch(() => []),
      ]);

      stats.coursesEnrolled = coursesEnrolled || 0;
      stats.completedCourses = completedCourses || 0;
      stats.assignmentsSubmitted = assignmentsSubmitted || 0;
      stats.quizAverage = avgResult?.avg ? parseFloat(parseFloat(avgResult.avg).toFixed(1)) : 0;
      stats.certificatesEarned = certsEarned || 0;

      const completedLessonsCount = lessonProgressRows.filter(lp => lp.status === 'COMPLETED' || lp.contentViewed).length;
      const totalAssessmentsTaken = (quizAttemptRows.length || 0) + (codingAttemptRows.length || 0) + (assessmentSubRows.length || 0);

      // Aggregate daily activities strictly from real database records
      const dailyMap = {};
      const addDaily = (dateVal, type = 'general', weight = 1, seconds = 0) => {
        if (!dateVal) return;
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return;
        const key = d.toISOString().split('T')[0];
        if (!dailyMap[key]) {
          dailyMap[key] = { count: 0, lessons: 0, quizzes: 0, coding: 0, assessments: 0, courses: 0, general: 0, seconds: 0 };
        }
        dailyMap[key].count += weight;
        if (type in dailyMap[key]) dailyMap[key][type] += weight;
        dailyMap[key].seconds += seconds;
      };

      lessonProgressRows.forEach(lp => {
        addDaily(lp.completedAt || lp.updated_at || lp.created_at, 'lessons', 1, 1200);
      });
      quizAttemptRows.forEach(qa => {
        addDaily(qa.submittedAt || qa.startedAt || qa.created_at, 'quizzes', 1, qa.timeTaken || 900);
      });
      codingAttemptRows.forEach(ca => {
        addDaily(ca.submittedAt || ca.startedAt || ca.created_at, 'coding', 1, ca.timeTaken || 1800);
      });
      assessmentSubRows.forEach(asub => {
        addDaily(asub.submittedAt || asub.created_at, 'assessments', 1, 1500);
      });
      attendanceRows.forEach(att => {
        addDaily(att.joinTime || att.created_at, 'general', 1, att.durationSeconds || 3600);
      });
      activityLogRows.forEach(al => {
        addDaily(al.created_at, 'general', 1, 300);
      });
      enrollmentRows.forEach(en => {
        addDaily(en.enrolled_at || en.created_at, 'courses', 1, 600);
      });
      feedbackRows.forEach(fb => {
        addDaily(fb.submitted_at || fb.created_at, 'general', 1, 300);
      });
      discussionRows.forEach(dp => {
        addDaily(dp.created_at, 'general', 1, 300);
      });

      // Calculate total learning time strictly from real records
      let totalSeconds = 0;
      Object.values(dailyMap).forEach(v => { totalSeconds += (v.seconds || 0); });
      if (totalSeconds === 0 && (completedLessonsCount > 0 || totalAssessmentsTaken > 0)) {
        totalSeconds = (completedLessonsCount * 1200) + (totalAssessmentsTaken * 900);
      }
      const totalHours = Math.floor(totalSeconds / 3600);
      const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
      const timeSpentFormatted = totalHours > 0 ? `${totalHours}h ${remainingMinutes}m` : (remainingMinutes > 0 ? `${remainingMinutes}m` : '0m');

      // Calculate Days Active in last 90 days from real records
      const now = new Date();
      const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const activeDays90 = Object.keys(dailyMap).filter(k => new Date(k) >= cutoff90 && dailyMap[k].count > 0).length;

      stats.studyHours = totalHours;
      stats.lessonsCompleted = completedLessonsCount;
      stats.assessmentsTaken = totalAssessmentsTaken;
      stats.coursesAccessed = stats.coursesEnrolled;
      stats.daysActive = activeDays90;
      stats.learningTime = timeSpentFormatted;
      stats.dailyActivities = dailyMap;
    }
  } catch (error) {
    console.error('getStats error:', error);
  }
  return stats;
};

const getCompletionPercent = async (userId, profile, user) => {
  let filled = 0;
  const total = 8;

  // 1. Basic Info: Name & headline/designation/department
  const hasName = !!(user?.name || profile?.user?.name || profile?.name);
  const hasHeadline = !!(profile?.headline || profile?.designation || profile?.department);
  if (hasName && hasHeadline) filled++;

  // 2. Profile Photo: Profile Picture
  const hasPhoto = !!(user?.profilePic || profile?.user?.profilePic || profile?.profileImage || profile?.imagePath);
  if (hasPhoto) filled++;

  // 3. Contact Details: Phone & Email
  const hasEmail = !!(user?.email || profile?.user?.email || profile?.email);
  const hasPhone = !!(profile?.phone || user?.phone);
  if (hasEmail && hasPhone) filled++;

  // 4. About / Bio
  if (profile?.about && profile.about.trim().length > 0) filled++;

  // 5. Professional / Company / Location
  if (profile?.company || profile?.location || profile?.address || profile?.employeeId) filled++;

  // 6. Skills: At least 1 skill
  const skillCount = profile?.skills?.length || await ProfileSkill.count({ where: { profileId: profile?.id } }).catch(() => 0);
  if (skillCount > 0) filled++;

  // 7. Experience / Education / Projects
  const expCount = profile?.experiences?.length || await ProfileExperience.count({ where: { profileId: profile?.id } }).catch(() => 0);
  const eduCount = profile?.educations?.length || await ProfileEducation.count({ where: { profileId: profile?.id } }).catch(() => 0);
  const projCount = profile?.projects?.length || await ProfileProject.count({ where: { profileId: profile?.id } }).catch(() => 0);
  if (expCount > 0 || eduCount > 0 || projCount > 0) filled++;

  // 8. Resume / Certifications / Social Links
  const certCount = profile?.certificates?.length || await ProfileCertificate.count({ where: { profileId: profile?.id } }).catch(() => 0);
  const linkCount = profile?.contactLinks?.length || await ProfileContactLink.count({ where: { profileId: profile?.id } }).catch(() => 0);
  const hasSocial = !!(profile?.socialLinks && Object.values(profile.socialLinks).some(v => !!v));
  if (profile?.resume || certCount > 0 || linkCount > 0 || hasSocial) filled++;

  const pct = Math.min(100, Math.round((filled / total) * 100));
  return { pct, count: filled, total };
};

exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let profile = await getFullProfile(req.user.id);
    if (!profile) {
      await UserProfile.create({ userId: req.user.id });
      profile = await getFullProfile(req.user.id);
    }

    const stats = await getStats(req.user.id, user.role);
    const completion = await getCompletionPercent(req.user.id, profile, user);

    res.json({ success: true, profile, stats, completion });
  } catch (error) {
    console.error('getMyProfile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, { attributes: { exclude: ['password'] } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let profile = await getFullProfile(id);
    if (!profile) {
      await UserProfile.create({ userId: id });
      profile = await getFullProfile(id);
    }
    const stats = await getStats(id, user.role);
    const completion = await getCompletionPercent(id, profile, user);

    res.json({ success: true, profile, stats, completion });
  } catch (error) {
    console.error('getProfileById error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const { headline, about, phone, location, company, department, designation, experience, timezone, language, visibility } = req.body;

    let profile = await UserProfile.findOne({ where: { userId }, transaction: t });
    if (!profile) {
      profile = await UserProfile.create({ userId }, { transaction: t });
    }

    await profile.update({ headline, about, phone, location, company, department, designation, experience, timezone, language, visibility }, { transaction: t });

    if (req.body.name && req.user.name !== req.body.name) {
      await User.update({ name: req.body.name }, { where: { id: userId }, transaction: t });
    }

    await ProfileActivityLog.create({ profileId: profile.id, activity: 'Updated profile information' }, { transaction: t });

    await t.commit();
    const updated = await getFullProfile(userId);
    const user = await User.findByPk(userId, { attributes: { exclude: ['password'] } });
    const completion = await getCompletionPercent(userId, updated, user);
    res.json({ success: true, profile: updated, completion });
  } catch (error) {
    await t.rollback();
    console.error('updateProfile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadBanner = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const bannerPath = `/uploads/banner/${req.file.filename}`;
    await profile.update({ bannerImage: bannerPath });

    await ProfileActivityLog.create({ profileId: profile.id, activity: 'Updated banner image' });
    res.json({ success: true, bannerImage: bannerPath });
  } catch (error) {
    console.error('uploadBanner error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const profilePath = `/uploads/profile/${req.file.filename}`;
    await profile.update({ profileImage: profilePath });
    await User.update({ profilePic: profilePath }, { where: { id: userId } });

    await ProfileActivityLog.create({ profileId: profile.id, activity: 'Updated profile picture' });
    res.json({ success: true, profileImage: profilePath });
  } catch (error) {
    console.error('uploadAvatar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (profile) await profile.update({ profileImage: null });
    await User.update({ profilePic: null }, { where: { id: userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const resumePath = `/uploads/resume/${req.file.filename}`;
    await profile.update({ resume: resumePath });

    await ProfileActivityLog.create({ profileId: profile.id, activity: 'Uploaded resume' });
    res.json({ success: true, resume: resumePath });
  } catch (error) {
    console.error('uploadResume error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (profile) await profile.update({ resume: null });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (profile) await profile.update({ bannerImage: null });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addSkill = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const { skill } = req.body;
    if (!skill || !skill.trim()) return res.status(400).json({ success: false, message: 'Skill is required' });

    const existing = await ProfileSkill.findOne({ where: { profileId: profile.id, skill: skill.trim() } });
    if (existing) return res.status(409).json({ success: false, message: 'Skill already exists' });

    const created = await ProfileSkill.create({ profileId: profile.id, skill: skill.trim() });
    await ProfileActivityLog.create({ profileId: profile.id, activity: `Added skill: ${skill.trim()}` });
    res.json({ success: true, skill: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSkill = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const deleted = await ProfileSkill.destroy({ where: { id: req.params.id, profileId: profile.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Skill not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addExperience = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const { company, role, employmentType, location, startDate, endDate, currentlyWorking, description, logo } = req.body;
    const exp = await ProfileExperience.create({
      profileId: profile.id, company, role, employmentType, location, startDate,
      endDate: currentlyWorking ? null : endDate, currentlyWorking, description, logo,
    });
    await ProfileActivityLog.create({ profileId: profile.id, activity: `Added experience at ${company}` });
    res.json({ success: true, experience: exp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateExperience = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const exp = await ProfileExperience.findOne({ where: { id: req.params.id, profileId: profile.id } });
    if (!exp) return res.status(404).json({ success: false, message: 'Experience not found' });

    const { company, role, employmentType, location, startDate, endDate, currentlyWorking, description, logo } = req.body;
    await exp.update({ company, role, employmentType, location, startDate, endDate: currentlyWorking ? null : endDate, currentlyWorking, description, logo });
    res.json({ success: true, experience: exp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExperience = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const deleted = await ProfileExperience.destroy({ where: { id: req.params.id, profileId: profile.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Experience not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addEducation = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const { institution, degree, department, cgpa, year, logo } = req.body;
    const edu = await ProfileEducation.create({ profileId: profile.id, institution, degree, department, cgpa, year, logo });
    await ProfileActivityLog.create({ profileId: profile.id, activity: `Added education at ${institution}` });
    res.json({ success: true, education: edu });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEducation = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const edu = await ProfileEducation.findOne({ where: { id: req.params.id, profileId: profile.id } });
    if (!edu) return res.status(404).json({ success: false, message: 'Education not found' });

    await edu.update(req.body);
    res.json({ success: true, education: edu });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEducation = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const deleted = await ProfileEducation.destroy({ where: { id: req.params.id, profileId: profile.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Education not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addCertificate = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const { title, issuer, credentialId, issueDate, expiryDate, verificationUrl } = req.body;
    const certificateFile = req.file ? `/uploads/certificates/${req.file.filename}` : null;
    const cert = await ProfileCertificate.create({
      profileId: profile.id, title, issuer, credentialId, issueDate, expiryDate, verificationUrl, certificateFile,
    });
    await ProfileActivityLog.create({ profileId: profile.id, activity: `Added certificate: ${title}` });
    res.json({ success: true, certificate: cert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCertificate = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const cert = await ProfileCertificate.findOne({ where: { id: req.params.id, profileId: profile.id } });
    if (!cert) return res.status(404).json({ success: false, message: 'Certificate not found' });

    const updates = { ...req.body };
    if (req.file) updates.certificateFile = `/uploads/certificates/${req.file.filename}`;
    await cert.update(updates);
    res.json({ success: true, certificate: cert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCertificate = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const deleted = await ProfileCertificate.destroy({ where: { id: req.params.id, profileId: profile.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Certificate not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addProject = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    const { title, description, techStack, github, liveDemo, thumbnail } = req.body;
    const project = await ProfileProject.create({ profileId: profile.id, title, description, techStack, github, liveDemo, thumbnail });
    await ProfileActivityLog.create({ profileId: profile.id, activity: `Added project: ${title}` });
    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const project = await ProfileProject.findOne({ where: { id: req.params.id, profileId: profile.id } });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    await project.update(req.body);
    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const deleted = await ProfileProject.destroy({ where: { id: req.params.id, profileId: profile.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateContactLinks = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) profile = await UserProfile.create({ userId });

    let links = await ProfileContactLink.findOne({ where: { profileId: profile.id } });
    if (links) {
      await links.update(req.body);
    } else {
      links = await ProfileContactLink.create({ profileId: profile.id, ...req.body });
    }
    res.json({ success: true, contactLinks: links });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteContactLinks = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    await ProfileContactLink.destroy({ where: { profileId: profile.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
