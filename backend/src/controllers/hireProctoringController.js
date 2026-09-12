const crypto = require('crypto');
const policyService = require('../services/hireProctoringPolicy');
const proctoringService = require('../services/hireProctoringService');

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
      state = {
        identityVerifiedAt: value.identityVerifiedAt || null,
        livenessPassed: value.livenessPassed === true,
        roomScanCompletedAt: value.roomScanCompletedAt || null,
        roomScanClear: value.roomScanClear === true,
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
    const { session } = await proctoringService.requireOwnedHireSession(req.params.sessionId, req.user);
    if (!['CALIBRATING', 'READY'].includes(session.status)) return res.status(409).json({ error: 'Identity challenges are available only before the assessment starts.' });
    if (session.metadata?.hireProctoring?.identityVerifiedAt) return res.status(409).json({ error: 'Identity has already been verified for this session.' });
    const values = ['TURN_LEFT', 'TURN_RIGHT', 'BLINK'];
    const challenge = values[crypto.randomInt(values.length)];
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: { ...(session.metadata?.hireProctoring || {}), challenge, challengeExpiresAt: expiresAt } } });
    res.json({ challenge, expiresAt });
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

module.exports = { getPolicy, updatePolicy, getChallenge, captureIdentity, verifyIdentity, inspectRoom };
