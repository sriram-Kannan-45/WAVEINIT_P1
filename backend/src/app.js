require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');
const { User } = require('./models');
const { sequelize, connectDB } = require('./config/db');
const logger = require('./utils/logger');
const authenticateToken = require('./middleware/auth');
const {
  initializeSocket,
  setupRedisAdapter,
  cleanupSocket,
} = require('./config/socket');

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

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// CORS — allow common Vite dev ports plus any origin in FRONTEND_URL.
// Vite picks 5174/5175/... when 5173 is busy, so we whitelist a small range
// to avoid "Cannot connect to server" failures during local dev.
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]);

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl / server-to-server (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));
// Body parsers — limit raised to 10 MB to safely accommodate participant
// avatar payloads (sent as base-64 data URLs). The frontend now compresses
// avatars to ~400×400 JPEG before upload, so real payloads are typically
// <100 KB; this header is the safety net.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// Endpoint GET /api/attempts/:attemptId
app.get('/api/attempts/:attemptId', authenticateToken, async (req, res) => {
  try {
    const { QuizAttempt, AIQuiz } = require('./models');
    const attempt = await QuizAttempt.findByPk(req.params.attemptId, {
      include: [{ model: AIQuiz, as: 'quiz' }]
    });
    if (!attempt) {
      console.log(`[GET /api/attempts/${req.params.attemptId}] Attempt not found`);
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Check ownership if participant
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== req.user.id) {
      console.log(`[GET /api/attempts/${req.params.attemptId}] Access denied for user #${req.user.id}`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    console.log(`[GET /api/attempts/${req.params.attemptId}] Returning attempt details for user #${req.user.id}`);
    res.json({ attempt });
  } catch (error) {
    console.error(`[GET /api/attempts/${req.params.attemptId}] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/profile', profileRoutes);
app.use('/api/participant-profile', participantProfileRoutes);
app.use('/api/proctor', proctoringRoutes);
app.use('/api', monitorRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/discussion', discussionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/coding', codingAssessmentRoutes);

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error on', req.method, req.originalUrl);
  console.error(err.stack);

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
    console.error('⚠️ Sanitized database error for client:', err.message);
    return res.status(err.status || 500).json({
      success: false,
      message: 'A database error occurred. Please try again or contact support.'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });
});

// Global 404 fallback with detailed logging
app.use((req, res) => {
  console.error('❌ ENDPOINT NOT FOUND:', req.method, req.originalUrl);
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

const startServer = async () => {
  try {
    await connectDB();
    // ✅ IMPORTANT: Never use alter: true in production
    // See src/config/db.js for detailed explanation
    // Sync is already handled safely in connectDB()
    // await sequelize.sync({ alter: false });

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
      logger.error('Could not sync proctoring tables', { error: e.message });
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
    try {
      const { RegistrationApplication } = require('./models');
      await RegistrationApplication.sync({ alter: true });
      logger.info('registration_applications table ready');
    } catch (e) {
      logger.error('Could not sync registration_applications', { error: e.message });
    }

    // Sync Certificate table
    try {
      const { Certificate } = require('./models');
      await Certificate.sync({ alter: true });
      logger.info('certificates table ready');
    } catch (e) {
      logger.error('Could not sync certificates', { error: e.message });
    }

    // Sync ParticipantTracking table
    try {
      const { ParticipantTracking } = require('./models');
      await ParticipantTracking.sync({ alter: true });
      logger.info('participant_trackings table ready');
    } catch (e) {
      logger.error('Could not sync participant_trackings', { error: e.message });
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
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        // Re-sync Training so the new thumbnail_url column is added on
        // existing rows. Legacy columns remain (kept nullable in the model).
        await Training.sync({ alter: true });
        await Course.sync({ alter: true });
        await LessonMaterial.sync({ alter: true });
        await CourseTrainerAssignment.sync({ alter: true });
      } finally {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
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
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
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
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
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
      const { CodingAssessment, CodingProblem, CodingTestCase, CodingAttempt, CodingSubmission, CodingResult } = require('./models');
      await CodingAssessment.sync({ alter: true });
      await CodingProblem.sync({ alter: true });
      await CodingTestCase.sync({ alter: true });
      await CodingAttempt.sync({ alter: true });
      await CodingSubmission.sync({ alter: true });
      await CodingResult.sync({ alter: true });
      logger.info('coding_assessment tables ready');
    } catch (e) {
      logger.error('Could not sync coding_assessment tables', { error: e.message });
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

    // Background heartbeat reaper (60s)
    try {
      const proctoring = require('./services/proctoringService');
      setInterval(() => {
        proctoring.expireStaleSessions().catch(err =>
          logger.warn('proctor reaper error', { err: err.message }),
        );
      }, 60_000).unref();
    } catch (e) { /* non-fatal */ }

    // Background OTP cleanup — removes expired & old-used rows every 5 min
    // (replaces MongoDB TTL index since we use Sequelize/MySQL).
    try {
      const { cleanupExpiredOtps } = require('./controllers/forgotPasswordController');
      cleanupExpiredOtps(); // run once at startup
      setInterval(() => cleanupExpiredOtps(), 5 * 60_000).unref();
    } catch (e) { /* non-fatal */ }

    // Initialize Socket.IO
    const io = initializeSocket(server);
    app.set('io', io);
    logger.info('Socket.IO initialized');

    // Setup Redis adapter for multi-instance scaling (disabled for local dev)
    logger.info('Running Socket.IO in single-instance mode (Redis disabled for local dev)');

    // Parallel monitor system auto-submit cron (every minute) — must run AFTER socket init
    try {
      const { startMonitorAutoSubmitCron } = require('./jobs/monitorAutoSubmit');
      startMonitorAutoSubmitCron(io);
    } catch (e) {
      logger.warn('Could not start monitor auto-submit cron', { error: e.message });
    }

    // Start the Judge submission worker (BullMQ)
    try {
      const { startWorker } = require('./workers/submissionWorker');
      startWorker(io);
    } catch (e) {
      logger.warn('Could not start submission worker (Redis may be unavailable)', { error: e.message });
    }

    // Create default admin if not exists
    const adminExists = await User.findOne({ where: { email: 'admin@test.com' } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: hashedPassword,
        phone: '0000000000',
        role: 'ADMIN'
      });
      logger.info('Default admin created: admin@test.com / admin123');
    } else {
      logger.info('Admin already exists');
    }

    // Friendly EADDRINUSE handler — exits with actionable instructions instead
    // of a raw stack trace when port is busy.
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('   Another process (most likely a previous backend) is bound to this port.');
        console.error('');
        console.error('   To free it:');
        console.error('     • Quick (recommended):  npm run start:clean');
        console.error('     • PowerShell one-liner: Get-NetTCPConnection -LocalPort ' + PORT + ' -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }');
        console.error(`     • Manual:               netstat -ano | findstr :${PORT}   then   taskkill /PID <pid> /F`);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('');
        process.exit(1);
      }
      // Anything else is a genuine server error — re-throw so it isn't silently swallowed.
      throw err;
    });

    server.listen(PORT, () => {
      logger.logAlways(`🚀 WAVE INIT LMS Server running on http://localhost:${PORT}`);
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
       · GET    /me                  (own profile)
       · PUT    /me                  (update name/bio/skills/links)
       · POST   /me/avatar           (multipart upload)
       · DELETE /me/avatar           (remove avatar)
       · GET    /:userId             (admin/trainer view)
   /api/survey    → survey routes
      `);
      logger.logAlways('🔌 WebSocket server active on Socket.IO');

      // Start quiz auto-close scheduler
      try {
        const quizAutoClose = require('./jobs/quizAutoClose');
        quizAutoClose.start();
      } catch (jobErr) {
        logger.warn('Failed to start quiz auto-close job:', jobErr.message);
      }

      // Start proctoring reapers
      try {
        const proctoringService = require('./services/proctoringService');
        // Every 30 seconds: expire stale sessions (no heartbeat for 25s)
        setInterval(async () => {
          try {
            await proctoringService.expireStaleSessions(io);
          } catch (e) {
            logger.warn('Failed to run expireStaleSessions reaper:', e.message);
          }
        }, 30000);

        // Every 60 seconds: expire grace period sessions (disconnect timeout)
        setInterval(async () => {
          try {
            await proctoringService.expireGracePeriodSessions(io);
          } catch (e) {
            logger.warn('Failed to run expireGracePeriodSessions reaper:', e.message);
          }
        }, 60000);

        // Every 60 seconds: auto-submit sessions past endsAt absolute timer
        setInterval(async () => {
          try {
            await proctoringService.autoSubmitExpiredSessions(io);
          } catch (e) {
            logger.warn('Failed to run autoSubmitExpiredSessions reaper:', e.message);
          }
        }, 60000);
      } catch (proctorErr) {
        logger.warn('Failed to start proctoring reapers:', proctorErr.message);
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.logAlways('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.logAlways('HTTP server closed');
        await cleanupSocket(io);
        await sequelize.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.logAlways('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        logger.logAlways('HTTP server closed');
        await cleanupSocket(io);
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