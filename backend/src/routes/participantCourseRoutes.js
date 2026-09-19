/**
 * participantCourseRoutes.js
 * ──────────────────────────
 * Course-centric participant endpoints. Mounted under /api/participant
 * BEFORE the existing enrollmentRoutes so the more specific paths
 * (e.g. /courses, /lessons/:lessonId, /quizzes, /assessments) match first.
 *
 * The legacy POST /enroll and DELETE /enroll/:trainingId routes in
 * enrollmentRoutes are still available for backward compat — but the new
 * POST /enroll body now expects { courseId } (not trainingId), and the new
 * DELETE /enroll/:courseId is course-scoped. Where path collisions exist,
 * Express picks the first registered handler — so this file's handlers win.
 */
const express = require('express');
const c = require('../controllers/participantCourseController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();
router.use(authenticateToken);

const participant = roleMiddleware('PARTICIPANT');

// ── Enrollment ───────────────────────────────────────────────────────────
router.post(  '/enroll',                          participant, c.enroll);
router.delete('/enroll/:courseId',                participant, c.unenroll);

// ── Courses ──────────────────────────────────────────────────────────────
router.get(   '/courses',                         participant, c.listMyCourses);
router.get(   '/courses/explore',                 participant, c.explore);
router.get(   '/courses/:courseId',               participant, c.getCourseOverview);
router.get(   '/courses/:courseId/lessons',       participant, c.listCourseLessons);
router.get(   '/courses/:courseId/resources',     participant, c.listCourseResources);
router.get(   '/courses/:courseId/quizzes',       participant, c.listCourseQuizzes);
router.get(   '/courses/:courseId/coding-assessments', participant, c.listCourseCodingAssessments);

// ── Lessons ──────────────────────────────────────────────────────────────
router.get(   '/lessons/:lessonId',               participant, c.getLessonDetail);
router.post(  '/lessons/:lessonId/view',          participant, c.markLessonViewed);

// ── Quizzes ──────────────────────────────────────────────────────────────
router.get(   '/quizzes',                         participant, async (req, res) => {
  try {
    const AIQuizService = require('../services/aiQuizService');
    const { availableQuizzes, completedQuizzes } = await AIQuizService.getParticipantQuizzes(req.user.id);
    return res.json({ success: true, quizzes: availableQuizzes, completedQuizzes });
  } catch (error) {
    console.error('Error fetching participant quizzes:', error);
    return res.status(500).json({ error: 'Server error fetching participant quizzes' });
  }
});
router.post(  '/quizzes/:quizId/start',           participant, c.startQuiz);
router.post(  '/quizzes/:quizId/submit',          participant, c.submitQuiz);
router.get(   '/quizzes/:quizId/result',          participant, c.getQuizResult);
router.get(   '/results',                         participant, async (req, res) => {
  try {
    const { QuizResult, AIQuiz, QuizAttempt } = require('../models');
    const results = await QuizResult.findAll({
      where: { participantId: req.user.id },
      include: [
        {
          model: AIQuiz,
          as: 'quiz',
          where: { isResultPublished: true },
          attributes: ['id', 'title', 'courseId', 'lessonId']
        },
        {
          model: QuizAttempt,
          as: 'attempt',
          attributes: ['submittedAt']
        }
      ],
      order: [['id', 'DESC']]
    });
    return res.json({ success: true, results });
  } catch (error) {
    console.error('Error fetching participant results:', error);
    return res.status(500).json({ error: 'Server error fetching participant results' });
  }
});

// ── Assessments ──────────────────────────────────────────────────────────
router.post(  '/assessments/:assessmentId/submit', participant, c.submitAssessment);
router.get(   '/assessments/:assessmentId/result', participant, c.getAssessmentResult);

// ── Certificates ────────────────────────────────────────────────────────────
router.get(   '/certificates',                    participant, c.listMyCertificates);

// ── Learning Activity Heatmap ───────────────────────────────────────────────
router.get('/activity/heatmap', participant, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days, 10) || 90;
    const {
      LessonProgress, QuizAttempt, CodingAttempt, AssessmentSubmission,
      Enrollment, Attendance, ActivityLog, Feedback, Note, DiscussionPost
    } = require('../models');

    const [
      lessonProgressRows,
      quizAttemptRows,
      codingAttemptRows,
      assessmentSubRows,
      activityLogRows,
      attendanceRows,
      enrollmentRows,
      feedbackRows,
      noteRows,
      discussionRows
    ] = await Promise.all([
      LessonProgress.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'contentViewed', 'completedAt', 'created_at', 'updated_at'], raw: true }).catch(() => []),
      QuizAttempt.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'startedAt', 'submittedAt', 'timeTaken', 'created_at'], raw: true }).catch(() => []),
      CodingAttempt.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'startedAt', 'submittedAt', 'timeTaken', 'created_at'], raw: true }).catch(() => []),
      AssessmentSubmission.findAll({ where: { participantId: userId }, attributes: ['id', 'status', 'submittedAt', 'created_at'], raw: true }).catch(() => []),
      ActivityLog.findAll({ where: { userId }, attributes: ['id', 'action', 'created_at'], raw: true }).catch(() => []),
      Attendance.findAll({ where: { userId }, attributes: ['id', 'joinTime', 'leaveTime', 'durationSeconds', 'created_at'], raw: true }).catch(() => []),
      Enrollment.findAll({ where: { participantId: userId }, attributes: ['id', 'courseId', 'trainingId', 'enrolled_at', 'created_at'], raw: true }).catch(() => []),
      (Feedback || { findAll: () => [] }).findAll({ where: { participantId: userId }, attributes: ['id', 'created_at'], raw: true }).catch(() => []),
      (Note || { findAll: () => [] }).findAll({ where: { userId }, attributes: ['id', 'created_at'], raw: true }).catch(() => []),
      (DiscussionPost || { findAll: () => [] }).findAll({ where: { userId }, attributes: ['id', 'created_at'], raw: true }).catch(() => []),
    ]);

    const dailyMap = {};
    const addDaily = (dateVal, type = 'general', weight = 1, seconds = 0) => {
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().split('T')[0];
      if (!dailyMap[key]) {
        dailyMap[key] = { count: 0, lessons: 0, quizzes: 0, coding: 0, assessments: 0, courses: 0, general: 0, seconds: 0 };
      }
      dailyMap[key].count += weight;
      if (type in dailyMap[key]) dailyMap[key][type] += weight;
      dailyMap[key].seconds += seconds;
    };

    lessonProgressRows.forEach(lp => addDaily(lp.completedAt || lp.updated_at || lp.created_at, 'lessons', 1, 1200));
    quizAttemptRows.forEach(qa => addDaily(qa.submittedAt || qa.startedAt || qa.created_at, 'quizzes', 1, qa.timeTaken || 900));
    codingAttemptRows.forEach(ca => addDaily(ca.submittedAt || ca.startedAt || ca.created_at, 'coding', 1, ca.timeTaken || 1800));
    assessmentSubRows.forEach(asub => addDaily(asub.submittedAt || asub.created_at, 'assessments', 1, 1500));
    attendanceRows.forEach(att => addDaily(att.joinTime || att.created_at, 'general', 1, att.durationSeconds || 3600));
    activityLogRows.forEach(al => addDaily(al.created_at, 'general', 1, 300));
    enrollmentRows.forEach(en => addDaily(en.enrolled_at || en.created_at, 'courses', 1, 600));
    feedbackRows.forEach(fb => addDaily(fb.created_at, 'general', 1, 300));
    noteRows.forEach(n => addDaily(n.created_at, 'general', 1, 300));
    discussionRows.forEach(dp => addDaily(dp.created_at, 'general', 1, 300));

    const heatmap = Object.entries(dailyMap).map(([date, data]) => ({
      date,
      activityCount: data.count,
      breakdown: {
        lessons: data.lessons,
        quizzes: data.quizzes,
        coding: data.coding,
        assessments: data.assessments,
        courses: data.courses,
        general: data.general,
      },
    }));

    return res.json({ success: true, heatmap, dailyMap });
  } catch (error) {
    console.error('Error fetching participant activity heatmap:', error);
    return res.status(500).json({ error: 'Server error fetching participant activity heatmap' });
  }
});

