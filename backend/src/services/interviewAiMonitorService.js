/**
 * Interview AI Monitor Service
 * Placeholder service for AI-based interview monitoring.
 * Client-side detectors emit socket events; this service persists them.
 */

const { InterviewAlert, InterviewLog, InterviewSession } = require('../models');
const logger = require('../utils/logger');

class InterviewAiMonitorService {
  /**
   * Process an alert received from a client-side detector and persist it.
   */
  async processAlert(sessionId, { alertType, severity, sourceDevice, message, metadata }) {
    const alert = await InterviewAlert.create({
      session_id: sessionId,
      alert_type: alertType,
      severity: severity || 'MEDIUM',
      source_device: sourceDevice || 'LAPTOP',
      message,
      metadata: metadata || null,
      ts: new Date(),
    });

    // Also log to interview_logs for audit trail
    await InterviewLog.create({
      session_id: sessionId,
      event_type: 'AI_ALERT',
      payload_json: { alertId: alert.id, alertType, severity, sourceDevice },
      ts: new Date(),
    });

    logger.info('AI alert processed', { sessionId, alertType, severity });
    return alert;
  }

  /**
   * Get all alerts for a session, optionally filtered by severity.
   */
  async getAlerts(sessionId, { severity, limit = 100 } = {}) {
    const where = { session_id: sessionId };
    if (severity) where.severity = severity;

    return InterviewAlert.findAll({
      where,
      order: [['ts', 'DESC']],
      limit,
    });
  }

  /**
   * Get alert summary stats for a session.
   */
  async getAlertSummary(sessionId) {
    const alerts = await InterviewAlert.findAll({
      where: { session_id: sessionId },
      attributes: ['alert_type', 'severity'],
    });

    const summary = { total: alerts.length, byType: {}, bySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0 } };
    for (const alert of alerts) {
      summary.byType[alert.alert_type] = (summary.byType[alert.alert_type] || 0) + 1;
      summary.bySeverity[alert.severity]++;
    }
    return summary;
  }
}

module.exports = new InterviewAiMonitorService();
