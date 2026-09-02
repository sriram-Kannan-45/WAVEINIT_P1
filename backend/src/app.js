require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');
const { User } = require('./models');
const { sequelize, connectDB } = require('./config/db');
const logger = require('./utils/logger');

// Catch any unhandled promise rejections or exceptions to prevent silent process crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection caught at process level', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception caught at process level', {
    error: err.message,
    stack: err.stack,
  });
});
const authenticateToken = require('./middleware/auth');
const {
  initializeSocket,
  setupRedisAdapter,
  cleanupSocket,
} = require('./config/socket');
const { initRedis, closeRedis } = require('./config/redis');
const paths = require('./config/paths');
const { getInstanceId, getInstanceInfo } = require('./config/instance');

// Security middleware
const { detectSqlInjection, detectXss, detectPathTraversal, detectAnomalies } = require('./security/threatDetector');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const trainerRoutes = require('./routes/trainerRoutes');
const trainerCourseRoutes = require('./routes/trainerCourseRoutes');
const participantCourseRoutes = require('./routes/participantCourseRoutes');
const surveyRoutes = require('./routes/surveyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const noteRoutes = require('./routes/noteRoutes');
const feedRoutes = require('./routes/feedRoutes');
const liveRoutes = require('./routes/liveRoutes');
const aiQuizRoutes = require('./routes/aiQuizRoutes');
const quizzesRoutes = require('./routes/quizzesRoutes');
const profileRoutes = require('./routes/profileRoutes');
const participantProfileRoutes = require('./routes/participantProfileRoutes');
const proctoringRoutes = require('./routes/proctoringRoutes');
const monitorRoutes = require('./routes/monitorRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const reportRoutes = require('./routes/reportRoutes');
const recordingRoutes = require('./routes/recordingRoutes');
const codingAssessmentRoutes = require('./routes/codingAssessmentRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const { ipNormalizerMiddleware } = require('./utils/ipHelper');

const app = express();
// Enable trust proxy so Express parses the real client IP behind reverse proxies/load balancers (Azure App Service, Cloudflare, AWS, Nginx)
app.set('trust proxy', true);
app.use(ipNormalizerMiddleware);
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// CORS — allow common Vite dev ports plus any origin in FRONTEND_URL / ALLOWED_ORIGINS.
const isDev = process.env.NODE_ENV !== 'production';
const isLanOrigin = (origin) => /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);

// Parse configured frontend URLs and allowed origins (supports comma-separated values)
const rawFrontendUrls = [
  process.env.FRONTEND_URL,
  process.env.ALLOWED_ORIGINS,
  process.env.SECURITY_CORS_ORIGINS,
].filter(Boolean).flatMap(val => val.split(',').map(s => s.trim().replace(/\/+$/, '')));

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'https://localhost:5174',
  ...rawFrontendUrls,
]);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl, server-to-server, Postman, health probes)
    if (!origin) return callback(null, true);

    if (isDev) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin) || isLanOrigin(origin)) {
      return callback(null, true);
    }

    // Check wildcard / subdomain matches
    const isMatched = Array.from(allowedOrigins).some(allowed => {
      try {
        const allowedHost = new URL(allowed).hostname;
        const originHost = new URL(origin).hostname;
        return originHost === allowedHost || originHost.endsWith(`.${allowedHost}`);
      } catch (_) {
        return false;
      }
    });

    if (isMatched) {
      return callback(null, true);
    }

    return callback(null, true); // Fallback: allow to prevent production breakage while still logging
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
}));

// Response Compression — Gzip/Deflate compression for payloads > 1KB
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// Helmet — sets security HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Threat detection middleware (applied globally)
app.use(detectAnomalies);
app.use(detectPathTraversal);
// Body parsers — limit raised to 10 MB to safely accommodate participant
// avatar payloads (sent as base-64 data URLs). The frontend now compresses
// avatars to ~400×400 JPEG before upload, so real payloads are typically
// <100 KB; this header is the safety net.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// SQL injection + XSS detection on all POST/PUT/PATCH requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return detectSqlInjection(req, res, () => detectXss(req, res, next));
  }
  next();
});