// ── AI Guide Chatbot ───────────────────────────────────────────────────────
router.post('/chatbot/ask', participant, async (req, res) => {
  try {
    const { askParticipantChatbot } = require('../services/participantChatbotService');
    const { message, history, context } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // ── Hire Assessment Context Detection ──────────────────────────────────
    // If the candidate is currently inside an active Hire quiz or coding
    // attempt, detect answer-seeking queries and block them server-side.
    const clientContext = context || {};
    const isHireAttemptActive = !!(
      clientContext.isHireAssessment === true ||
      String(clientContext.currentRoute || '').includes('/trainings/hire/')
    );

    if (isHireAttemptActive) {
      const q = (message || '').toLowerCase().trim();
      // Detect obvious answer-seeking patterns
      const answerPatterns = [
        'correct answer', 'right answer', 'give me the answer', 'what is the answer',
        'which option', 'which choice', 'select option', 'pick option', 'choose option',
        'tell me the answer', 'reveal answer', 'show answer', 'answer is',
        'write the code', 'give me the code', 'complete the code', 'write solution',
        'give solution', 'give me solution', 'solve this', 'fix this code for me',
        'hidden test', 'test case', 'expected output', 'what does the evaluator',
        'how to pass', 'pass the test',
      ];
      const isAnswerSeeking = answerPatterns.some(p => q.includes(p));

      if (isAnswerSeeking) {
        return res.json({
          success: true,
          intent: 'HIRE_ASSESSMENT_RESTRICTED',
          reply: `I cannot provide answers, solutions, or hints for assessment questions during a Hire evaluation.\n\nThis assessment is being monitored. Please attempt the questions independently.\n\nI can help with general questions like:\n• How do I submit my answers?\n• How much time do I have left?\n• How does the assessment work?`,
          actionButtons: [],
          suggestions: ['How do I submit?', 'How does this assessment work?'],
        });
      }
      if (clientContext.isHireVerificationActive &&
          /what should i do|what do i do|how do i continue|next step|என்ன செய்ய|அடுத்து என்ன/i.test(message)) {
        const tamil = clientContext.selectedLanguage === 'ta-IN';
        const step = ['front', 'left', 'back', 'right', 'desk', 'floor'].includes(clientContext.currentCaptureStep)
          ? clientContext.currentCaptureStep : 'front';
        const instructions = {
          front: ['Point your phone forward and capture a clear photo.', 'கைப்பேசியை முன்புறம் காட்டி தெளிவான புகைப்படம் எடுக்கவும்.'],
          left: ['Turn your phone left and capture a clear photo.', 'கைப்பேசியை இடதுபுறம் திருப்பி தெளிவான புகைப்படம் எடுக்கவும்.'],
          back: ['Turn around and capture the area behind you.', 'திரும்பி, உங்களுக்குப் பின்னால் உள்ள பகுதியைப் புகைப்படம் எடுக்கவும்.'],
          right: ['Turn your phone right and capture a clear photo.', 'கைப்பேசியை வலதுபுறம் திருப்பி தெளிவான புகைப்படம் எடுக்கவும்.'],
          desk: ['Capture your complete desk and workspace.', 'முழு மேசை மற்றும் பணியிடத்தைப் புகைப்படம் எடுக்கவும்.'],
          floor: ['Tilt your phone down and capture the floor below your desk.', 'கைப்பேசியை கீழே சாய்த்து மேசையின் கீழுள்ள தரையைப் புகைப்படம் எடுக்கவும்.'],
        };
        const reply = clientContext.roomScanPhase === 'scan360'
          ? (tamil ? '360 டிகிரி அறை ஸ்கேனுக்காக கைப்பேசியை மெதுவாக முழு வட்டமாகச் சுழற்றுங்கள்.' : 'Slowly rotate your phone in a full circle to finish the 360° room scan.')
          : clientContext.captureStatus === 'RETRY'
            ? (tamil ? `சிக்கலைச் சரிசெய்து இதே புகைப்படத்தை மீண்டும் எடுக்கவும். ${instructions[step][1]}` : `Correct the issue shown above and retake this same photo. ${instructions[step][0]}`)
            : instructions[step][tamil ? 1 : 0];
        return res.json({ success: true, intent: 'HIRE_VERIFICATION_GUIDANCE', reply, actionButtons: [] });
      }
    }
    // ── End Hire Context ───────────────────────────────────────────────────

    const result = await askParticipantChatbot({
      userId: req.user.id,
      message,
      history: Array.isArray(history) ? history : [],
      clientContext: { ...clientContext, isHireAttemptActive },
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'AI_PROVIDERS_UNAVAILABLE') return res.status(503).json({success:false,error:error.message,code:error.code});
    console.error('Error handling participant chatbot request:', error);
    return res.status(500).json({
      success: false,
      reply: 'I am temporarily having trouble retrieving information. Please use the quick navigation buttons below.',
      actionButtons: [
        { label: 'Open My Courses', action: 'navigate', route: '/participant', tab: 'myCourses' },
        { label: 'Open My Profile', action: 'navigate', route: '/my-profile' },
      ],
      suggestions: ['How do I start a course?', 'How do I complete my profile?'],
    });
  }
});

// ── Tracking ────────────────────────────────────────────────────────────────
router.post(  '/track-activity',                  participant, c.trackActivity);

module.exports = router;
