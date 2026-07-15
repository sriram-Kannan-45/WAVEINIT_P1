const { User, TrainerProfile, TrainerExperience, TrainerEducation, Course, Enrollment } = require('../models');
const { sequelize } = require('../config/db');

const createOrUpdateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      dob, phone, address, qualification, experience, name,
      headline, about, skills, certifications, socialLinks,
      coverImagePath,
    } = req.body;

    if (name) {
      await User.update({ name }, { where: { id: userId } });
    }

    let profile = await TrainerProfile.findOne({ where: { userId } });
    const imagePath = req.file ? req.file.filename : null;

    const updateData = {
      dob: dob || undefined,
      phone: phone || undefined,
      address: address || undefined,
      qualification: qualification || undefined,
      experience: experience || undefined,
      headline: headline !== undefined ? headline : undefined,
      about: about !== undefined ? about : undefined,
    };
    if (imagePath) updateData.imagePath = imagePath;
    if (coverImagePath) updateData.coverImagePath = coverImagePath;

    if (skills !== undefined) {
      try { updateData.skills = typeof skills === 'string' ? JSON.parse(skills) : skills; }
      catch { updateData.skills = skills; }
    }
    if (certifications !== undefined) {
      try { updateData.certifications = typeof certifications === 'string' ? JSON.parse(certifications) : certifications; }
      catch { updateData.certifications = certifications; }
    }
    if (socialLinks !== undefined) {
      try { updateData.socialLinks = typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks; }
      catch { updateData.socialLinks = socialLinks; }
    }

    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    if (profile) {
      await profile.update(updateData);
    } else {
      profile = await TrainerProfile.create({ userId, ...updateData });
    }

    const updatedProfile = await TrainerProfile.findOne({
      where: { userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'username'] }],
    });

    res.json({ success: true, message: 'Profile saved', profile: updatedProfile });
  } catch (error) {
    console.error('Profile save error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Server error saving profile' });
  }
};

const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await TrainerProfile.findOne({
      where: { userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'username'] }],
    });
    if (!profile) return res.json({ success: true, profile: null });

    const experiences = await TrainerExperience.findAll({ where: { userId }, order: [['startDate', 'DESC']] });
    const educations = await TrainerEducation.findAll({ where: { userId }, order: [['startYear', 'DESC']] });

    res.json({ success: true, profile, experiences, educations });
  } catch (error) {
    console.error('Profile fetch error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Server error fetching profile' });
  }
};

const getPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const profile = await TrainerProfile.findOne({
      where: { userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    });
    if (!profile) return res.json({ success: true, profile: null });

    const experiences = await TrainerExperience.findAll({ where: { userId }, order: [['startDate', 'DESC']] });
    const educations = await TrainerEducation.findAll({ where: { userId }, order: [['startYear', 'DESC']] });

    const courseCount = await Course.count({ where: { trainerId: userId } });
    const enrolledCount = await Enrollment.count({
      include: [{ model: Course, as: 'course', where: { trainerId: userId } }],
    });

    res.json({ success: true, profile, experiences, educations, stats: { courseCount, enrolledCount } });
  } catch (error) {
    console.error('Public profile error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
};

const getAllTrainers = async (req, res) => {
  try {
    const trainers = await User.findAll({
      where: { role: 'TRAINER' },
      attributes: ['id', 'name', 'email', 'username'],
      include: [{
        model: TrainerProfile,
        as: 'profile',
        attributes: ['dob', 'phone', 'address', 'qualification', 'experience', 'imagePath', 'headline', 'skills'],
      }],
    });
    res.json({ success: true, trainers });
  } catch (error) {
    console.error('Get trainers error:', error.message);
    res.status(500).json({ success: false, error: 'Server error fetching trainers' });
  }
};

// ─── Experience CRUD ───
const addExperience = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, company, description, startDate, endDate, isCurrent } = req.body;
    const exp = await TrainerExperience.create({
      userId, title, company, description, startDate, endDate: isCurrent ? null : endDate, isCurrent: !!isCurrent,
    });
    res.json({ success: true, experience: exp });
  } catch (error) {
    console.error('Add experience error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateExperience = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const exp = await TrainerExperience.findOne({ where: { id, userId } });
    if (!exp) return res.status(404).json({ success: false, error: 'Experience not found' });
    const { title, company, description, startDate, endDate, isCurrent } = req.body;
    await exp.update({ title, company, description, startDate, endDate: isCurrent ? null : endDate, isCurrent: !!isCurrent });
    res.json({ success: true, experience: exp });
  } catch (error) {
    console.error('Update experience error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteExperience = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const exp = await TrainerExperience.findOne({ where: { id, userId } });
    if (!exp) return res.status(404).json({ success: false, error: 'Experience not found' });
    await exp.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete experience error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Education CRUD ───
const addEducation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { school, degree, fieldOfStudy, startYear, endYear, description } = req.body;
    const edu = await TrainerEducation.create({ userId, school, degree, fieldOfStudy, startYear, endYear, description });
    res.json({ success: true, education: edu });
  } catch (error) {
    console.error('Add education error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateEducation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const edu = await TrainerEducation.findOne({ where: { id, userId } });
    if (!edu) return res.status(404).json({ success: false, error: 'Education not found' });
    const { school, degree, fieldOfStudy, startYear, endYear, description } = req.body;
    await edu.update({ school, degree, fieldOfStudy, startYear, endYear, description });
    res.json({ success: true, education: edu });
  } catch (error) {
    console.error('Update education error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteEducation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const edu = await TrainerEducation.findOne({ where: { id, userId } });
    if (!edu) return res.status(404).json({ success: false, error: 'Education not found' });
    await edu.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete education error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const imageUrl = req.file ? req.file.path : null;
    await User.update({ phone: req.body.phone, dob: req.body.dob, profilePic: imageUrl }, { where: { id: req.user.id } });
    res.json({ success: true, message: 'Profile updated', imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createOrUpdateProfile,
  getProfile,
  getPublicProfile,
  getAllTrainers,
  updateProfile,
  addExperience, updateExperience, deleteExperience,
  addEducation, updateEducation, deleteEducation,
};
