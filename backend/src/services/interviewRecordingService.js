/**
 * Interview Recording Service
 * Manages recording metadata, signed URLs, and chunked upload handling.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { InterviewRecording, InterviewSession } = require('../models');
const logger = require('../utils/logger');

const RECORDING_DIR = path.join(__dirname, '../../uploads/interviews');
const SIGNING_SECRET = process.env.RECORDING_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');
const SIGNING_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Ensure upload directory exists
if (!fs.existsSync(RECORDING_DIR)) {
  fs.mkdirSync(RECORDING_DIR, { recursive: true });
}

class InterviewRecordingService {
  /**
   * Create a recording metadata entry when recording starts.
   */
  async startRecording(sessionId, deviceType, userId) {
    const recording = await InterviewRecording.create({
      session_id: sessionId,
      device_type: deviceType,
      file_url: '', // Set after upload completes
      status: 'RECORDING',
      uploaded_by: userId,
    });

    logger.info('Recording started', { recordingId: recording.id, sessionId, deviceType });
    return recording;
  }

  /**
   * Handle a chunk upload for a recording segment.
   * Chunks are appended to a temporary file per recording.
   */
  async uploadChunk(recordingId, chunkBuffer, chunkIndex) {
    const recording = await InterviewRecording.findByPk(recordingId);
    if (!recording) throw Object.assign(new Error('Recording not found'), { status: 404 });

    const sessionDir = path.join(RECORDING_DIR, `session_${recording.session_id}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const chunkFile = path.join(sessionDir, `${recording.device_type}_rec_${recordingId}_chunk_${chunkIndex}`);
    fs.writeFileSync(chunkFile, chunkBuffer);

    return { chunkIndex, bytesWritten: chunkBuffer.length };
  }

  /**
   * Finalize a recording: merge chunks, compute checksum, update metadata.
   */
  async finalizeRecording(recordingId) {
    const recording = await InterviewRecording.findByPk(recordingId);
    if (!recording) throw Object.assign(new Error('Recording not found'), { status: 404 });

    const sessionDir = path.join(RECORDING_DIR, `session_${recording.session_id}`);
    const outputFile = path.join(sessionDir, `${recording.device_type}_${recordingId}.webm`);

    // Merge chunks
    const writeStream = fs.createWriteStream(outputFile);
    let chunkIndex = 0;
    let totalBytes = 0;
    const hash = crypto.createHash('sha256');

    while (true) {
      const chunkFile = path.join(sessionDir, `${recording.device_type}_rec_${recordingId}_chunk_${chunkIndex}`);
      if (!fs.existsSync(chunkFile)) break;

      const chunk = fs.readFileSync(chunkFile);
      writeStream.write(chunk);
      hash.update(chunk);
      totalBytes += chunk.length;

      // Clean up chunk file
      fs.unlinkSync(chunkFile);
      chunkIndex++;
    }

    writeStream.end();

    const checksum = hash.digest('hex');
    const relativeUrl = `/uploads/interviews/session_${recording.session_id}/${recording.device_type}_${recordingId}.webm`;

    await recording.update({
      file_url: relativeUrl,
      file_size: totalBytes,
      checksum,
      status: 'COMPLETED',
    });

    logger.info('Recording finalized', { recordingId, totalBytes, checksum: checksum.substring(0, 16) });
    return recording;
  }

  /**
   * Mark a recording as failed.
   */
  async failRecording(recordingId, reason) {
    await InterviewRecording.update(
      { status: 'FAILED' },
      { where: { id: recordingId } }
    );
    logger.warn('Recording failed', { recordingId, reason });
  }

  /**
   * Generate a signed, time-limited URL for secure recording playback.
   */
  generateSignedUrl(filePath, userId) {
    const expires = Date.now() + SIGNING_TTL_MS;
    const payload = `${filePath}:${expires}:${userId}`;
    const signature = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(payload)
      .digest('hex');

    return `${filePath}?expires=${expires}&uid=${userId}&sig=${signature}`;
  }

  /**
   * Verify a signed URL is valid and not expired.
   */
  verifySignedUrl(filePath, expires, userId, signature) {
    if (Date.now() > parseInt(expires, 10)) {
      return { valid: false, reason: 'URL expired' };
    }
    const payload = `${filePath}:${expires}:${userId}`;
    const expected = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expected) {
      return { valid: false, reason: 'Invalid signature' };
    }
    return { valid: true };
  }

  /**
   * Get all recordings for a session.
   */
  async getSessionRecordings(sessionId) {
    return InterviewRecording.findAll({
      where: { session_id: sessionId },
      order: [['created_at', 'ASC']],
    });
  }
}

module.exports = new InterviewRecordingService();
