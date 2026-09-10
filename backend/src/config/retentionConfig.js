/**
 * Centralized Data Retention Configuration
 *
 * Configurable via environment variables.
 * Defaults are aligned with educational audit requirements and data minimisation principles.
 */

function parsePositiveInt(val, fallback) {
  const parsed = parseInt(val, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  // Assessment screenshots (webcam captures during exams)
  SCREENSHOT_RETENTION_DAYS: parsePositiveInt(process.env.SCREENSHOT_RETENTION_DAYS, 14),

  // Video recordings from exam proctoring
  PROCTORING_RETENTION_DAYS: parsePositiveInt(process.env.PROCTORING_RETENTION_DAYS, 30),

  // Interview video & audio recordings
  INTERVIEW_RECORDING_RETENTION_DAYS: parsePositiveInt(process.env.INTERVIEW_RECORDING_RETENTION_DAYS, 90),

  // Operational activity logs
  ACTIVITY_LOG_RETENTION_DAYS: parsePositiveInt(process.env.ACTIVITY_LOG_RETENTION_DAYS, 90),

  // Device fingerprints & telemetry
  DEVICE_FINGERPRINT_RETENTION_DAYS: parsePositiveInt(process.env.DEVICE_FINGERPRINT_RETENTION_DAYS, 180),

  // Compliance Audit Logs
  AUDIT_LOG_RETENTION_DAYS: parsePositiveInt(process.env.AUDIT_LOG_RETENTION_DAYS, 365),
};
