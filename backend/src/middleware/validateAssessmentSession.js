const { Op } = require('sequelize');
const { AssessmentSession } = require('../models');

const validateAssessmentSession = async (req, res, next) => {
  try {
    const sessionToken =
      req.headers['x-assessment-session'] ||
      req.headers['X-Assessment-Session'] ||
      '';
    const attemptId = req.params.attemptId || req.body?.attemptId || req.query?.attemptId;

    if (!sessionToken || !attemptId) {
      return res.status(401).json({
        error: 'SESSION_INVALID',
        message: 'Assessment session is invalid or expired.',
      });
    }

    const session = await AssessmentSession.findOne({
      where: {
        sessionToken,
        [Op.or]: [
          { attemptId },
          { codingAttemptId: attemptId },
        ],
        status: 'ACTIVE',
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!session) {
      return res.status(401).json({
        error: 'SESSION_INVALID',
        message: 'Assessment session is invalid or expired.',
      });
    }

    if (req.user?.id && Number(session.participantId) !== Number(req.user.id)) {
      return res.status(403).json({
        error: 'SESSION_FORBIDDEN',
        message: 'This session does not belong to the authenticated user.',
      });
    }

    req.assessmentSession = session;
    return next();
  } catch (err) {
    console.error('[validateAssessmentSession] error:', err.message);
    return res.status(500).json({
      error: 'SESSION_VALIDATION_FAILED',
      message: 'Could not validate assessment session.',
    });
  }
};

module.exports = validateAssessmentSession;
