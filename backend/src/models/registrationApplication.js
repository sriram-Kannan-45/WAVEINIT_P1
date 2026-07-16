const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * RegistrationApplication
 * ───────────────────────
 * Stores participant registration applications before approval.
 * On approval, a User account is created and linked via userId.
 *
 * Workflow: PENDING → APPROVED / REJECTED / WAITLISTED
 */
const RegistrationApplication = sequelize.define('RegistrationApplication', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  applicationNumber: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true,
    field: 'application_number',
  },
  // ── Personal Info ──
  firstName: {
    type: DataTypes.STRING(80),
    allowNull: false,
    field: 'first_name',
  },
  lastName: {
    type: DataTypes.STRING(80),
    allowNull: false,
    field: 'last_name',
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  gender: {
    type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'),
    allowNull: true,
  },
  dob: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'date_of_birth',
  },
  // ── Education & Experience ──
  qualification: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  experience: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  // ── Address ──
  address: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  state: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  country: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  // ── Training Selection ──
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'training_id',
  },
  batch: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  // ── Documents ──
  resumeUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'resume_url',
  },
  profilePhotoUrl: {
    type: DataTypes.TEXT('medium'),
    allowNull: true,
    field: 'profile_photo_url',
  },
  // ── AI Analysis ──
  aiScore: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'ai_score',
    comment: 'Application score 0-100 from AI validation',
  },
  aiRecommendations: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'ai_recommendations',
    get() {
      const raw = this.getDataValue('aiRecommendations');
      if (!raw) return {};
      try { return JSON.parse(raw); } catch { return {}; }
    },
    set(value) {
      this.setDataValue('aiRecommendations', value ? JSON.stringify(value) : null);
    },
  },
  dropoutRisk: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'dropout_risk',
  },
  recommendedBatch: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'recommended_batch',
  },
  // ── Workflow ──
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  reviewerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'reviewer_id',
    comment: 'Admin who reviewed the application',
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reviewed_at',
  },
  rejectionReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'rejection_reason',
  },
  // ── Post-Approval ──
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'user_id',
    comment: 'Link to created User account after approval',
  },
  participantId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'participant_id',
    comment: 'Generated participant ID e.g. WI123',
  },
  participantPassword: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'participant_password',
    comment: 'Hashed password stored for reference (plaintext shown once)',
  },
  plainPassword: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'plain_password',
    comment: 'Temp plain password shown once then cleared',
  },
  trainerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'trainer_id',
  },
  credentialsSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'credentials_sent_at',
  },
  credentialsSentBy: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'credentials_sent_by',
  },
}, {
  tableName: 'registration_applications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = RegistrationApplication;
