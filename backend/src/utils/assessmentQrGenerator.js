/**
 * Assessment QR Generator
 * Generates QR code payload data specifically for Quiz & Coding Assessment mobile verification.
 * Strictly separate from Interview module.
 */

class AssessmentQrGenerator {
  /**
   * Generate QR payload data for mobile pairing.
   * Returns a JSON payload the frontend renders as a QR code and a direct shortUrl.
   */
  generatePairingPayload({ assessmentType, assessmentId, attemptId, participantId, sessionId, token, socketUrl }) {
    const payload = JSON.stringify({
      type: 'ASSESSMENT_PAIRING',
      assessmentType: assessmentType.toUpperCase(), // 'QUIZ' or 'CODING'
      assessmentId,
      attemptId,
      participantId,
      sessionId,
      token,
      socketUrl,
      ts: Date.now(),
    });

    const shortUrl = `/assessment/mobile-join/${token}`;

    return { payload, shortUrl };
  }

  /**
   * Parse a scanned QR payload from the mobile device.
   */
  parseQrPayload(rawPayload) {
    try {
      const data = JSON.parse(rawPayload);
      if (data.type !== 'ASSESSMENT_PAIRING') {
        return { valid: false, error: 'Invalid assessment QR code type' };
      }
      if (!data.token || !data.sessionId || !data.assessmentType || !data.assessmentId) {
        return { valid: false, error: 'Missing required assessment verification fields' };
      }
      return { valid: true, data };
    } catch {
      return { valid: false, error: 'Invalid QR code format' };
    }
  }
}

module.exports = new AssessmentQrGenerator();