// Security response headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
});

// Serve uploaded files statically with cache headers.
// All uploads live under the SHARED storage root (see config/paths.js) so the
// same files are visible from every App Service instance.
app.use('/uploads', express.static(paths.getUploadsRoot(), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
}));

// Global request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;
    const isDev = process.env.NODE_ENV === 'development';
    if (isError || isDev) {
      const logMsg = `➡️ ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`;
      if (isError) {
        logger.error(logMsg);
      } else {
        logger.debug(logMsg);
      }
    }
  });
  next();
});

// ROUTE MOUNTING (order matters — more specific first)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trainer', trainerCourseRoutes);
app.use('/api/trainer', trainerRoutes);
app.use('/api/participant', participantCourseRoutes);
app.use('/api/participant', enrollmentRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/survey', surveyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/ai-quiz', aiQuizRoutes);
app.use('/api/quizzes', quizzesRoutes);

// Registration workflow routes
const registrationRoutes = require('./routes/registrationRoutes');
app.use('/api/registration', registrationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.get('/api/certificates/verify/:code', require('./controllers/reportController').verifyCertificate);

// Endpoint GET /api/attempts/:attemptId
app.get('/api/attempts/:attemptId', authenticateToken, async (req, res) => {
  try {
    const { QuizAttempt, AIQuiz } = require('./models');
    const attempt = await QuizAttempt.findByPk(req.params.attemptId, {
      include: [{ model: AIQuiz, as: 'quiz' }]
    });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Check ownership if participant
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ attempt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attempt' });
  }
});

app.use('/api/profile', profileRoutes);

const userProfileRoutes = require('./routes/userProfileRoutes');
app.use('/api/user-profile', userProfileRoutes);
app.use('/api/participant-profile', participantProfileRoutes);
app.use('/api/monitoring', require('./routes/monitoringRoutes'));
app.use('/api/proctor', proctoringRoutes);
app.use('/api/proctoring', proctoringRoutes);
app.use('/api', monitorRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/discussion', discussionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/coding', codingAssessmentRoutes);
app.use('/api/assessment-verification', require('./routes/assessmentVerificationRoutes'));
app.use('/api/interviews', interviewRoutes);

// Health check for AI service (separate path to avoid conflict with router)
app.get('/api/ai/health', async (req, res) => {
  try {
    const aiService = require('./services/aiService');
    const result = await aiService.checkHealth();
    if (result.available) {
      res.json({ status: 'ok', aiService: result.details });
    } else {
      res.status(503).json({ 
        status: 'error', 
        message: 'AI service is not responding',
        hint: 'Start the Python service: cd ai-service && python main.py'
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      message: 'AI service unavailable',
      hint: 'Start the Python service: cd ai-service && python main.py'
    });
  }
});

// Custom route for updating profile exactly as requested
const profileController = require('./controllers/profileController');
const upload = require('./middleware/upload');
app.put('/api/update-profile', authenticateToken, upload.single('profilePic'), profileController.updateProfile);

// Top-level /api/test-mail alias (matches the spec's debugging step #5)
const { testMail } = require('./controllers/forgotPasswordController');
app.get('/api/test-mail', testMail);

// Health check (supports root, /health, and /api/health for Load Balancers & cluster probes).
// Enriched with instance identity, shared-lock provider and AI-service status so
// operators can confirm scale-out readiness from any instance.
app.get(['/', '/health', '/api/health'], async (req, res) => {
  const { isRedisReady, getLockProvider } = require('./config/redis');

  let dbStatus = 'connected';
  try {
    if (sequelize) {
      await sequelize.authenticate();
      dbStatus = 'connected';
    }
  } catch (e) {
    dbStatus = 'disconnected';
  }

  let aiService = 'unknown';
  try {
    const aiSvc = require('./services/aiService');
    const result = await aiSvc.checkHealth();
    aiService = result.available ? 'ready' : 'unavailable';
  } catch (_) {
    aiService = 'not-configured';
  }

  const isHealthy = dbStatus === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    backend: 'ready',
    ai_service: aiService,
    database: dbStatus,
    instance_id: getInstanceId(),
    message: 'Backend is running',
    service: 'WAVE INIT LMS Backend',
    ...getInstanceInfo(),
    redis: isRedisReady && isRedisReady() ? 'connected' : 'disabled',
    lock_provider: getLockProvider ? getLockProvider() : 'db',
    storage_root: paths.getStorageRoot(),
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

// Readiness probe — the same probes an App Service load balancer sends before
// routing traffic to an instance. 200 only when the DB is reachable.
app.get(['/ready', '/api/ready'], async (req, res) => {
  const { isRedisReady, getLockProvider } = require('./config/redis');
  let dbStatus = 'connected';
  try {
    if (sequelize) {
      await sequelize.authenticate();
      dbStatus = 'connected';
    }
  } catch (e) {
    dbStatus = 'disconnected';
  }

  let aiService = 'unknown';
  try {
    const aiSvc = require('./services/aiService');
    const result = await aiSvc.checkHealth();
    aiService = result.available ? 'ready' : 'unavailable';
  } catch (_) {
    aiService = 'not-configured';
  }

  const ready = dbStatus === 'connected';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    backend: ready ? 'ready' : 'not_ready',
    ai_service: aiService,
    database: dbStatus,
    instance_id: getInstanceId(),
    service: 'WAVE INIT LMS Backend',
    lock_provider: getLockProvider ? getLockProvider() : 'db',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Multer file-type / size errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Maximum size is 5 MB.' });
  }
  if (err.message && err.message.includes('Only JPG')) {
    return res.status(415).json({ success: false, message: err.message });
  }

  // Never expose raw SQL/database errors to the frontend
  const msg = err.message || '';
  if (msg.includes('cannot be null') || msg.includes('Column') || msg.includes('ER_PARSE_ERROR') || msg.includes('ER_BAD_FIELD_ERROR') || msg.includes('ER_NO_REFERENCED_ROW') || msg.includes('ER_DUP_ENTRY') || msg.includes('ER_DATA_TOO_LONG') || msg.includes('Sequelize')) {
    return res.status(err.status || 500).json({
      success: false,
      message: 'A database error occurred. Please try again or contact support.'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
  });
});

// Global 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const startServer = async () => {
  try {
    // 1. Initialize Socket.IO
    const io = initializeSocket(server);
    app.set('io', io);
    logger.info('Socket.IO initialized');

    // 2. Wire socket into interview notification service
    const interviewNotificationService = require('./services/interviewNotificationService');
    interviewNotificationService.setIo(io);

    // 3. Friendly EADDRINUSE handler — exits with actionable instructions instead
    // of a raw stack trace when port is busy.
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        process.exit(1);
      }
      // Anything else is a genuine server error — re-throw so it isn't silently swallowed.
      throw err;
    });

    // 4. Start HTTP listener immediately so container health probes pass in < 1 second
    await new Promise((resolve) => {
      server.listen(PORT, '0.0.0.0', () => {
        logger.logAlways(`🚀 WAVE INIT LMS Server running on port ${PORT}`);
        logger.logAlways('🔌 WebSocket server active on Socket.IO');
        resolve();
      });
    });

    // 5. Connect to database
    await connectDB();

    // Scale-out infrastructure tables — additive sync (distributed locks,
    // shared token blacklist, socket relay outbox). Created EARLY (right after
    // the main schema sync) and BEFORE the (slow) per-table sync chain + cron /
    // relay startup, so leader-guarded jobs and the relay poller never hit a
    // missing table. Needed on every instance of a scale-out pool.
    try {
      const { DistributedLock, TokenBlacklist, SocketRelayEvent } = require('./models');
      await DistributedLock.sync({ alter: true });
      await TokenBlacklist.sync({ alter: true });
      await SocketRelayEvent.sync({ alter: true });
      logger.info('scale-out tables ready (distributed_locks, token_blacklist, socket_relay_events)');
    } catch (e) {
      logger.error('Could not sync scale-out tables', { error: e.message });
    }

    // Sync security tables (new — non-critical, additive)
    try {
      const { RefreshToken, UserSession, AuditLog } = require('./models');
      await RefreshToken.sync({ alter: true });
      await UserSession.sync({ alter: true });
      await AuditLog.sync({ alter: true });
      logger.info('security tables ready (refresh_tokens, user_sessions, audit_logs)');
    } catch (e) {
      logger.error('Could not sync security tables', { error: e.message });
    }

    // Lightweight, additive: ensure the participant_profiles table exists
    // and that any column type drift is corrected. `alter: true` here is
    // scoped to ONE just-introduced model (not the whole DB), so it only
    // alters columns on participant_profiles. Without this, an avatar_url
    // column previously created as TEXT (64 KB) would stay too small for
    // base-64 photo payloads.
    try {
      const { ParticipantProfile } = require('./models');
      await ParticipantProfile.sync({ alter: true });
      logger.info('participant_profiles table ready');
    } catch (e) {
      logger.error('Could not sync participant_profiles', { error: e.message });
    }

    // Proctoring tables — additive sync, scoped to module
    // Note: proctor_violations may hit 64-key limit from repeated sync({ alter: true }).
    // If so, run: node src/scripts/fixDuplicateIndexes.js
    try {
      const {
        ExamSession,
        Violation,
        DeviceFingerprint,
        ProctorActivity,
      } = require('./models');
      await DeviceFingerprint.sync({ alter: true });
      await ExamSession.sync({ alter: true });
      await Violation.sync({ alter: true });
      await ProctorActivity.sync({ alter: true });
      logger.info('proctoring tables ready');
    } catch (e) {
      if (e.message && e.message.includes('Too many keys')) {
        logger.warn('proctor_violations hit 64-key limit — skipping sync. Run: node src/scripts/fixDuplicateIndexes.js');
      } else {
        logger.error('Could not sync proctoring tables', { error: e.message });
      }
    }

    // Parallel monitor system tables — additive sync, scoped to module
    try {
      const {
        MonitorAttempt,
        MonitorViolation,
        MonitorScreenshot,
      } = require('./models');
      await MonitorAttempt.sync({ alter: true });
      await MonitorViolation.sync({ alter: true });
      await MonitorScreenshot.sync({ alter: true });
      logger.info('monitor system tables ready');
    } catch (e) {
      logger.error('Could not sync monitor system tables', { error: e.message });
    }

    // Recorded-video async monitoring tables — additive, new tables only
    try {
      const { VideoSegment, ProcessingJob } = require('./models');
      await VideoSegment.sync({ alter: true });
      await ProcessingJob.sync({ alter: true });
      logger.info('async monitoring tables ready (video_segments, processing_jobs)');
    } catch (e) {
      logger.error('Could not sync async monitoring tables', { error: e.message });
    }

    // OTP table for forgot-password flow
    try {
      const { PasswordResetOtp } = require('./models');
      await PasswordResetOtp.sync({ alter: true });
      logger.info('password_reset_otps table ready');
    } catch (e) {
      logger.error('Could not sync password_reset_otps', { error: e.message });
    }

    // Secure Assessment session-lock table (see models/AssessmentSession.js).
    // Mirrors the per-model sync pattern used elsewhere in this file so a
    // fresh checkout boots with the table without needing sequelize-cli.
    try {
      const { AssessmentSession } = require('./models');
      await AssessmentSession.sync({ alter: true });
      logger.info('assessment_sessions table ready');
    } catch (e) {
      logger.error('Could not sync assessment_sessions', { error: e.message });
    }

    // Sync TrainingTrainerAssignment table
    try {
      const { TrainingTrainerAssignment } = require('./models');
      await TrainingTrainerAssignment.sync({ alter: true });
      logger.info('training_trainer_assignments table ready');
    } catch (e) {
      logger.error('Could not sync training_trainer_assignments', { error: e.message });
    }

    // Sync DiscussionPost table
    try {
      const { DiscussionPost } = require('./models');
      await DiscussionPost.sync({ alter: true });
      logger.info('discussion_posts table ready');
    } catch (e) {
      logger.error('Could not sync discussion_posts', { error: e.message });
    }

    // Sync RegistrationApplication table
    // Note: This table has hit the MySQL 64-index limit due to repeated sync({ alter: true }).
    // If sync fails with "Too many keys", run: node src/scripts/fixDuplicateIndexes.js
    try {
      const { RegistrationApplication } = require('./models');
      await RegistrationApplication.sync({ alter: true });
      logger.info('registration_applications table ready');
    } catch (e) {
      if (e.message && e.message.includes('Too many keys')) {
        logger.warn('registration_applications hit 64-key limit — skipping sync. Run: node src/scripts/fixDuplicateIndexes.js');
      } else {
        logger.error('Could not sync registration_applications', { error: e.message });
      }
    }

    // Helper to safely toggle FK checks only on MySQL
    const setFkChecks = async (enable) => {
      if (sequelize.getDialect() === 'mysql') {
        await sequelize.query(`SET FOREIGN_KEY_CHECKS = ${enable ? 1 : 0}`);
      }
    };

    // Sync UserProfile tables — additive, scoped to profile module
    try {
      const {
        UserProfile, ProfileSkill, ProfileExperience, ProfileEducation,
        ProfileCertificate, ProfileProject, ProfileContactLink, ProfileActivityLog,
      } = require('./models');
      await setFkChecks(false);
      try {
        await UserProfile.sync({ alter: true });
        await ProfileSkill.sync({ alter: true });
        await ProfileExperience.sync({ alter: true });
        await ProfileEducation.sync({ alter: true });
        await ProfileCertificate.sync({ alter: true });
        await ProfileProject.sync({ alter: true });
        await ProfileContactLink.sync({ alter: true });
        await ProfileActivityLog.sync({ alter: true });
      } finally {
        await setFkChecks(true);
      }
      logger.info('user profile tables ready');
    } catch (e) {
      logger.error('Could not sync user profile tables', { error: e.message });
    }

    // Sync Certificate table
    try {
      const { Certificate } = require('./models');
      await Certificate.sync({ alter: true });
      logger.info('certificates table ready');
    } catch (e) {
      if (e.message && e.message.includes('Too many keys')) {
        logger.warn('certificates hit 64-key limit — skipping sync. Run: node src/scripts/fixDuplicateIndexes.js');
      } else {
        logger.error('Could not sync certificates', { error: e.message });
      }
    }

    // Sync ParticipantTracking table
    try {
      const { ParticipantTracking } = require('./models');
      await ParticipantTracking.sync({ alter: true });
      logger.info('participant_trackings table ready');
    } catch (e) {
      logger.error('Could not sync participant_trackings', { error: e.message });
    }

    // Sync Attendance, Enhanced Feedback, and Badge tables
    try {
      const { AttendanceSession, AttendanceRecord, UserBadge, Feedback } = require('./models');
      await Feedback.sync({ alter: true });
      await AttendanceSession.sync({ alter: true });
      await AttendanceRecord.sync({ alter: true });
      await UserBadge.sync({ alter: true });
      logger.info('attendance, enhanced feedback, and badge tables ready');
    } catch (e) {
      logger.error('Could not sync attendance/feedback tables', { error: e.message });
    }

    // Course-centric architecture — must run BEFORE lesson/quiz/enrollment
    // sync so the bootstrap (rename trainings → training_programs) and the
    // new courses table exist when Lesson/AIQuiz/Enrollment are altered to
    // add their course_id columns.
    try {
      const { bootstrapCourseSchema, relaxLegacyTrainingIdColumns } = require('./config/bootstrapCourseSchema');
      await bootstrapCourseSchema(logger);
      await relaxLegacyTrainingIdColumns(logger);

      const {
        Training,        // table: training_programs (renamed)
        Course,
        LessonMaterial,
        CourseTrainerAssignment,
      } = require('./models');

      // FK checks off: altering Training adds thumbnail_url and (when
      // training_programs was just created empty by the global sync and
      // then dropped during bootstrap) any FK from courses to it should
      // not block the alters.
      await setFkChecks(false);
      try {
        // Re-sync Training so the new thumbnail_url column is added on
        // existing rows. Legacy columns remain (kept nullable in the model).
        await Training.sync({ alter: true });
        await Course.sync({ alter: true });
        await LessonMaterial.sync({ alter: true });
        await CourseTrainerAssignment.sync({ alter: true });
      } finally {
        await setFkChecks(true);
      }
      logger.info('course-centric tables ready');
    } catch (e) {
      logger.error('Could not sync course-centric tables', { error: e.message, stack: e.stack });
    }

    // Lesson workflow tables — additive sync, scoped to module
    try {
      const {
        Lesson, LessonQuiz, LessonAssessment,
        AssessmentSubmission, QuizProgress, LessonProgress,
        Enrollment, AIQuiz,
      } = require('./models');
      // FK checks off: altering lessons.training_id from NOT NULL to NULL
      // and enrollments.training_id similarly conflicts with existing
      // SET NULL FK actions (column must be nullable for SET NULL — older
      // table state is inconsistent).
      await setFkChecks(false);
      try {
        // Lesson, AIQuiz, Enrollment now carry the new course_id columns.
        await Lesson.sync({ alter: true });
        await LessonQuiz.sync({ alter: true });
        await LessonAssessment.sync({ alter: true });
        await AssessmentSubmission.sync({ alter: true });
        await QuizProgress.sync({ alter: true });
        await LessonProgress.sync({ alter: true });
        await Enrollment.sync({ alter: true });
        await AIQuiz.sync({ alter: true });
      } finally {
        await setFkChecks(true);
      }
      logger.info('lesson workflow tables ready');
    } catch (e) {
      logger.error('Could not sync lesson workflow tables', { error: e.message });
    }

    // Quiz Recordings — screen recordings for proctored quiz sessions
    try {
      const { QuizRecording } = require('./models');
      await QuizRecording.sync({ alter: true });
      logger.info('quiz_recordings table ready');
    } catch (e) {
      logger.error('Could not sync quiz_recordings', { error: e.message });
    }

    // Coding Assessment tables
    try {
      const { CodingAssessment, CodingProblem, CodingProblemLanguage, CodingTestCase, CodingAttempt, CodingSubmission, CodingResult, CodingAiHelp } = require('./models');
      await CodingAssessment.sync({ alter: true });
      await CodingProblem.sync({ alter: true });
      await CodingProblemLanguage.sync({ alter: true });
      await CodingTestCase.sync({ alter: true });
      await CodingAttempt.sync({ alter: true });
      await CodingSubmission.sync({ alter: true });
      await CodingResult.sync({ alter: true });
      await CodingAiHelp.sync({ alter: true });
      logger.info('coding_assessment tables ready');
    } catch (e) {
      logger.error('Could not sync coding_assessment tables', { error: e.message });
    }

    // Assessment Verification Session (Quiz & Coding QR pairing)
    try {
      const { AssessmentVerificationSession } = require('./models');
      await AssessmentVerificationSession.sync({ alter: true });
      logger.info('assessment_verification_sessions table ready');
    } catch (e) {
      logger.error('Could not sync assessment_verification_sessions table', { error: e.message });
    }

    // Interview Module tables — additive sync, scoped to module
    try {
      const {
        Interview, InterviewSession, InterviewDevice, InterviewRecording,
        InterviewLog, InterviewAlert, InterviewFeedback, InterviewResult, InterviewNotes,
      } = require('./models');
      await Interview.sync({ alter: true });
      await InterviewSession.sync({ alter: true });
      await InterviewDevice.sync({ alter: true });
      await InterviewRecording.sync({ alter: true });
      await InterviewLog.sync({ alter: true });
      await InterviewAlert.sync({ alter: true });
      await InterviewFeedback.sync({ alter: true });
      await InterviewResult.sync({ alter: true });
      await InterviewNotes.sync({ alter: true });
      logger.info('interview module tables ready');
    } catch (e) {
      logger.error('Could not sync interview module tables', { error: e.message });
    }

    // Add course-centric indexes that were intentionally omitted from the
    // model definitions (to avoid racing the global sync). Idempotent.
    try {
      const { bootstrapCourseIndexes, syncMissingCourses } = require('./config/bootstrapCourseSchema');
      await bootstrapCourseIndexes(logger);
      await syncMissingCourses(logger);
    } catch (e) {
      logger.warn('Could not finalize course-centric indexes or sync missing courses', { error: e.message });
    }

    // Assessment session expiry job — runs every 5 min
    try {
      const { startAssessmentSessionExpiryJob } = require('./jobs/expireAssessmentSessions');
      startAssessmentSessionExpiryJob({ intervalMs: 5 * 60_000, logger });
    } catch (e) {
      logger.warn('Could not start assessment session expiry job', { error: e.message });
    }

    // Background OTP cleanup — removes expired & old-used rows every 5 min.
    // Leader-guarded so only one instance across the pool performs it.
    try {
      const { cleanupExpiredOtps } = require('./controllers/forgotPasswordController');
      const { scheduleSingletonInterval } = require('./utils/leaderElection');
      scheduleSingletonInterval('cron:otp-cleanup', 5 * 60_000, cleanupExpiredOtps, { runImmediately: true });
    } catch (e) { /* non-fatal */ }

    // Setup Redis (fail-fast, leak-free)
    await initRedis();

    // Setup the Socket.IO adapter: enables the Redis adapter when REDIS_URL is
    // present, otherwise sets the DB-outbox relay mode (no-op when Redis up).
    await setupRedisAdapter(io);

    // Cross-instance Socket.IO relay poller (no-op when the Redis adapter is up).
    // Delivers signaling/notification events that originated on other instances.
    try {
      const crossInstance = require('./socket/crossInstance');
      crossInstance.startRelayPoller(io, { intervalMs: 120 });
      logger.info(`Socket relay poller started (mode: ${crossInstance.isClusterMode() ? 'redis' : 'db-outbox'})`);
    } catch (e) {
      logger.warn('Could not start socket relay poller', { error: e.message });
    }

    // Leader-guarded cleanup of scale-out tables (single writer namespace).
    try {
      const { scheduleSingletonInterval } = require('./utils/leaderElection');
      scheduleSingletonInterval('cron:scaleout-maintenance', 5 * 60_000, async () => {
        const { TokenBlacklist, SocketRelayEvent } = require('./models');
        const dbLock = require('./utils/distributedLock');
        const { Op } = require('sequelize');
        const now = new Date();
        await TokenBlacklist.destroy({ where: { expiresAt: { [Op.lt]: now } } });
        await SocketRelayEvent.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - 60_000) } } });
        await dbLock.cleanupExpired();
      });
    } catch (e) {
      logger.warn('Could not start scale-out maintenance job', { error: e.message });
    }

    // Parallel monitor system auto-submit cron (every minute)
    try {
      const { startMonitorAutoSubmitCron } = require('./jobs/monitorAutoSubmit');
      startMonitorAutoSubmitCron(io);
    } catch (e) {
      logger.warn('Could not start monitor auto-submit cron', { error: e.message });
    }

    // Automatic Attendance Daily Sync Job (Morning/Evening auto-generation & lock sync)
    try {
      const { startAttendanceAutoJob } = require('./jobs/attendanceAutoJob');
      startAttendanceAutoJob();
    } catch (e) {
      logger.warn('Could not start attendance auto job', { error: e.message });
    }

    // Quiz Auto-Close scheduler
    try {
      const { start: startQuizAutoClose } = require('./jobs/quizAutoClose');
      startQuizAutoClose();
    } catch (e) {
      logger.warn('Could not start quiz auto-close scheduler', { error: e.message });
    }

    // Workers: In multi-server cluster mode, workers run in dedicated independent processes.
    // In standalone / single-instance mode (or when RUN_EMBEDDED_WORKERS=true), they start in-process.
    const runEmbeddedWorkers = process.env.RUN_EMBEDDED_WORKERS !== 'false';
    if (runEmbeddedWorkers) {
      // Start the Judge submission worker (BullMQ)
      try {
        const { startWorker } = require('./workers/submissionWorker');
        startWorker(io);
      } catch (e) {
        logger.warn('Could not start submission worker (Redis may be unavailable)', { error: e.message });
      }

      // Recorded-video async monitoring worker
      try {
        const { startMonitoringWorker } = require('./workers/monitoringJobWorker');
        startMonitoringWorker(io);
      } catch (e) {
        logger.warn('Could not start monitoring worker', { error: e.message });
      }
    } else {
      logger.info('⚙️ Dedicated worker mode active: In-process workers disabled on API App Server.');
    }

    // Create default admin if not exists
    const adminExists = await User.findOne({ where: { email: 'admin@test.com' } });
    if (!adminExists) {
      // In production, admin should be created via CLI or secure setup script, not auto-created with a weak password.
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        logger.warn('⚠️  No admin account found. Create one via: node src/scripts/createAdmin.js');
      } else {
        const hashedPassword = await bcrypt.hash('admin123', 12);
        await User.create({
          name: 'Admin',
          email: 'admin@test.com',
          password: hashedPassword,
          phone: '0000000000',
          role: 'ADMIN',
          status: 'APPROVED'
        });
        logger.info('Default admin created: admin@test.com / admin123 (DEV ONLY)');
      }
    } else {
      // Ensure existing admin has APPROVED status and passwordVersion 2
      await User.update(
        { status: 'APPROVED', passwordVersion: 2 },
        { where: { email: 'admin@test.com' } }
      );
      logger.info('Admin already exists');
    }

    // Start quiz auto-close scheduler
    try {
      const quizAutoClose = require('./jobs/quizAutoClose');
      quizAutoClose.start();
    } catch (jobErr) {
      logger.warn('Failed to start quiz auto-close job:', jobErr.message);
    }

    // Start proctoring reapers — leader-guarded so only one instance in a
    // scale-out pool expires/auto-submits sessions (double-submitting would
    // duplicate results and double-emit socket events).
    try {
      const { withLeaderLock } = require('./utils/leaderElection');
      const proctoringService = require('./services/proctoringService');
      // Every 30 seconds: expire stale sessions (no heartbeat for 25s)
      setInterval(async () => {
        try {
          await withLeaderLock('reaper:proctoring-stale', () => proctoringService.expireStaleSessions(io));
        } catch (e) {
          logger.warn('Failed to run expireStaleSessions reaper:', e.message);
        }
      }, 30000).unref?.();

      // Every 60 seconds: expire grace period sessions (disconnect timeout)
      setInterval(async () => {
        try {
          await withLeaderLock('reaper:proctoring-grace', () => proctoringService.expireGracePeriodSessions(io));
        } catch (e) {
          logger.warn('Failed to run expireGracePeriodSessions reaper:', e.message);
        }
      }, 60000).unref?.();

      // Every 60 seconds: auto-submit sessions past endsAt absolute timer
      setInterval(async () => {
        try {
          await withLeaderLock('reaper:proctoring-auto-submit', () => proctoringService.autoSubmitExpiredSessions(io));
        } catch (e) {
          logger.warn('Failed to run autoSubmitExpiredSessions reaper:', e.message);
        }
      }, 60000).unref?.();
    } catch (proctorErr) {
      logger.warn('Failed to start proctoring reapers:', proctorErr.message);
    }

    logger.info(`📋 Mounted routes:
   /api/auth      → auth routes
   /api/admin     → admin routes (+ analytics endpoints)
   /api/trainer   → trainer routes
   /api/participant → enrollment routes
   /api/feedback  → feedback routes
   /api/trainings → training routes
   /api/feed      → activity feed routes
   /api/notifications → notification routes (+ Socket.IO)
   /api/notes     → notes routes
   /api/ai-quiz   → AI quiz routes
   /api/profile   → trainer profile routes
   /api/participant-profile → participant profile routes
   /api/survey    → survey routes
    `);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.logAlways('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.logAlways('HTTP server closed');
        await cleanupSocket(io);
        await closeRedis();
        await sequelize.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.logAlways('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        logger.logAlways('HTTP server closed');
        await cleanupSocket(io);
        await closeRedis();
        await sequelize.close();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { 
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, server };