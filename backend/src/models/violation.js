/**
 * Violation — append-only audit log of every proctoring incident.
 *
 * Type values mirror frontend constants. Severity drives whether a
 * violation increments the warning counter or auto-terminates.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Violation = sequelize.define('Violation', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'session_id',
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id',
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'quiz_id',
  },
  type: {
    type: DataTypes.ENUM(
      'FULLSCREEN_EXIT',
      'TAB_SWITCH',
      'WINDOW_BLUR',
      'BROWSER_MINIMIZE',
      'SCREEN_SHARE_STOPPED',
      'SCREEN_SHARE_DENIED',
      'COPY_ATTEMPT',
      'PASTE_ATTEMPT',
      'RIGHT_CLICK',
      'BLOCKED_SHORTCUT',
      'DEVTOOLS_OPENED',
      'REFRESH_ATTEMPT',
      'NAVIGATION_ATTEMPT',
      'MULTIPLE_LOGIN',
      'NETWORK_LOST',
      'HEARTBEAT_LOST',
      'TERMINATED',
      'SCREENSHOT_ATTEMPT',
      'MOUSE_LEAVE',
      'CLIPBOARD_ATTEMPT',
      'NETWORK_TIMEOUT',
      'FACE_ABSENT',
      'FACE_MULTIPLE',
      'LOOKING_AWAY',
      'MOBILE_DETECTED',
      'TRAINER_WARNING',
      'MIC_MUTED',
      'CAMERA_OFF',
      'FACE_NOT_VISIBLE',
    ),
    allowNull: false,
  },
  severity: {
    type: DataTypes.ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'MEDIUM',
  },
  message: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  occurredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'occurred_at',
  },
}, {
  tableName: 'proctor_violations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['session_id'] },
    { fields: ['participant_id'] },
    { fields: ['quiz_id'] },
    { fields: ['type'] },
  ],
});

module.exports = Violation;
