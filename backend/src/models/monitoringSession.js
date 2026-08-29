const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * MonitoringSession
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for proctoring/monitoring sessions across Quiz,
 * Coding, and Interview modules.
 */
const MonitoringSession = sequelize.define('MonitoringSession', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    field: 'session_id',
    comment: 'Unique UUID/identifier for the monitoring session',
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'attempt_id',
    comment: 'Associated QuizAttempt.id, CodingAttempt.id, or Interview.id',
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id',
    comment: 'Participant User.id',
  },
  contextType: {
    type: DataTypes.ENUM('QUIZ', 'CODING', 'INTERVIEW'),
    allowNull: false,
    defaultValue: 'QUIZ',
    field: 'context_type',
    comment: 'Assessment module type',
  },
  contextId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'context_id',
    comment: 'AIQuiz.id, CodingAssessment.id, or Interview.id',
  },
  laptopStatus: {
    type: DataTypes.ENUM('CALIBRATING', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'DISABLED'),
    allowNull: false,
    defaultValue: 'CALIBRATING',
    field: 'laptop_status',
  },
  mobileStatus: {
    type: DataTypes.ENUM(
      'DISABLED',
      'PAIRING',
      'CONNECTING',
      'WAITING_FOR_PERSON',
      'WAITING_FOR_LAPTOP',
      'POSITIONING_REQUIRED',
      'VALID',
      'WARNING',
      'VIOLATION',
      'DISCONNECTED'
    ),
    allowNull: false,
    defaultValue: 'DISABLED',
    field: 'mobile_status',
  },
  mobileEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'mobile_enabled',
  },
  calibrationPassed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'calibration_passed',
  },
  calibrationDetails: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'calibration_details',
    comment: 'Baseline metrics: lighting, face size, shoulder framing, timestamp',
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
    field: 'score',
    comment: 'Server-side authoritative cumulative malpractice score',
  },
  riskLevel: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'LOW',
    field: 'risk_level',
  },
  totalEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_events',
  },
  warningEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'warning_events',
  },
  highEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'high_events',
  },
  criticalEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'critical_events',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'started_at',
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ended_at',
  },
  status: {
    type: DataTypes.ENUM('CALIBRATING', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ABORTED'),
    allowNull: false,
    defaultValue: 'CALIBRATING',
    field: 'status',
  },
  integrityFlags: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'integrity_flags',
    comment: 'Array of integrity violation flags e.g. CAMERA_DISCONNECTED_MID_TEST, UNCALIBRATED_SUBMISSION',
  },
  mobilePairingToken: {
    type: DataTypes.STRING(128),
    allowNull: true,
    field: 'mobile_pairing_token',
  },
  mobilePairingExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'mobile_pairing_expires_at',
  },
  lastLaptopHeartbeatAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_laptop_heartbeat_at',
  },
  lastMobileHeartbeatAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_mobile_heartbeat_at',
  },
  videoUrl: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'video_url',
    comment: 'URL/path to recorded proctoring/monitoring session video',
  },
}, {
  tableName: 'monitoring_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'], unique: true },
    { fields: ['attempt_id'] },
    { fields: ['participant_id'] },
    { fields: ['context_type', 'context_id'] },
    { fields: ['status'] },
    { fields: ['risk_level'] },
  ],
});

module.exports = MonitoringSession;
