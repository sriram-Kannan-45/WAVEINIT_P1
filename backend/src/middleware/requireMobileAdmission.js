const verification = require('../services/assessmentVerificationService');

module.exports = assessmentType => async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId || req.body?.attemptId || req.query?.attemptId);
    await verification.assertAttemptAdmitted({ participantId: req.user.id, assessmentType,
      attemptId });
    next();
  } catch (error) {
    res.status(403).json({ error: 'ASSESSMENT_VERIFICATION_REQUIRED', message: error.message });
  }
};
