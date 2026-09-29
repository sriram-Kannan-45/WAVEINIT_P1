const policyService = require('../services/hireProctoringPolicy');
const proctoringService = require('../services/hireProctoringService');
const { AssessmentVerificationSession } = require('../models');
const scanTransport = require('../socket/assessmentVerificationEvents');

const fail = (res, error) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Hire proctoring request failed' });

async function getPolicy(req, res) {
  try {
    const resolved = await policyService.resolvePolicy(req.params.type, req.params.engineId, req.user.id);
    if (!resolved.isHire || !resolved.assigned) return res.status(403).json({ error: 'Hiring assessment assignment required' });
    let state = null;
    if (req.query.sessionId && resolved.policy.enabled) {
      const owned = await proctoringService.requireOwnedHireSession(req.query.sessionId, req.user);
      if (String(owned.session.contextType) !== String(req.params.type).toUpperCase() || String(owned.session.contextId) !== String(req.params.engineId)) {
        return res.status(403).json({ error: 'Monitoring session does not belong to this hiring assessment' });
      }
      const value = owned.session.metadata?.hireProctoring || {};
      const room = await proctoringService.getRoomVerificationState({ sessionId: req.query.sessionId, user: req.user });
      state = {
        identityVerifiedAt: value.identityVerifiedAt || null,
        livenessPassed: value.livenessPassed === true,
        ...room,
      };
    }
    res.json({ policy: resolved.policy, assessmentId: resolved.workflow.id, state });
  } catch (error) { fail(res, error); }
}

async function updatePolicy(req, res) {
  try {
    const workflow = await policyService.findWorkflow(req.params.type, req.params.engineId);
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found' });
    const policy = policyService.normalizePolicy(req.body || {});
    await workflow.update({ proctoring_config: policy });
    res.json({ success: true, policy });
  } catch (error) { fail(res, error); }
}

async function getChallenge(req, res) {
  try {
    const { session, policy } = await proctoringService.requireOwnedHireSession(req.params.sessionId, req.user);
    // Allow challenge generation for any pre-verification status, including
    // ACTIVE (which can occur when the quiz attempt starts before identity
    // verification completes on the verification page).
    const alreadyVerified = !!session.metadata?.hireProctoring?.identityVerifiedAt;
    if (alreadyVerified) return res.status(409).json({ error: 'Identity has already been verified for this session.' });
    const current = session.metadata?.hireProctoring || {};
    const challenges = policy.livenessDetection === false ? ['LOOK_CENTER'] : ['TURN_LEFT', 'TURN_RIGHT', 'LOOK_CENTER'];
    const completed = Array.isArray(current.completedLivenessChallenges) ? current.completedLivenessChallenges : [];
    const challenge = challenges[completed.length] || challenges[0];
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: { ...current, challenge, challengeExpiresAt: expiresAt,
      completedLivenessChallenges: completed } } });
    res.json({ challenge, expiresAt, completedChallenges: completed, challengeCount: challenges.length });
  } catch (error) { fail(res, error); }
}

async function captureIdentity(req, res) {
  try {
    const owned = await proctoringService.requireOwnedHireSession(req.params.sessionId, req.user);
    const expected = owned.session.metadata?.hireProctoring?.challenge;
    const expires = Date.parse(owned.session.metadata?.hireProctoring?.challengeExpiresAt || 0);
    if (!expected || expected !== req.body.challenge || !expires || expires < Date.now()) return res.status(409).json({ error: 'Liveness challenge expired. Request a new challenge.' });
    res.json(await proctoringService.storeIdentityReference({ sessionId: req.params.sessionId, user: req.user, frames: req.body.frames, challenge: expected }));
  } catch (error) { fail(res, error); }
}

async function verifyIdentity(req, res) {
  try { res.json(await proctoringService.verifyIdentity({ sessionId: req.params.sessionId, user: req.user, frame: req.body.frame })); }
  catch (error) { fail(res, error); }
}

async function inspectRoom(req, res) {
  try { res.json(await proctoringService.inspectRoom({ sessionId: req.params.sessionId, user: req.user, frames: req.body.frames })); }
  catch (error) { fail(res, error); }
}

async function roomStep(req, res) {
  // Guided photos are accepted only through the authenticated paired-phone
  // socket, where the server can bind the binary frame to the active stream.
  // Keep this legacy route explicit instead of letting a REST client spoof a
  // stream id and bypass the QR/device binding.
  return res.status(409).json({ success: false, errorCode: 'CAMERA_NOT_READY',
    message: 'Use the paired mobile camera to capture this room photo.' });
}

async function roomScan360(req, res) {
  try {
    const { session } = await proctoringService.requireOwnedHireSession(req.params.sessionId, req.user);
    const paired = await AssessmentVerificationSession.findOne({ where: {
      participant_id: req.user.id, assessment_id: session.contextId,
      assessment_type: session.contextType, attempt_id: session.attemptId,
      status: ['PAIRED', 'VERIFIED', 'USED'],
    }, order: [['created_at', 'DESC']] });
    const io = req.app.get('io');
    const peers = paired && io ? await io.in(`assessment_verif_${paired.session_id}`).fetchSockets() : [];
    const phone = peers.find(peer => peer.data?.assessmentVerification?.role === 'mobile_camera' &&
        peer.data.assessmentVerification.sessionId === paired.session_id &&
        peer.data.assessmentVerification.mobileStreamId);
    if (!phone) {
      return res.status(409).json({ error: 'Waiting for the paired mobile camera.', errorCode: 'QR_NOT_PAIRED' });
    }
    const alreadyApproved = policyService.roomScanApproved(session.metadata?.hireProctoring);
    let result;
    if (alreadyApproved) {
      result = await proctoringService.analyzeRoomScan360({ sessionId: req.params.sessionId,
        user: req.user, frames: req.body.frames });
    } else {
      if (req.body.recordingComplete !== true) return res.status(422).json({
        error: 'Finish the 180° room recording before review.', errorCode: 'ROOM_RECORDING_INCOMPLETE' });
      const orientations = scanTransport.consumeScanSamples(paired.session_id, phone.id, req.body.frames);
      if (!orientations) return res.status(409).json({ error: 'Waiting for fresh frames from the paired phone camera.',
        errorCode: 'PHONE_SCAN_SAMPLES_REQUIRED' });
      result = await proctoringService.analyzeRoomScan360({ sessionId: req.params.sessionId, user: req.user,
        frames: req.body.frames, orientations, laptopFrames: req.body.laptopFrames, recordingComplete: true });
    }
    // The phone must receive this server verdict even if the laptop's UI
    // room_state broadcast races the HTTP response or is lost on reconnect.
    if (result.roomScanClear === true && io && paired) {
      require('../socket/crossInstance').relayEmit(io, 'room', `assessment_verif_${paired.session_id}`,
        'assessment_verif:workspace_ready', { sessionId: paired.session_id, ready: true });
    }
    return res.json(result); }
  catch (error) { fail(res, error); }
}

async function roomState(req, res) {
  try { res.json(await proctoringService.getRoomVerificationState({ sessionId: req.params.sessionId, user: req.user })); }
  catch (error) { fail(res, error); }
}

module.exports = { getPolicy, updatePolicy, getChallenge, captureIdentity, verifyIdentity, inspectRoom, roomStep, roomScan360, roomState };
