/**
 * Interview Token Service
 * Manages one-time pairing tokens for mobile device pairing.
 * Handles creation, validation, and atomic consumption of tokens.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
  async generatePairingToken(sessionId, userId, deviceType, transaction = null) {
    const {sequelize,InterviewSession}=require('../models');
    if(!transaction) return sequelize.transaction(tx=>this.generatePairingToken(sessionId,userId,deviceType,tx));
    const session=await InterviewSession.findByPk(sessionId,{transaction,lock:transaction.LOCK.UPDATE});
    if(!session || !['WAITING','ACTIVE'].includes(session.status)) throw new Error('Interview session has ended');
    const paired=await InterviewDevice.findOne({transaction,where:{session_id:sessionId,user_id:userId,device_type:deviceType,token_status:{[Op.in]:['PENDING','CONSUMED']}},order:[['id','DESC']]});
    if(paired && (paired.token_status==='CONSUMED'||new Date(paired.token_expires_at)>new Date())) return {token:paired.pairing_token,expiresAt:paired.token_expires_at,deviceId:paired.id,reusable:paired.token_status==='CONSUMED'};
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

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60_000);

    // Reuse an existing PENDING device row for this session+user+device so
    // refreshes don't grow the table unboundedly (the QR refresh path).
    const existing = await InterviewDevice.findOne({
      transaction,
      where: {
        session_id: sessionId,
        user_id: userId,
        device_type: deviceType,
        token_status: 'PENDING',
      },
    });

    const device = existing
      ? await existing.update({
          pairing_token: token,
          token_status: 'PENDING',
          token_expires_at: expiresAt,
          status: 'PAIRED',
          connected_at: null,
          disconnected_at: null,
        }, {transaction})
      : await InterviewDevice.create({
          session_id: sessionId,
          user_id: userId,
          device_type: deviceType,
          pairing_token: token,
          token_status: 'PENDING',
          token_expires_at: expiresAt,
          status: 'PAIRED',
        }, {transaction});

    logger.info('Pairing token generated', { sessionId, userId, deviceType, expiresAt });
    return { token, expiresAt, deviceId: device.id, reusable:false };
  }

  /**
   * Validate and consume a pairing token atomically.
   * Uses UPDATE...WHERE to guarantee single consumption (race-condition safe).
   * Returns the device record on success, null on failure.
   */
  async consumePairingToken(token, expectedUserId) {
    const result=await this.validatePairingToken(token);
    if(!result.success) return result;
    if(expectedUserId && String(result.device.user_id)!==String(expectedUserId)) return {success:false,status:403,message:'Token does not belong to this user'};
    if(result.device.token_status==='PENDING') {
      await InterviewDevice.update({token_status:'CONSUMED'},{where:{id:result.device.id,user_id:result.device.user_id,token_status:'PENDING',token_expires_at:{[Op.gt]:new Date()}}});
      const current=await this.validatePairingToken(token);
      if(!current.success || current.device.token_status!=='CONSUMED') return {success:false,status:410,message:'Pairing expired. Please refresh the QR code.'};
      return current;
    }
    return {...result,reconnected:true};
  }

  /**
   * Validate a pairing token without consuming it.
   * Returns the device record if valid (PENDING or CONSUMED for socket reconnects), or an error.
   */
  async validatePairingToken(token) {
    if(!token) return {success:false,status:400,message:'Pairing token required'};
    const device=await InterviewDevice.findOne({where:{pairing_token:token}});
    if(!device || device.token_status==='EXPIRED') return {success:false,status:404,message:'Invalid pairing code'};
    const {InterviewSession,Interview}=require('../models');
    const session=await InterviewSession.findByPk(device.session_id);
    const interview=session && await Interview.findByPk(session.interview_id);
    if(!session || !['WAITING','ACTIVE'].includes(session.status) || !interview || !['SCHEDULED','IN_PROGRESS'].includes(interview.status)) return {success:false,status:410,message:'This interview session has ended'};
    if(device.token_status==='PENDING' && new Date(device.token_expires_at)<=new Date()) return {success:false,status:410,message:'Pairing code expired. Refresh the QR code.'};
    return {success:true,device};
  }

  /**
   * Issue a short-lived JWT that lets a mobile device open a Socket.IO
   * connection as its paired interview device. The token embeds the one-time
   * pairing token, which the socket middleware re-validates on connect and
   * which is consumed when the device joins the room.
   */
  async issueSocketToken(device, interviewId) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(
      {
        id: device.user_id,
        role: 'PARTICIPANT',
        deviceType: 'MOBILE',
        pairingToken: device.pairing_token,
        sessionId: device.session_id,
        interviewId,
      },
      secret,
      { expiresIn: '15m' }
    );
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
