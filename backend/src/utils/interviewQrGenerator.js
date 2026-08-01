/**
 * Interview QR Generator
 * Generates QR code payload data for mobile device pairing.
 * The frontend renders this using a client-side QR library (e.g., qrcode.react).
 */

const path = require('path');

class InterviewQrGenerator {
  /**
   * Generate QR payload data for mobile pairing.
   * Returns a JSON payload the frontend can render as a QR code.
   */
  generatePairingPayload({ interviewId, sessionId, token, socketUrl }) {
    const payload = JSON.stringify({
      type: 'INTERVIEW_PAIRING',
      interviewId,
      sessionId,
      token,
      socketUrl,
      ts: Date.now(),
    });

    const shortUrl = `/mobile-join/${token}`;

    return { payload, shortUrl };
  }

  /**
   * Parse a scanned QR payload from the mobile device.
   */
  parseQrPayload(rawPayload) {
    try {
      const data = JSON.parse(rawPayload);
      if (data.type !== 'INTERVIEW_PAIRING') {
        return { valid: false, error: 'Invalid QR code type' };
      }
      if (!data.token || !data.sessionId) {
        return { valid: false, error: 'Missing required fields' };
      }
      return { valid: true, data };
    } catch {
      return { valid: false, error: 'Invalid QR code format' };
    }
  }
}

module.exports = new InterviewQrGenerator();
