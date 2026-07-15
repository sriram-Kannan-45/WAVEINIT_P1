/**
 * sessionLock — verifies that the request belongs to a real, active
 * ExamSession owned by req.user.userId, and that the supplied session
 * token matches what was issued at start. Loads the session onto req.
 *
 * Header:  X-Proctor-Session-Token: <token>
 * Body / Param fallback: sessionId
 */
const { ExamSession } = require('../models');

module.exports = async function sessionLock(req, res, next) {
  try {
    const token = req.header('x-proctor-session-token') || req.body?.sessionToken;
    const sessionId = req.params.sessionId || req.body?.sessionId;
    if (!token && !sessionId) {
      return res.status(401).json({ success: false, message: 'Missing proctoring session credentials' });
    }

    const where = {};
    if (sessionId) where.id = sessionId;
    if (token) where.sessionToken = token;
    where.participantId = req.user.id;

    const session = await ExamSession.findOne({ where });
    if (!session) {
      return res.status(403).json({ success: false, message: 'Invalid proctoring session' });
    }

    if (['SUBMITTED', 'TERMINATED', 'EXPIRED'].includes(session.status)) {
      return res.status(410).json({
        success: false,
        message: 'Proctoring session has ended',
        status: session.status,
        terminationReason: session.terminationReason,
      });
    }

    req.examSession = session;
    next();
  } catch (err) {
    next(err);
  }
};
