/**
 * registrationController.js
 * ─────────────────────────
 * Full participant registration workflow:
 *   Submit → AI Validate → Admin Review → Approve/Reject →
 *   Generate ID & Password → Assign Trainer → Send Credentials
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const axios = require('axios');
const { Op } = require('sequelize');
const { User, Training, RegistrationApplication, TrainingTrainerAssignment, Notification } = require('../models');
const { sequelize } = require('../config/db');
const { sendCredentialsEmail, isEmailConfigured } = require('../config/mailer');

const BCRYPT_COST = 12;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────

function generateSecurePassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  let pw = '';
  pw += upper[crypto.randomInt(upper.length)];
  pw += lower[crypto.randomInt(lower.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += special[crypto.randomInt(special.length)];
  for (let i = 0; i < 6; i++) pw += all[crypto.randomInt(all.length)];
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

function generateApplicationNumber(seq) {
  const year = new Date().getFullYear();
  return `APP${year}${String(seq).padStart(4, '0')}`;
}

function localValidateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function localValidatePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function localNormalizeName(name) {
  if (!name) return name;
  return name.trim().replace(/\s+/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// ─── AI Validation ────────────────────────────────────────────────────────

async function callAIValidation(application) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/validate-application`, {
      firstName: application.firstName,
      lastName: application.lastName,
      email: application.email,
      phone: application.phone,
      qualification: application.qualification,
      experience: application.experience,
      trainingProgram: application.trainingTitle || '',
      gender: application.gender,
      city: application.city,
      state: application.state,
    }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });

    if (response.data?.success) return response.data;
    return null;
  } catch (e) {
    console.warn('[Registration] AI validation unavailable:', e.message);
    return null;
  }
}

function localValidateApplication(application) {
  const firstName = localNormalizeName(application.firstName);
  const lastName = localNormalizeName(application.lastName);
  const emailValid = localValidateEmail(application.email);
  const phoneValid = localValidatePhone(application.phone);

  let score = 50;
  if (firstName && lastName) score += 15;
  if (emailValid) score += 10;
  if (phoneValid) score += 10;
  if (application.qualification) score += 5;
  if (application.experience) score += 5;
  if (application.trainingId) score += 5;

  return {
    success: true,
    normalizedNames: { firstName, lastName },
    emailValid,
    phoneValid,
    applicationScore: Math.min(score, 100),
    scoreLabel: score >= 80 ? 'Ready for Approval' : score >= 60 ? 'Needs Review' : 'Incomplete',
    duplicateWarning: null,
    dropoutRisk: 'Low',
    recommendations: {},
    onboardingChecklist: ['Verify identity', 'Send welcome email', 'Schedule orientation'],
  };
}

// ─── Submit Application (Public) ──────────────────────────────────────────

async function submitApplication(req, res) {
  try {
    const {
      firstName, lastName, email, phone, gender, dob,
      qualification, experience, address, city, state, country,
      trainingId, batch,
    } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !trainingId) {
      return res.status(422).json({ error: 'First name, last name, email, and training program are required.' });
    }
    if (!localValidateEmail(email)) {
      return res.status(422).json({ error: 'Invalid email format.' });
    }

    // Check duplicate email
    const existingApp = await RegistrationApplication.findOne({
      where: { email: email.toLowerCase(), status: { [Op.in]: ['PENDING', 'WAITLISTED'] } },
    });
    if (existingApp) {
      return res.status(409).json({ error: 'An application with this email is already pending review.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists in the system.' });
    }

    // Get training title for AI validation
    let training;
    try {
      training = await Training.findByPk(parseInt(trainingId, 10));
    } catch (e) {
      console.error('[Registration] Training lookup error:', e.message);
    }
    if (!training) {
      return res.status(422).json({ error: 'Selected training program is invalid. Please choose a different program.' });
    }

    // Generate application number
    const appCount = await RegistrationApplication.count();
    const applicationNumber = generateApplicationNumber(appCount + 1);

    // AI validation
    const aiResult = await callAIValidation({
      firstName, lastName, email, phone, qualification, experience,
      trainingTitle: training.title, gender, city, state,
    });

    const normalized = aiResult?.normalizedNames || {
      firstName: localNormalizeName(firstName),
      lastName: localNormalizeName(lastName),
    };

    // Handle file uploads
    let resumeUrl = null;
    let profilePhotoUrl = null;
    if (req.files?.resume) {
      resumeUrl = `/uploads/registrations/${req.files.resume[0].filename}`;
    }
    if (req.files?.profilePhoto) {
      profilePhotoUrl = `/uploads/registrations/${req.files.profilePhoto[0].filename}`;
    }

    const application = await RegistrationApplication.create({
      applicationNumber,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      gender: gender || null,
      dob: dob || null,
      qualification: qualification || null,
      experience: experience || null,
      address: address || null,
      city: city || null,
      state: state || null,
      country: country || null,
      trainingId: parseInt(trainingId),
      batch: batch || null,
      resumeUrl,
      profilePhotoUrl,
      aiScore: aiResult?.applicationScore || null,
      aiRecommendations: aiResult?.recommendations || {},
      dropoutRisk: aiResult?.dropoutRisk || null,
      recommendedBatch: aiResult?.recommendedBatch || null,
      status: 'PENDING',
    });

    // Notify all admins
    const admins = await User.findAll({ where: { role: 'ADMIN' }, attributes: ['id'] });
    if (admins.length > 0) {
      await Notification.bulkCreate(admins.map(a => ({
        userId: a.id,
        message: `New registration application ${applicationNumber} from ${normalized.firstName} ${normalized.lastName} for ${training.title}.`,
        type: 'OTHER',
        isRead: false,
      })));
    }

    res.status(201).json({
      success: true,
      application: {
        id: application.id,
        applicationNumber: application.applicationNumber,
        status: application.status,
        aiScore: application.aiScore,
        scoreLabel: aiResult?.scoreLabel || 'Pending Review',
      },
      message: 'Registration application submitted successfully. You will be notified once reviewed.',
    });
  } catch (error) {
    console.error('[Registration] Submit application error:', error.message, error.stack);
    if (error.name === 'SequelizeValidationError') {
      const msgs = error.errors.map(e => e.message).join('; ');
      return res.status(422).json({ error: msgs });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'A record with this information already exists.' });
    }
    res.status(500).json({ error: 'Something went wrong submitting your application. Please try again.' });
  }
}

// ─── Get Applications (Admin) ─────────────────────────────────────────────

async function getApplications(req, res) {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { applicationNumber: { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await RegistrationApplication.findAndCountAll({
      where,
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name'] },
        { model: User, as: 'trainer', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    const applications = rows.map(a => ({
      id: a.id,
      applicationNumber: a.applicationNumber,
      firstName: a.firstName,
      lastName: a.lastName,
      fullName: `${a.firstName} ${a.lastName}`,
      email: a.email,
      phone: a.phone,
      gender: a.gender,
      dob: a.dob,
      qualification: a.qualification,
      experience: a.experience,
      address: a.address,
      city: a.city,
      state: a.state,
      country: a.country,
      trainingId: a.trainingId,
      trainingTitle: a.training?.title || 'Unknown',
      batch: a.batch,
      resumeUrl: a.resumeUrl,
      profilePhotoUrl: a.profilePhotoUrl,
      aiScore: a.aiScore,
      aiRecommendations: a.aiRecommendations,
      dropoutRisk: a.dropoutRisk,
      recommendedBatch: a.recommendedBatch,
      status: a.status,
      reviewerName: a.reviewer?.name || null,
      trainerName: a.trainer?.name || null,
      trainerId: a.trainerId,
      participantId: a.participantId,
      participantPassword: a.plainPassword || null,
      credentialsSentAt: a.credentialsSentAt,
      rejectionReason: a.rejectionReason,
      createdAt: a.created_at,
      reviewedAt: a.reviewedAt,
    }));

    res.json({ applications, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Get applications error:', error.message);
    res.status(500).json({ error: 'Server error fetching applications.' });
  }
}

// ─── Approve Application ──────────────────────────────────────────────────

async function approveApplication(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { trainerId } = req.body;

    const application = await RegistrationApplication.findOne({
      where: { id, status: 'PENDING' },
      transaction: t,
    });
    if (!application) {
      await t.rollback();
      return res.status(404).json({ error: 'Pending application not found.' });
    }

    // Check email not taken
    const existingUser = await User.findOne({ where: { email: application.email }, transaction: t });
    if (existingUser) {
      await t.rollback();
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    // Generate credentials
    const plainPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_COST);
    const username = application.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Create user
    const user = await User.create({
      name: `${application.firstName} ${application.lastName}`,
      email: application.email,
      password: hashedPassword,
      phone: application.phone,
      dob: application.dob,
      profilePic: application.profilePhotoUrl,
      username,
      role: 'PARTICIPANT',
      status: 'APPROVED',
      passwordVersion: 1, // Force password change on first login
    }, { transaction: t });

    const participantId = `WI${user.id}`;

    // Validate trainer if provided
    if (trainerId) {
      const trainer = await User.findOne({ where: { id: trainerId, role: 'TRAINER' }, transaction: t });
      if (!trainer) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid trainer ID.' });
      }
    }

    // Update application
    await application.update({
      status: 'APPROVED',
      userId: user.id,
      participantId,
      participantPassword: hashedPassword,
      plainPassword,
      trainerId: trainerId || null,
      reviewerId: req.user.id,
      reviewedAt: new Date(),
    }, { transaction: t });

    // Enroll in training
    const { Enrollment, Course } = require('../models');
    try {
      const course = await Course.findOne({ where: { trainingProgramId: application.trainingId }, transaction: t });
      if (course) {
        await Enrollment.create({
          participantId: user.id,
          courseId: course.id,
          trainingId: application.trainingId,
          status: 'ENROLLED',
          progressPercent: 0,
        }, { transaction: t });
      }
    } catch (enrollErr) {
      console.warn('[Registration] Enrollment create skipped:', enrollErr.message);
    }

    // Assign trainer to training if not already
    if (trainerId) {
      const existingAssignment = await TrainingTrainerAssignment.findOne({
        where: { trainingId: application.trainingId, trainerId },
        transaction: t,
      });
      if (!existingAssignment) {
        await TrainingTrainerAssignment.create({
          trainingId: application.trainingId,
          trainerId,
        }, { transaction: t });
      }

      // Notify trainer
      await Notification.create({
        userId: trainerId,
        message: `New participant ${application.firstName} ${application.lastName} has been assigned to you for ${application.trainingId ? 'training' : 'a program'}.`,
        type: 'ENROLLMENT',
        isRead: false,
      }, { transaction: t });
    }

    // Notify participant
    await Notification.create({
      userId: user.id,
      message: 'Your registration has been approved! Check your email for login credentials.',
      type: 'APPROVAL',
      isRead: false,
    }, { transaction: t });

    // Log activity
    try {
      const ActivityService = require('../services/activityService');
      await ActivityService.logActivity({
        userId: req.user.id,
        userName: req.user.name || 'Admin',
        action: 'APPLICATION_APPROVED',
        entityType: 'RegistrationApplication',
        entityId: application.id,
        details: { participantId, participantName: `${application.firstName} ${application.lastName}` },
      }, req.app.get('io'));
    } catch (e) { /* non-critical */ }

    await t.commit();

    res.json({
      success: true,
      message: 'Application approved successfully.',
      participantId,
      plainPassword,
      userId: user.id,
    });
  } catch (error) {
    await t.rollback();
    console.error('Approve application error:', error.message);
    res.status(500).json({ error: 'Server error approving application.' });
  }
}

