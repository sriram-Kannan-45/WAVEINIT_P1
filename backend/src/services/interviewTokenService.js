/**
 * Interview Token Service
 * Manages one-time pairing tokens for mobile device pairing.
 * Handles creation, validation, and atomic consumption of tokens.
 */

const crypto = require('crypto');
const { Op } = require('sequelize');
const { InterviewDevice } = require('../models');
const logger = require('../utils/logger');

const TOKEN_EXPIRY_MINUTES = 5;
const MAX_TOKENS_PER_SESSION = 5;
const TOKEN_COOLDOWN_MS = 60_000; // 1 minute

class InterviewTokenService {
  /**
   * Generate a one-time pairing token for a device in a session.
   * Rate-limited: max MAX_TOKENS_PER_SESSION per session per user with cooldown.
   */
  async generatePairingToken(sessionId, userId, deviceType) {
    // Rate-limit check: count recent tokens for this session+user
    const recentCount = await InterviewDevice.count({
      where: {
        session_id: sessionId,
        user_id: userId,
        device_type: deviceType,
        created_at: { [Op.gte]: new Date(Date.now() - TOKEN_COOLDOWN_MS * MAX_TOKENS_PER_SESSION) },
      },
    });

    if (recentCount >= MAX_TOKENS_PER_SESSION) {
      throw Object.assign(new Error('Too many token requests. Please wait before requesting a new code.'), {
        status: 429,
        code: 'RATE_LIMITED',
      });
    }

    // Invalidate any existing PENDING tokens for this session+user+device
    await InterviewDevice.update(
      { token_status: 'EXPIRED' },
      {
        where: {
          session_id: sessionId,
          user_id: userId,
          device_type: deviceType,
          token_status: 'PENDING',
        },
      }
    );

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60_000);

    const device = await InterviewDevice.create({
      session_id: sessionId,
      user_id: userId,
      device_type: deviceType,
      pairing_token: token,
      token_status: 'PENDING',
      token_expires_at: expiresAt,
      status: 'PAIRED',
    });

    logger.info('Pairing token generated', { sessionId, userId, deviceType, expiresAt });
    return { token, expiresAt, deviceId: device.id };
  }

  /**
   * Validate and consume a pairing token atomically.
   * Uses UPDATE...WHERE to guarantee single consumption (race-condition safe).
   * Returns the device record on success, null on failure.
   */
  async consumePairingToken(token, expectedUserId) {
    // Atomic: find and mark as CONSUMED in one operation
    const [updatedCount] = await InterviewDevice.update(
      { token_status: 'CONSUMED' },
      {
        where: {
          pairing_token: token,
          token_status: 'PENDING',
        },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      // Token not found or already consumed/expired
      const existing = await InterviewDevice.findOne({ where: { pairing_token: token } });
      if (!existing) {
        return { success: false, status: 404, message: 'Invalid pairing token' };
      }
      if (existing.token_status === 'CONSUMED') {
        return { success: false, status: 410, message: 'Token already used. Please request a new QR code.' };
      }
      if (existing.token_status === 'EXPIRED') {
        return { success: false, status: 410, message: 'Token expired. Please request a new QR code.' };
      }
      return { success: false, status: 410, message: 'Token no longer valid' };
    }

    // Fetch the updated record
    const device = await InterviewDevice.findOne({
      where: { pairing_token: token },
    });

    // Validate user identity
    if (expectedUserId && device.user_id !== expectedUserId) {
      return { success: false, status: 403, message: 'Token does not belong to this user' };
    }

    // Check expiry (belt-and-suspenders with the DB constraint)
    if (device.token_expires_at && new Date(device.token_expires_at) < new Date()) {
      await device.update({ token_status: 'EXPIRED' });
      return { success: false, status: 410, message: 'Token expired. Please request a new QR code.' };
    }

    logger.info('Pairing token consumed', { deviceId: device.id, sessionId: device.session_id });
    return { success: true, device };
  }

  /**
   * Check if a token is expired and clean it up.
   */
  async expireStaleTokens() {
    const expired = await InterviewDevice.update(
      { token_status: 'EXPIRED' },
      {
        where: {
          token_status: 'PENDING',
          token_expires_at: { [Op.lt]: new Date() },
        },
      }
    );
    if (expired[0] > 0) {
      logger.info(`Expired ${expired[0]} stale pairing tokens`);
    }
    return expired[0];
  }

  /**
   * Mark a device as connected.
   */
  async markConnected(deviceId) {
    await InterviewDevice.update(
      { status: 'CONNECTED', connected_at: new Date() },
      { where: { id: deviceId } }
    );
  }

  /**
   * Mark a device as disconnected.
   */
  async markDisconnected(deviceId) {
    await InterviewDevice.update(
      { status: 'DISCONNECTED', disconnected_at: new Date() },
      { where: { id: deviceId } }
    );
  }

  /**
   * Get all devices for a session.
   */
  async getSessionDevices(sessionId) {
    return InterviewDevice.findAll({
      where: { session_id: sessionId },
      order: [['created_at', 'ASC']],
    });
  }
}

module.exports = new InterviewTokenService();
