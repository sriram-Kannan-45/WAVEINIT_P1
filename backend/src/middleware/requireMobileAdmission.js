const verification = require('../services/assessmentVerificationService');

module.exports = assessmentType => async (req, res, next) => {
  try {
    await verification.assertAttemptAdmitted({ participantId: req.user.id, assessmentType,
      attemptId: Number(req.params.attemptId || req.body?.attemptId || req.query?.attemptId) });
    next();
  } catch (error) {
    res.status(403).json({ error: 'MOBILE_VERIFICATION_REQUIRED', message: error.message });
  }
};
