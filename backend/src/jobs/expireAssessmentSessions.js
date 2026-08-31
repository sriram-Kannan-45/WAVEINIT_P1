/**
 * expireAssessmentSessions
 * ─────────────────────────────────────────────────────────────────────────
 * Background sweep that flips ACTIVE → EXPIRED for any assessment_session
 * whose expires_at is in the past. Runs in-process via setInterval; the
 * timer is unref()'d so it doesn't keep the Node event loop alive on
 * graceful shutdown.
 *
 * Exports:
 *   sweepExpiredAssessmentSessions()           — one-shot run, returns affected count
 *   startAssessmentSessionExpiryJob({ intervalMs, logger })
 *                                              — registers the periodic sweep
 */

const { Op } = require('sequelize');
const { AssessmentSession } = require('../models');
const { withLeaderLock } = require('../utils/leaderElection');

async function sweepExpiredAssessmentSessions() {
  const [affected] = await AssessmentSession.update(
    { status: 'EXPIRED' },
    {
      where: {
        status: 'ACTIVE',
        expiresAt: { [Op.lt]: new Date() },
      },
    }
  );
  return affected || 0;
}

function startAssessmentSessionExpiryJob({ intervalMs = 5 * 60_000, logger = console } = {}) {
  // Leader-guarded: across multiple instances only one runs the sweep.
  const sweepLeaderGuarded = () =>
    withLeaderLock('cron:assessment-session-expiry', () => sweepExpiredAssessmentSessions());

  // Run once at boot so any rows that expired while the server was down
  // get cleaned up immediately rather than waiting up to intervalMs.
  sweepLeaderGuarded()
    .then((n) => { if (n > 0) logger.info?.(`[assessment-session-expiry] swept ${n} expired session(s) at boot`); })
    .catch((err) => logger.warn?.('[assessment-session-expiry] boot sweep failed', { error: err.message }));

  const handle = setInterval(() => {
    sweepLeaderGuarded()
      .then((n) => { if (n > 0) logger.info?.(`[assessment-session-expiry] swept ${n} expired session(s)`); })
      .catch((err) => logger.warn?.('[assessment-session-expiry] sweep failed', { error: err.message }));
  }, intervalMs);

  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}

module.exports = {
  sweepExpiredAssessmentSessions,
  startAssessmentSessionExpiryJob,
};