// ─── Reject Application ───────────────────────────────────────────────────

async function rejectApplication(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const application = await RegistrationApplication.findOne({
      where: { id, status: 'PENDING' },
    });
    if (!application) {
      return res.status(404).json({ error: 'Pending application not found.' });
    }

    await application.update({
      status: 'REJECTED',
      rejectionReason: reason || null,
      reviewerId: req.user.id,
      reviewedAt: new Date(),
    });

    // Log activity
    try {
      const ActivityService = require('../services/activityService');
      await ActivityService.logActivity({
        userId: req.user.id,
        userName: req.user.name || 'Admin',
        action: 'APPLICATION_REJECTED',
        entityType: 'RegistrationApplication',
        entityId: application.id,
        details: { participantName: `${application.firstName} ${application.lastName}`, reason },
      }, req.app.get('io'));
    } catch (e) { /* non-critical */ }

    res.json({ success: true, message: 'Application rejected.' });
  } catch (error) {
    console.error('Reject application error:', error.message);
    res.status(500).json({ error: 'Server error rejecting application.' });
  }
}

// ─── Assign Trainer ───────────────────────────────────────────────────────

async function assignTrainer(req, res) {
  try {
    const { id } = req.params;
    const { trainerId } = req.body;

    const application = await RegistrationApplication.findByPk(id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    if (application.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Can only assign trainers to approved applications.' });
    }

    const trainer = await User.findOne({ where: { id: trainerId, role: 'TRAINER' } });
    if (!trainer) {
      return res.status(400).json({ error: 'Invalid trainer.' });
    }

    await application.update({ trainerId });

    // Ensure trainer is assigned to this training
    const existing = await TrainingTrainerAssignment.findOne({
      where: { trainingId: application.trainingId, trainerId },
    });
    if (!existing) {
      await TrainingTrainerAssignment.create({
        trainingId: application.trainingId,
        trainerId,
      });
    }

    // Notify trainer
    await Notification.create({
      userId: trainerId,
      message: `Participant ${application.firstName} ${application.lastName} (${application.participantId}) has been assigned to you.`,
      type: 'ENROLLMENT',
      isRead: false,
    });

    res.json({ success: true, message: `Trainer ${trainer.name} assigned successfully.` });
  } catch (error) {
    console.error('Assign trainer error:', error.message);
    res.status(500).json({ error: 'Server error assigning trainer.' });
  }
}

// ─── Send Credentials ─────────────────────────────────────────────────────

async function sendCredentials(req, res) {
  try {
    const { id } = req.params;

    const application = await RegistrationApplication.findOne({
      where: { id },
      include: [{ model: Training, as: 'training', attributes: ['id', 'title'] }],
    });
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    if (application.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Application must be approved first.' });
    }
    if (!application.participantId || !application.plainPassword) {
      return res.status(400).json({ error: 'No credentials available. They may have already been sent.' });
    }

    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

    // Send email
    if (isEmailConfigured()) {
      await sendCredentialsEmail({
        to: application.email,
        participantName: `${application.firstName} ${application.lastName}`,
        trainingName: application.training?.title || 'Training Program',
        participantId: application.participantId,
        temporaryPassword: application.plainPassword,
        loginUrl,
      });
    }

    // Update application
    await application.update({
      credentialsSentAt: new Date(),
      credentialsSentBy: req.user.id,
      plainPassword: null, // Clear after sending
    });

    // Notify participant
    if (application.userId) {
      await Notification.create({
        userId: application.userId,
        message: 'Your login credentials have been sent to your email. Check your inbox!',
        type: 'APPROVAL',
        isRead: false,
      });
    }

    res.json({
      success: true,
      message: `Credentials sent to ${application.email}.`,
      emailSent: isEmailConfigured(),
    });
  } catch (error) {
    console.error('Send credentials error:', error.message);
    res.status(500).json({ error: 'Server error sending credentials.' });
  }
}

// ─── Get Application Stats ────────────────────────────────────────────────

async function getApplicationStats(req, res) {
  try {
    const [total, pending, approved, rejected, waitlisted] = await Promise.all([
      RegistrationApplication.count(),
      RegistrationApplication.count({ where: { status: 'PENDING' } }),
      RegistrationApplication.count({ where: { status: 'APPROVED' } }),
      RegistrationApplication.count({ where: { status: 'REJECTED' } }),
      RegistrationApplication.count({ where: { status: 'WAITLISTED' } }),
    ]);

    const thisMonth = await RegistrationApplication.count({
      where: {
        created_at: { [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });

    res.json({ total, pending, approved, rejected, waitlisted, thisMonth });
  } catch (error) {
    console.error('Get application stats error:', error.message);
    res.status(500).json({ error: 'Server error fetching stats.' });
  }
}

// ─── Get Trainers for Assignment ──────────────────────────────────────────

async function getAvailableTrainers(req, res) {
  try {
    const { trainingId } = req.query;
    const where = { role: 'TRAINER' };

    if (trainingId) {
      const assignedTrainerIds = (await TrainingTrainerAssignment.findAll({
        where: { trainingId: parseInt(trainingId) },
        attributes: ['trainerId'],
      })).map(a => a.trainerId);

      if (assignedTrainerIds.length > 0) {
        where.id = { [Op.in]: assignedTrainerIds };
      }
    }

    const trainers = await User.findAll({
      where,
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']],
    });

    res.json({ trainers });
  } catch (error) {
    console.error('Get available trainers error:', error.message);
    res.status(500).json({ error: 'Server error fetching trainers.' });
  }
}

// ─── Export Applications to Excel ─────────────────────────────────────────

async function exportApplications(req, res) {
  try {
    const { status, startDate, endDate } = req.query;
    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = new Date(startDate);
      if (endDate) where.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    const applications = await RegistrationApplication.findAll({
      where,
      include: [
        { model: Training, as: 'training', attributes: ['title'] },
        { model: User, as: 'trainer', attributes: ['name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Applications');

    const headers = [
      'Application ID', 'Participant ID', 'Name', 'Email', 'Phone',
      'Training Program', 'Trainer', 'Status', 'AI Score',
      'Generated Password', 'Application Date', 'Review Date',
    ];
    const hRow = sheet.addRow(headers);
    hRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    hRow.height = 28;

    for (const app of applications) {
      sheet.addRow([
        app.applicationNumber || `-`,
        app.participantId || `-`,
        `${app.firstName} ${app.lastName}`,
        app.email,
        app.phone || '-',
        app.training?.title || 'Unknown',
        app.trainer?.name || '-',
        app.status,
        app.aiScore ? `${app.aiScore}%` : '-',
        app.plainPassword || '(sent)',
        app.created_at ? new Date(app.created_at).toLocaleDateString() : '-',
        app.reviewedAt ? new Date(app.reviewedAt).toLocaleDateString() : '-',
      ]);
    }

    // Auto-fit columns
    headers.forEach((_, i) => { sheet.getColumn(i + 1).width = Math.max(16, headers[i].length + 4); });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Registration_Applications.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export applications error:', error.message);
    res.status(500).json({ error: 'Failed to export applications.' });
  }
}

// ─── Get Trainer's Pending Credentials ────────────────────────────────────

async function getTrainerCredentials(req, res) {
  try {
    const trainerId = req.user.id;

    const applications = await RegistrationApplication.findAll({
      where: {
        trainerId,
        status: 'APPROVED',
      },
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const credentials = applications.map(a => ({
      id: a.id,
      applicationNumber: a.applicationNumber,
      firstName: a.firstName,
      lastName: a.lastName,
      fullName: `${a.firstName} ${a.lastName}`,
      email: a.email,
      phone: a.phone,
      trainingTitle: a.training?.title || 'Unknown',
      participantId: a.participantId,
      hasPendingPassword: !!a.plainPassword,
      credentialsSentAt: a.credentialsSentAt,
      createdAt: a.created_at,
    }));

    res.json({ credentials });
  } catch (error) {
    console.error('Get trainer credentials error:', error.message);
    res.status(500).json({ error: 'Server error fetching credentials.' });
  }
}

module.exports = {
  submitApplication,
  getApplications,
  approveApplication,
  rejectApplication,
  assignTrainer,
  sendCredentials,
  getApplicationStats,
  getAvailableTrainers,
  exportApplications,
  getTrainerCredentials,
};
