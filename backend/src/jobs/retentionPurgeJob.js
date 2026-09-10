/**
 * Scheduled Data Retention & Automated Purge Job
 *
 * Enforces configured data minimization policies:
 * - Purges exam screenshots older than SCREENSHOT_RETENTION_DAYS
 * - Purges proctoring video segments and quiz recordings older than PROCTORING_RETENTION_DAYS
 * - Purges interview recordings older than INTERVIEW_RECORDING_RETENTION_DAYS
 * - Purges stale device fingerprints older than DEVICE_FINGERPRINT_RETENTION_DAYS
 * - Purges operational activity logs older than ACTIVITY_LOG_RETENTION_DAYS
 *
 * Safety & Security:
 * - Safely unlinks underlying physical media from disk before deleting database records
 * - Gracefully handles missing files without interrupting job execution
 * - Idempotent execution
 * - Logs only high-level operational statistics
 */

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const retentionConfig = require('../config/retentionConfig');
const { resolveUploadsPath } = require('../config/paths');
const logger = require('../utils/logger');

function safeUnlink(fileRef) {
  if (!fileRef || typeof fileRef !== 'string') return false;
  try {
    const fullPath = resolveUploadsPath(fileRef);
    if (fullPath && fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
      fs.unlinkSync(fullPath);
      return true;
    }
  } catch (err) {
    // Non-fatal, file might be missing or locked
  }
  return false;
}

async function runRetentionPurge() {
  const startTime = Date.now();
  const summary = {
    screenshotsDeleted: 0,
    monitorScreenshotsDeleted: 0,
    videoSegmentsDeleted: 0,
    quizRecordingsDeleted: 0,
    interviewRecordingsDeleted: 0,
    activityLogsDeleted: 0,
    deviceFingerprintsDeleted: 0,
    filesUnlinked: 0,
  };

  try {
    const models = require('../models');

    // 1. Exam Screenshots (Proctoring)
    const screenshotCutoff = new Date(Date.now() - retentionConfig.SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    if (models.Screenshot) {
      const expiredShots = await models.Screenshot.findAll({
        where: { created_at: { [Op.lt]: screenshotCutoff } },
        attributes: ['id', 'imageUrl'],
        limit: 1000,
      }).catch(() => []);

      for (const s of expiredShots) {
        if (safeUnlink(s.imageUrl)) summary.filesUnlinked++;
      }

      if (expiredShots.length > 0) {
        summary.screenshotsDeleted = await models.Screenshot.destroy({
          where: { id: { [Op.in]: expiredShots.map(s => s.id) } },
        }).catch(() => 0);
      }
    }

    // 2. Monitor Screenshots (Parallel Monitor)
    if (models.MonitorScreenshot) {
      const expiredMonShots = await models.MonitorScreenshot.findAll({
        where: { created_at: { [Op.lt]: screenshotCutoff } },
        attributes: ['id', 'imageUrl'],
        limit: 1000,
      }).catch(() => []);

      for (const ms of expiredMonShots) {
        if (safeUnlink(ms.imageUrl)) summary.filesUnlinked++;
      }

      if (expiredMonShots.length > 0) {
        summary.monitorScreenshotsDeleted = await models.MonitorScreenshot.destroy({
          where: { id: { [Op.in]: expiredMonShots.map(ms => ms.id) } },
        }).catch(() => 0);
      }
    }

    // 3. Proctoring Video Segments
    const videoCutoff = new Date(Date.now() - retentionConfig.PROCTORING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    if (models.VideoSegment) {
      const expiredSegments = await models.VideoSegment.findAll({
        where: { created_at: { [Op.lt]: videoCutoff } },
        attributes: ['id', 'filePath'],
        limit: 500,
      }).catch(() => []);

      for (const seg of expiredSegments) {
        if (safeUnlink(seg.filePath)) summary.filesUnlinked++;
      }

      if (expiredSegments.length > 0) {
        summary.videoSegmentsDeleted = await models.VideoSegment.destroy({
          where: { id: { [Op.in]: expiredSegments.map(seg => seg.id) } },
        }).catch(() => 0);
      }
    }

    // 4. Quiz Recordings
    if (models.QuizRecording) {
      const expiredQuizRecs = await models.QuizRecording.findAll({
        where: { recorded_at: { [Op.lt]: videoCutoff } },
        attributes: ['id', 'filePath'],
        limit: 500,
      }).catch(() => []);

      for (const qr of expiredQuizRecs) {
        if (safeUnlink(qr.filePath)) summary.filesUnlinked++;
      }

      if (expiredQuizRecs.length > 0) {
        summary.quizRecordingsDeleted = await models.QuizRecording.destroy({
          where: { id: { [Op.in]: expiredQuizRecs.map(qr => qr.id) } },
        }).catch(() => 0);
      }
    }

    // 5. Interview Recordings
    const interviewCutoff = new Date(Date.now() - retentionConfig.INTERVIEW_RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    if (models.InterviewRecording) {
      const expiredInterviews = await models.InterviewRecording.findAll({
        where: { created_at: { [Op.lt]: interviewCutoff } },
        attributes: ['id', 'file_path'],
        limit: 500,
      }).catch(() => []);

      for (const ir of expiredInterviews) {
        if (safeUnlink(ir.file_path)) summary.filesUnlinked++;
      }

      if (expiredInterviews.length > 0) {
        summary.interviewRecordingsDeleted = await models.InterviewRecording.destroy({
          where: { id: { [Op.in]: expiredInterviews.map(ir => ir.id) } },
        }).catch(() => 0);
      }
    }

    // 6. Stale Device Fingerprints
    const fingerprintCutoff = new Date(Date.now() - retentionConfig.DEVICE_FINGERPRINT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    if (models.DeviceFingerprint) {
      summary.deviceFingerprintsDeleted = await models.DeviceFingerprint.destroy({
        where: { created_at: { [Op.lt]: fingerprintCutoff } },
      }).catch(() => 0);
    }

    // 7. Operational Activity Logs
    const activityCutoff = new Date(Date.now() - retentionConfig.ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    if (models.ActivityLog) {
      summary.activityLogsDeleted = await models.ActivityLog.destroy({
        where: { created_at: { [Op.lt]: activityCutoff } },
      }).catch(() => 0);
    }

    const duration = Date.now() - startTime;
    logger.info(`[RETENTION PURGE] Completed in ${duration}ms:`, summary);
    return summary;
  } catch (err) {
    logger.error(`[RETENTION PURGE ERROR] Failed during purge execution: ${err.message}`);
    return summary;
  }
}

/**
 * Initialize background scheduler (runs daily)
 */
function initRetentionScheduler() {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Run on startup after brief initial delay
  setTimeout(() => {
    runRetentionPurge().catch(err => logger.error(`[RETENTION STARTUP ERROR] ${err.message}`));
  }, 10 * 1000).unref();

  // Schedule recurring daily run
  setInterval(() => {
    runRetentionPurge().catch(err => logger.error(`[RETENTION CRON ERROR] ${err.message}`));
  }, ONE_DAY_MS).unref();
}

module.exports = {
  runRetentionPurge,
  initRetentionScheduler,
};
