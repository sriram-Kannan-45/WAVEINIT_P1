const axios = require('axios');
const {
  User,
  UserProfile,
  ProfileSkill,
  ProfileEducation,
  ProfileExperience,
  ProfileCertificate,
  ProfileProject,
  ProfileContactLink,
  Enrollment,
  Training,
  Course,
  Lesson,
  LessonProgress,
  AIQuiz,
  QuizAssignment,
  QuizAttempt,
  QuizResult,
  CodingAssessment,
  CodingAttempt,
  Certificate,
  Interview,
} = require('../models');
const logger = require('../utils/logger');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Gather live, authentic LMS context for the authenticated participant.
 * Never invents courses, certificates, scores, or interviews.
 */
async function getParticipantContext(userId, clientContext = {}) {
  try {
    const [
      user,
      profile,
      enrollments,
      quizAssignments,
      allQuizzes,
      quizAttempts,
      quizResults,
      certificates,
      lessonProgressList,
      interviews,
    ] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'name', 'email', 'role', 'status'] }),
      UserProfile.findOne({
        where: { userId },
        include: [
          { model: ProfileSkill, as: 'skills' },
          { model: ProfileEducation, as: 'educations' },
          { model: ProfileExperience, as: 'experiences' },
          { model: ProfileCertificate, as: 'certificates' },
          { model: ProfileProject, as: 'projects' },
          { model: ProfileContactLink, as: 'contactLinks' },
        ],
      }).catch(() => null),
      Enrollment.findAll({
        where: { participantId: userId, status: ['ENROLLED', 'PENDING'] },
        include: [
          { model: Training, as: 'training', attributes: ['id', 'title'] },
          {
            model: Course,
            as: 'course',
            attributes: ['id', 'title', 'status', 'description'],
            include: [
              {
                model: Lesson,
                as: 'lessons',
                attributes: ['id', 'title', 'orderIndex', 'status'],
                required: false,
              },
            ],
          },
        ],
        order: [['createdAt', 'DESC']],
      }).catch(() => []),
      QuizAssignment.findAll({
        where: { participantId: userId },
        attributes: ['id', 'quizId', 'status', 'assignedAt'],
        raw: true,
      }).catch(() => []),
      AIQuiz.findAll({
        where: { isActive: true },
        attributes: ['id', 'title', 'courseId', 'lessonId', 'timeLimit', 'trainingId', 'difficulty', 'status', 'isResultPublished', 'is_published', 'is_result_published'],
        raw: true,
      }).catch(() => []),
      QuizAttempt.findAll({
        where: { participantId: userId },
        attributes: ['id', 'quizId', 'status', 'score', 'percentage', 'startedAt', 'submittedAt', 'createdAt'],
        order: [['createdAt', 'DESC']],
        raw: true,
      }).catch(() => []),
      QuizResult.findAll({
        where: { participantId: userId },
        attributes: ['id', 'quizId', 'score', 'percentage', 'passed', 'createdAt'],
        order: [['createdAt', 'DESC']],
        raw: true,
      }).catch(() => []),
      Certificate.findAll({
        where: { userId },
        attributes: ['id', 'certificateCode', 'courseId', 'trainingId', 'issuedAt'],
        order: [['issuedAt', 'DESC']],
        raw: true,
      }).catch(() => []),
      LessonProgress.findAll({
        where: { participantId: userId },
        attributes: ['id', 'lessonId', 'status', 'contentViewed', 'completedAt', 'updated_at'],
        raw: true,
      }).catch(() => []),
      Interview.findAll({
        where: { candidate_id: userId, status: ['SCHEDULED', 'IN_PROGRESS'] },
        attributes: ['id', 'title', 'scheduled_at', 'duration_minutes', 'type', 'status'],
        order: [['scheduled_at', 'ASC']],
        raw: true,
      }).catch(() => []),
    ]);

    // ── Profile Completion Analysis ──
    let completedSections = 0;
    const totalSections = 8;
    const missingSections = [];

    if (profile?.phone && String(profile.phone).trim().length > 0) completedSections++; else missingSections.push('Phone Number');
    if (profile?.about && String(profile.about).trim().length > 0) completedSections++; else missingSections.push('About / Bio');
    if (profile?.profileImage) completedSections++; else missingSections.push('Profile Photo');
    if (profile?.resume) completedSections++; else missingSections.push('Resume');
    if (profile?.skills && profile.skills.length > 0) completedSections++; else missingSections.push('Skills');
    if (profile?.experiences && profile.experiences.length > 0) completedSections++; else missingSections.push('Experience & Projects');
    if (profile?.educations && profile.educations.length > 0) completedSections++; else missingSections.push('Education');
    if (profile?.certificates && profile.certificates.length > 0) completedSections++; else missingSections.push('Certifications');

    const profilePercent = Math.round((completedSections / totalSections) * 100);

    // ── Completed Lessons Set ──
    const completedLessonIds = new Set(
      lessonProgressList
        .filter(lp => lp.status === 'COMPLETED' || lp.contentViewed)
        .map(lp => Number(lp.lessonId))
    );

    // ── Course Mapping with Next Lesson & Progress ──
    const enrolledCoursesList = enrollments
      .filter(e => e.course)
      .map(e => {
        const sortedLessons = (e.course.lessons || []).slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const nextLesson = sortedLessons.find(l => !completedLessonIds.has(Number(l.id))) || sortedLessons[0] || null;

        return {
          courseId: e.course.id,
          trainingId: e.trainingId || e.course.trainingProgramId || null,
          courseTitle: e.course.title || 'Course',
          trainingTitle: e.training?.title || 'Training Program',
          progressPercent: Math.round(Number(e.progressPercent || 0)),
          status: e.status, // 'ENROLLED' | 'PENDING'
          lessonsCount: sortedLessons.length,
          nextLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title } : null,
        };
      });

    // ── Quizzes Context ──
    const completedQuizIds = new Set(
      quizAttempts
        .filter(q => q.status === 'COMPLETED' || q.status === 'SUBMITTED' || q.submittedAt)
        .map(q => Number(q.quizId))
    );

    const assignedQuizIds = new Set((quizAssignments || []).map(qa => Number(qa.quizId)));
    const enrolledCourseIdSet = new Set(enrolledCoursesList.map(c => Number(c.courseId)));
    const enrolledTrainingIdSet = new Set(enrolledCoursesList.map(c => Number(c.trainingId)).filter(Boolean));

    const participantQuizzes = (allQuizzes || []).filter(q => {
      const qid = Number(q.id);
      if (assignedQuizIds.has(qid)) return true;
      if (q.courseId && enrolledCourseIdSet.has(Number(q.courseId))) return true;
      if (q.trainingId && enrolledTrainingIdSet.has(Number(q.trainingId))) return true;
      if (q.status === 'PUBLISHED' || q.status === 'RESULTS_PUBLISHED' || q.is_published || q.isPublished) return true;
      return false;
    });

    const availableList = participantQuizzes.filter(q => !completedQuizIds.has(Number(q.id)));

    return {
      user: {
        id: user?.id,
        name: user?.name || 'Learner',
        email: user?.email,
      },
      profile: {
        completionPercent: profilePercent,
        completedSections,
        totalSections,
        missingSections,
        headline: profile?.headline || '',
      },
      courses: enrolledCoursesList,
      quizzes: {
        completedCount: completedQuizIds.size,
        attemptedCount: quizAttempts.length,
        availableList,
        completedList: quizAttempts,
        recentResults: quizResults,
      },
      certificates: certificates || [],
      certificatesCount: certificates ? certificates.length : 0,
      interviews: interviews || [],
      clientContext,
    };
  } catch (err) {
    logger.error('Error fetching participant context for chatbot:', err);
    return {
      user: { id: userId, name: 'Learner' },
      profile: { completionPercent: 0, completedSections: 0, totalSections: 8, missingSections: ['Profile details'] },
      courses: [],
      quizzes: { completedCount: 0, attemptedCount: 0, availableList: [], completedList: [], recentResults: [] },
      certificates: [],
      certificatesCount: 0,
      interviews: [],
      clientContext,
    };
  }
}

/**
 * Intelligent Action Resolution Engine
 * Strictly maps natural-language queries to deterministic, executable LMS actions
 * based on the participant's verified LMS state.
 */
function resolveParticipantAction(rawMessage, context) {
  const query = (rawMessage || '').toLowerCase().trim();
  const userName = context.user?.name || 'there';
  const enrolledCourses = context.courses || [];
  const certificateCount = context.certificatesCount || 0;
  const availableQuizzes = context.quizzes?.availableList || [];
  const upcomingInterviews = context.interviews || [];
  const profileCompletion = context.profile?.completionPercent || 0;

  const primaryCourse = enrolledCourses[0] || null;
  const primaryCourseId = primaryCourse?.courseId || 1;
  const primaryCourseName = primaryCourse?.courseTitle || 'Course';

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. QR Scanner commands
  // E.g.: "Scan QR", "Scan the QR code", "Open QR scanner", "I want to scan", "Start QR", "qr scan pannu"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('scan qr') ||
    query.includes('qr scan') ||
    query.includes('open qr') ||
    query.includes('start qr') ||
    query.includes('qr scanner') ||
    query.includes('i want to scan') ||
    query.includes('camera scan') ||
    query === 'scan' ||
    query === 'qr'
  ) {
    return {
      intent: 'SCAN_QR',
      action: {
        type: 'OPEN_QR_SCANNER',
        autoExecute: true,
        confirmationMessage: 'QR Scanner opened. Point your camera at the QR code.',
      },
      reply: `Sure **${userName}**! Opening the QR scanner for you now.`,
      actionButtons: [
        { label: '📷 Open QR Scanner', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
        { label: 'View Assessments', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'myEnrollments', courseId: primaryCourseId, subtab: 'quizzes' },
      ],
      suggestions: ['How does QR scanning work?', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Assessment & Quiz Actions (Processed before generic course patterns)
  // E.g.: "Open quiz", "Open the quiz", "Start the quiz", "Take the quiz", "Show assessments",
  //       "Start my assessment", "Take assessment", "Take quiz", "Quiz open pannu", "Assessment start pannu",
  //       "React quiz", "JS assessment", "Test", "Exam"
  // ─────────────────────────────────────────────────────────────────────────────
  const isQuizQuery =
    query.includes('quiz') ||
    query.includes('assessment') ||
    query.includes('exam') ||
    query.includes('test') ||
    query.includes('quizzes') ||
    query.includes('assessments');

  if (isQuizQuery) {
    // Check if user specifically mentioned a quiz title in available quizzes
    const mentionedQuiz = availableQuizzes.find(q => {
      const qTitle = (q.title || '').toLowerCase();
      if (!qTitle) return false;
      if (query.includes(qTitle)) return true;
      const tokens = qTitle.split(/[\s\-_/]+/).filter(t => t.length > 2 && !['quiz', 'assessment', 'test', 'exam', 'basics', 'advanced'].includes(t));
      return tokens.some(tok => query.includes(tok));
    });

    const isStartOrOpen =
      query.includes('start') ||
      query.includes('take') ||
      query.includes('begin') ||
      query.includes('open') ||
      query.includes('go') ||
      query.includes('pannu') ||
      query === 'quiz' ||
      query === 'quizzes' ||
      query === 'assessment' ||
      query === 'assessments' ||
      query === 'test' ||
      query === 'exam';

    const quizCourseId = (mentionedQuiz && mentionedQuiz.courseId) || (availableQuizzes[0] && availableQuizzes[0].courseId) || primaryCourseId;
    const quizCourse = enrolledCourses.find(c => Number(c.courseId) === Number(quizCourseId)) || primaryCourse;
    const quizCourseTitle = quizCourse?.courseTitle || 'Course';

    if (mentionedQuiz) {
      const mCourseId = mentionedQuiz.courseId || primaryCourseId;
      const mCourse = enrolledCourses.find(c => Number(c.courseId) === Number(mCourseId)) || primaryCourse;
      const mCourseTitle = mCourse?.courseTitle || 'Course';

      return {
        intent: 'START_ASSESSMENT',
        action: {
          type: 'START_ASSESSMENT',
          route: '/participant',
          tab: 'myEnrollments',
          courseId: mCourseId,
          subtab: 'quizzes',
          quizId: mentionedQuiz.id,
          quizTitle: mentionedQuiz.title,
          autoExecute: true,
          confirmationMessage: `Opening assessment "${mentionedQuiz.title}" in ${mCourseTitle}.`,
        },
        reply: `Opening your assessment **"${mentionedQuiz.title}"** (${mentionedQuiz.timeLimit || 30} mins) in **"${mCourseTitle}"** now. Good luck! 🚀`,
        actionButtons: [
          { label: `🚀 Start "${mentionedQuiz.title}"`, action: 'navigate', type: 'START_ASSESSMENT', route: '/participant', tab: 'myEnrollments', courseId: mCourseId, subtab: 'quizzes', quizId: mentionedQuiz.id },
          { label: '📷 Scan QR for Mobile Pairing', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
        ],
        suggestions: ['How do I scan the QR code?', 'What should I do next?'],
      };
    }

    if (isStartOrOpen) {
      if (availableQuizzes.length === 1) {
        const targetQuiz = availableQuizzes[0];
        const tCourseId = targetQuiz.courseId || primaryCourseId;
        const tCourse = enrolledCourses.find(c => Number(c.courseId) === Number(tCourseId)) || primaryCourse;
        const tCourseTitle = tCourse?.courseTitle || 'Course';

        return {
          intent: 'START_ASSESSMENT',
          action: {
            type: 'START_ASSESSMENT',
            route: '/participant',
            tab: 'myEnrollments',
            courseId: tCourseId,
            subtab: 'quizzes',
            quizId: targetQuiz.id,
            quizTitle: targetQuiz.title,
            autoExecute: true,
            confirmationMessage: `Opening assessment "${targetQuiz.title}" in ${tCourseTitle}.`,
          },
          reply: `You have one available assessment in **"${tCourseTitle}"**: **"${targetQuiz.title}"** (${targetQuiz.timeLimit || 30} mins).\n\nOpening it for you now:`,
          actionButtons: [
            { label: `🚀 Start "${targetQuiz.title}"`, action: 'navigate', type: 'START_ASSESSMENT', route: '/participant', tab: 'myEnrollments', courseId: tCourseId, subtab: 'quizzes', quizId: targetQuiz.id },
            { label: '📷 Scan QR for Mobile Pairing', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
          ],
          suggestions: ['How do I scan the QR code?', 'What should I do next?'],
        };
      }

      if (availableQuizzes.length > 1) {
        return {
          intent: 'START_ASSESSMENT',
          action: {
            type: 'OPEN_ASSESSMENTS',
            route: '/participant',
            tab: 'myEnrollments',
            courseId: quizCourseId,
            subtab: 'quizzes',
            autoExecute: true,
            confirmationMessage: `Opening quizzes for "${quizCourseTitle}".`,
          },
          reply: `You have **${availableQuizzes.length} available assessments** ready in **"${quizCourseTitle}"**:`,
          actionButtons: availableQuizzes.map(q => ({
            label: `🚀 Start "${q.title}"`,
            action: 'navigate',
            type: 'START_ASSESSMENT',
            route: '/participant',
            tab: 'myEnrollments',
            courseId: q.courseId || quizCourseId,
            subtab: 'quizzes',
            quizId: q.id,
          })),
          suggestions: ['How do I scan the QR code?', 'What should I do next?'],
        };
      }

      // If no available quizzes, check if participant already completed them
      if (context.quizzes?.completedCount > 0) {
        return {
          intent: 'ASSESSMENTS_COMPLETED',
          action: {
            type: 'VIEW_RESULTS',
            route: '/participant',
            tab: 'reports',
            autoExecute: true,
            confirmationMessage: 'Opening your Assessment Results & Reports.',
          },
          reply: `You have already completed your assigned assessments!\n\nOpening your Reports page to view your scores and results.`,
          actionButtons: [
            { label: '📊 View Results', action: 'navigate', type: 'VIEW_RESULTS', route: '/participant', tab: 'reports' },
            { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
          ],
          suggestions: ['Show my results', 'Show my certificates'],
        };
      }

      return {
        intent: 'NO_ASSESSMENTS_AVAILABLE',
        action: {
          type: 'OPEN_ASSESSMENTS',
          route: '/participant',
          tab: 'myEnrollments',
          courseId: quizCourseId,
          subtab: 'quizzes',
          autoExecute: true,
          confirmationMessage: `Opening quizzes for "${quizCourseTitle}".`,
        },
        reply: `Opening the **Quizzes** section for **"${quizCourseTitle}"**. You don't have any pending quizzes right now. Once your trainer assigns a quiz, it will be listed here.`,
        actionButtons: [
          { label: 'View Quizzes', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'myEnrollments', courseId: quizCourseId, subtab: 'quizzes' },
          { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
        ],
        suggestions: ['Continue my course', 'What should I do next?'],
      };
    }

    // Default "show assessments" / "open assessments" / "quizzes"
    return {
      intent: 'OPEN_ASSESSMENTS',
      action: {
        type: 'OPEN_ASSESSMENTS',
        route: '/participant',
        tab: 'myEnrollments',
        courseId: quizCourseId,
        subtab: 'quizzes',
        autoExecute: true,
        confirmationMessage: `Opening quizzes for "${quizCourseTitle}".`,
      },
      reply: `Opening the **AI Quizzes** section in **"${quizCourseTitle}"** now.`,
      actionButtons: [
        { label: 'View Quizzes', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'myEnrollments', courseId: quizCourseId, subtab: 'quizzes' },
        { label: 'View Results', action: 'navigate', type: 'VIEW_RESULTS', route: '/participant', tab: 'reports' },
      ],
      suggestions: ['Start my assessment', 'Scan QR', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Certificates Actions
  // E.g.: "Show my certificates", "Open certificates", "Do I have certificates?", "Show my certificate", "certificate kaatu"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('certificate') ||
    query.includes('certif') ||
    query.includes('certs') ||
    query.includes('certificate kaatu')
  ) {
    if (certificateCount === 0) {
      return {
        intent: 'OPEN_CERTIFICATES',
        action: null,
        reply: `You don't have any certificates yet.\n\nOnce a certificate is earned by completing 100% of your course requirements, lessons, and assessments, I can open it for you.`,
        actionButtons: [
          { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
        ],
        suggestions: ['What should I do next?', 'Continue my course'],
      };
    }

    return {
      intent: 'OPEN_CERTIFICATES',
      action: {
        type: 'OPEN_CERTIFICATES',
        route: '/participant',
        tab: 'certificates',
        autoExecute: true,
        confirmationMessage: `Opening your ${certificateCount} certificate(s). 🏆`,
      },
      reply: `You have earned **${certificateCount} certificate(s)**! Opening your Certificates page now.`,
      actionButtons: [
        { label: '🏆 View Certificates', action: 'navigate', type: 'OPEN_CERTIFICATES', route: '/participant', tab: 'certificates' },
      ],
      suggestions: ['What should I do next?', 'Open my courses'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Specific Course Matching by Technology or Title
  // E.g.: "Open React", "Open my React course", "Go to React", "Start React", "Take me to React",
  //       "Show React course", "I want to learn React", "Open the React training", "react course open pannu"
  // ─────────────────────────────────────────────────────────────────────────────
  // Helper to check if query mentions a course name (e.g. React, Java, Node, Python, AWS, etc.)
  const findMentionedCourse = () => {
    if (enrolledCourses.length === 0) return null;

    for (const course of enrolledCourses) {
      const cTitle = (course.courseTitle || '').toLowerCase();
      // Tokenize title into significant words (e.g. "React JS Essentials" -> ["react", "essentials"])
      const tokens = cTitle.split(/[\s\-_/]+/).filter(t => t.length > 2 && !['course', 'training', 'mastery', 'basics', 'advanced', 'program'].includes(t));

      if (cTitle && query.includes(cTitle)) {
        return course;
      }
      for (const token of tokens) {
        if (query.includes(token)) {
          return course;
        }
      }
    }
    return null;
  };

  const mentionedCourse = findMentionedCourse();

  // If specific course was matched in enrolled courses
  if (
    mentionedCourse &&
    (
      query.includes('open') ||
      query.includes('go') ||
      query.includes('start') ||
      query.includes('take me') ||
      query.includes('learn') ||
      query.includes('show') ||
      query.includes('pannu') ||
      query.includes('course') ||
      query === mentionedCourse.courseTitle.toLowerCase()
    )
  ) {
    // Check if course enrollment is pending approval
    if (mentionedCourse.status === 'PENDING') {
      return {
        intent: 'OPEN_COURSE_PENDING',
        action: null,
        reply: `Your enrollment in **"${mentionedCourse.courseTitle}"** is currently pending trainer/admin approval.\n\nYou cannot start it yet until your enrollment is approved.`,
        actionButtons: [
          { label: 'View All Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
        ],
        suggestions: ['What should I do next?', 'Show my profile'],
      };
    }

    return {
      intent: 'OPEN_COURSE',
      action: {
        type: 'OPEN_COURSE',
        route: '/participant',
        tab: 'myEnrollments',
        courseId: mentionedCourse.courseId,
        courseName: mentionedCourse.courseTitle,
        autoExecute: true,
        confirmationMessage: `Opening your "${mentionedCourse.courseTitle}" course. 🚀`,
      },
      reply: `Sure **${userName}**! Opening your **"${mentionedCourse.courseTitle}"** course now.`,
      actionButtons: [
        { label: `📖 Open "${mentionedCourse.courseTitle}"`, action: 'navigate', type: 'OPEN_COURSE', route: '/participant', tab: 'myEnrollments', courseId: mentionedCourse.courseId, courseName: mentionedCourse.courseTitle },
        { label: 'View Assessments', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'myEnrollments', courseId: mentionedCourse.courseId, subtab: 'quizzes' },
      ],
      suggestions: [`Continue ${mentionedCourse.courseTitle}`, 'Show assessments', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Continue / Resume Course Actions
  // E.g.: "Continue my course", "Continue learning", "Where did I stop?", "Continue React", "Resume my course"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('continue') ||
    query.includes('resume') ||
    query.includes('where did i stop') ||
    query.includes('thodar')
  ) {
    if (enrolledCourses.length === 0) {
      return {
        intent: 'CONTINUE_COURSE',
        action: null,
        reply: `You don't have any active courses to continue yet.\n\nOnce you are enrolled in a course, you can track and resume your lessons right here.`,
        actionButtons: [
          { label: 'View Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
        ],
        suggestions: ['How do I complete my profile?', 'What should I do next?'],
      };
    }

    // Pick target course: if user mentioned one, use it; otherwise pick active course
    const targetCourse = mentionedCourse || enrolledCourses.find(c => c.progressPercent > 0 && c.progressPercent < 100) || enrolledCourses[0];
    const nextLesson = targetCourse.nextLesson;

    return {
      intent: 'CONTINUE_COURSE',
      action: {
        type: 'CONTINUE_COURSE',
        route: '/participant',
        tab: 'myEnrollments',
        courseId: targetCourse.courseId,
        lessonId: nextLesson?.id || null,
        courseName: targetCourse.courseTitle,
        autoExecute: true,
        confirmationMessage: `Resumed your "${targetCourse.courseTitle}" course${nextLesson ? ` at lesson "${nextLesson.title}"` : ''} (Progress: ${targetCourse.progressPercent}%).`,
      },
      reply: `Resuming your **"${targetCourse.courseTitle}"** course${nextLesson ? ` from lesson **"${nextLesson.title}"**` : ''} (Current Progress: **${targetCourse.progressPercent}%**).`,
      actionButtons: [
        {
          label: `▶ Continue "${targetCourse.courseTitle}"`,
          action: 'navigate',
          type: 'CONTINUE_COURSE',
          route: '/participant',
          tab: 'myEnrollments',
          courseId: targetCourse.courseId,
          lessonId: nextLesson?.id || null,
          courseName: targetCourse.courseTitle,
        },
        { label: 'View Assessments', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'myEnrollments', courseId: targetCourse.courseId, subtab: 'quizzes' },
      ],
      suggestions: ['View Assessments', 'Show my certificates', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Start Course / Begin Training
  // E.g.: "Start my course", "Start React", "Begin my training", "Start learning"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('start my course') ||
    query.includes('start course') ||
    query.includes('begin my training') ||
    query.includes('begin training') ||
    query.includes('start learning')
  ) {
    if (enrolledCourses.length === 0) {
      return {
        intent: 'START_COURSE',
        action: null,
        reply: `You are not enrolled in any training courses yet. Please wait for course assignment from your instructor.`,
        actionButtons: [
          { label: 'View Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
        ],
        suggestions: ['What should I do next?', 'Complete my profile'],
      };
    }

    const courseToStart = mentionedCourse || enrolledCourses[0];
    if (courseToStart.status === 'PENDING') {
      return {
        intent: 'START_COURSE_PENDING',
        action: null,
        reply: `Your enrollment for **"${courseToStart.courseTitle}"** is currently pending approval.\n\nYou cannot start it yet.`,
        actionButtons: [
          { label: 'View My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
        ],
        suggestions: ['What should I do next?', 'Show my profile'],
      };
    }

    return {
      intent: 'START_COURSE',
      action: {
        type: 'OPEN_COURSE',
        route: '/participant',
        tab: 'myEnrollments',
        courseId: courseToStart.courseId,
        courseName: courseToStart.courseTitle,
        autoExecute: true,
        confirmationMessage: `Starting your "${courseToStart.courseTitle}" course.`,
      },
      reply: `Starting your **"${courseToStart.courseTitle}"** course now. Let's begin learning!`,
      actionButtons: [
        { label: `🚀 Start "${courseToStart.courseTitle}"`, action: 'navigate', type: 'OPEN_COURSE', route: '/participant', tab: 'myEnrollments', courseId: courseToStart.courseId, courseName: courseToStart.courseTitle },
      ],
      suggestions: ['Continue my course', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Generic Course Commands (Single vs Multiple Disambiguation)
  // E.g.: "Open my courses", "Open my course", "Go to my courses", "Go to my course", "course open pannu", "en course open pannu"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('open my courses') ||
    query.includes('open the courses') ||
    query.includes('open courses') ||
    query.includes('show my courses') ||
    query.includes('show the courses') ||
    query.includes('show courses') ||
    query.includes('view my courses') ||
    query.includes('view the courses') ||
    query.includes('view courses') ||
    query.includes('all courses') ||
    query === 'my courses' ||
    query === 'the courses' ||
    query === 'courses'
  ) {
    return {
      intent: 'OPEN_COURSES',
      action: {
        type: 'OPEN_COURSES',
        route: '/participant',
        tab: 'myEnrollments',
        autoExecute: true,
        confirmationMessage: `Opening your enrolled courses (${enrolledCourses.length} course(s)).`,
      },
      reply: `Opening your **My Courses** dashboard now.`,
      actionButtons: [
        { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
      ],
      suggestions: ['Continue my course', 'What should I do next?'],
    };
  }

  if (
    query.includes('open my course') ||
    query.includes('open the course') ||
    query.includes('open course') ||
    query.includes('go to my course') ||
    query.includes('go to the course') ||
    query.includes('go to course') ||
    query.includes('go course') ||
    query.includes('take me to course') ||
    query.includes('take me to my course') ||
    query.includes('take me to the course') ||
    query.includes('course open pannu') ||
    query.includes('en course open pannu') ||
    query.includes('course open') ||
    query.includes('course po') ||
    query.includes('course kaatu') ||
    query.includes('en course') ||
    query === 'courses' ||
    query === 'course' ||
    query === 'the course'
  ) {
    // 0 courses
    if (enrolledCourses.length === 0) {
      return {
        intent: 'OPEN_COURSES',
        action: null,
        reply: `You don't have any enrolled courses yet.\n\nOnce an instructor enrolls you in a course, I can open it for you.`,
        actionButtons: [
          { label: 'View Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
        ],
        suggestions: ['How do I complete my profile?', 'What should I do next?'],
      };
    }

    // 1 course -> Auto open that single course!
    if (enrolledCourses.length === 1) {
      const singleCourse = enrolledCourses[0];
      return {
        intent: 'OPEN_COURSE',
        action: {
          type: 'OPEN_COURSE',
          route: '/participant',
          tab: 'myEnrollments',
          courseId: singleCourse.courseId,
          courseName: singleCourse.courseTitle,
          autoExecute: true,
          confirmationMessage: `Opening your "${singleCourse.courseTitle}" course. 🚀`,
        },
        reply: `Sure **${userName}**! Opening your **"${singleCourse.courseTitle}"** course now.`,
        actionButtons: [
          { label: `📖 Open "${singleCourse.courseTitle}"`, action: 'navigate', type: 'OPEN_COURSE', route: '/participant', tab: 'myEnrollments', courseId: singleCourse.courseId, courseName: singleCourse.courseTitle },
        ],
        suggestions: ['Continue my course', 'Show assessments', 'What should I do next?'],
      };
    }

    // Multiple courses -> Disambiguation requirement: Ask which one!
    return {
      intent: 'SELECT_COURSE',
      action: {
        type: 'SHOW_SELECTION',
        options: enrolledCourses.map(c => ({
          id: c.courseId,
          label: c.courseTitle,
        })),
        autoExecute: false,
      },
      reply: `You have **${enrolledCourses.length} enrolled courses**. Which one would you like to open?`,
      actionButtons: enrolledCourses.map(c => ({
        label: `📖 ${c.courseTitle}`,
        action: 'navigate',
        type: 'OPEN_COURSE',
        route: '/participant',
        tab: 'myEnrollments',
        courseId: c.courseId,
        courseName: c.courseTitle,
      })),
      suggestions: enrolledCourses.map(c => `Open ${c.courseTitle}`),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Results / Scores Actions
  // E.g.: "Show my result", "Show my quiz result", "Show assessment result", "What is my score?", "result kaatu"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('result') ||
    query.includes('score') ||
    query.includes('marks') ||
    query.includes('result kaatu')
  ) {
    const results = context.quizzes?.recentResults || [];

    if (results.length > 0) {
      const scoreSummaries = results.slice(0, 3).map(r => `• Quiz #${r.quizId}: **${Math.round(r.percentage || r.score || 0)}%** (${r.passed ? 'Passed ✅' : 'Attempted'})`);
      return {
        intent: 'VIEW_RESULTS',
        action: {
          type: 'VIEW_RESULTS',
          route: '/participant',
          tab: 'reports',
          autoExecute: true,
          confirmationMessage: 'Opening your Learning Reports & Assessment Results.',
        },
        reply: `Here are your recent published results:\n\n${scoreSummaries.join('\n')}\n\nOpening your full Learning Reports now!`,
        actionButtons: [
          { label: '📊 View Full Reports', action: 'navigate', type: 'VIEW_RESULTS', route: '/participant', tab: 'reports' },
        ],
        suggestions: ['Show certificates', 'What should I do next?'],
      };
    }

    if (context.quizzes?.attemptedCount > 0) {
      return {
        intent: 'RESULTS_PENDING',
        action: {
          type: 'VIEW_RESULTS',
          route: '/participant',
          tab: 'reports',
          autoExecute: true,
          confirmationMessage: 'Opening your Learning Reports.',
        },
        reply: `Your assessment attempt has been recorded, but the official results have not been published by your trainer yet.\n\nOpening your Reports page to view your submission status.`,
        actionButtons: [
          { label: 'View Reports', action: 'navigate', type: 'VIEW_RESULTS', route: '/participant', tab: 'reports' },
        ],
        suggestions: ['What should I do next?', 'Open my courses'],
      };
    }

    return {
      intent: 'NO_RESULTS_YET',
      action: null,
      reply: `You haven't completed any assessments or quizzes yet.\n\nOnce you complete a quiz and your score is published, it will appear here.`,
      actionButtons: [
        { label: 'View Assessments', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'myEnrollments', courseId: primaryCourseId, subtab: 'quizzes' },
      ],
      suggestions: ['Start my assessment', 'Continue my course'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Profile Actions (Open, Edit, Complete)
  // E.g.: "Open my profile", "Show my profile", "Edit my profile", "Complete my profile", "profile open pannu"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('edit profile') ||
    query.includes('edit my profile') ||
    query.includes('update profile') ||
    query.includes('update my profile') ||
    query.includes('change profile') ||
    query.includes('add skill') ||
    query.includes('upload resume') ||
    query.includes('add education') ||
    query.includes('add experience')
  ) {
    return {
      intent: 'EDIT_PROFILE',
      action: {
        type: 'EDIT_PROFILE',
        route: '/my-profile',
        autoExecute: true,
        confirmationMessage: 'Opened your Profile editor.',
      },
      reply: `Opening your **Profile** editor so you can update skills, education, experience, and resume.`,
      actionButtons: [
        { label: '✏️ Edit Profile', action: 'navigate', type: 'EDIT_PROFILE', route: '/my-profile' },
      ],
      suggestions: ['What should I do next?', 'Show my certificates'],
    };
  }

  if (
    query.includes('complete profile') ||
    query.includes('complete my profile') ||
    query.includes('how do i complete my profile') ||
    query.includes('is my profile complete')
  ) {
    const missing = context.profile?.missingSections || [];
    return {
      intent: 'COMPLETE_PROFILE',
      action: {
        type: 'OPEN_PROFILE',
        route: '/my-profile',
        autoExecute: true,
        confirmationMessage: 'Opening your Profile.',
      },
      reply: `Your profile completion is currently at **${profileCompletion}%** (${context.profile.completedSections}/${context.profile.totalSections} sections done).\n\n` +
        (missing.length > 0 ? `**Missing details to complete:**\n${missing.map(m => `• ${m}`).join('\n')}\n\n` : `Your profile is 100% complete! 🎉\n\n`) +
        `Opening your Profile page now.`,
      actionButtons: [
        { label: '👤 Open Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
      ],
      suggestions: ['What should I do next?', 'Open my courses'],
    };
  }

  if (
    query.includes('profile open') ||
    query.includes('open profile') ||
    query.includes('open the profile') ||
    query.includes('open my profile') ||
    query.includes('show profile') ||
    query.includes('show the profile') ||
    query.includes('show my profile') ||
    query.includes('view profile') ||
    query.includes('view the profile') ||
    query.includes('view my profile') ||
    query.includes('go to profile') ||
    query.includes('go to the profile') ||
    query.includes('go to my profile') ||
    query.includes('profile kaatu') ||
    query.includes('profile open pannu') ||
    query === 'profile' ||
    query === 'the profile' ||
    query === 'my profile'
  ) {
    return {
      intent: 'OPEN_PROFILE',
      action: {
        type: 'OPEN_PROFILE',
        route: '/my-profile',
        autoExecute: true,
        confirmationMessage: "You're now on your Profile page.",
      },
      reply: `Opening your **Participant Profile** now.`,
      actionButtons: [
        { label: 'View Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
        { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
      ],
      suggestions: ['How do I complete my profile?', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Achievements & Leaderboard Actions
  // E.g.: "Show my achievements", "Open achievements", "What achievements do I have?", "Leaderboard"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('achievement') ||
    query.includes('badge') ||
    query.includes('accomplishment')
  ) {
    return {
      intent: 'OPEN_ACHIEVEMENTS',
      action: {
        type: 'OPEN_ACHIEVEMENTS',
        route: '/participant',
        tab: 'achievements',
        autoExecute: true,
        confirmationMessage: 'Opening your Achievements.',
      },
      reply: `Opening your **Achievements & Badges** now.`,
      actionButtons: [
        { label: '🏆 View Achievements', action: 'navigate', type: 'OPEN_ACHIEVEMENTS', route: '/participant', tab: 'achievements' },
        { label: '🥇 View Leaderboard', action: 'navigate', type: 'OPEN_LEADERBOARD', route: '/participant', tab: 'leaderboard' },
      ],
      suggestions: ['Show leaderboard', 'Show certificates'],
    };
  }

  if (
    query.includes('leaderboard') ||
    query.includes('rank') ||
    query.includes('standing') ||
    query.includes('who is on top')
  ) {
    return {
      intent: 'OPEN_LEADERBOARD',
      action: {
        type: 'OPEN_LEADERBOARD',
        route: '/participant',
        tab: 'leaderboard',
        autoExecute: true,
        confirmationMessage: 'Opening the Leaderboard.',
      },
      reply: `Opening the **Participant Leaderboard** now to see how you rank among learners.`,
      actionButtons: [
        { label: '🥇 View Leaderboard', action: 'navigate', type: 'OPEN_LEADERBOARD', route: '/participant', tab: 'leaderboard' },
        { label: '🏆 View Achievements', action: 'navigate', type: 'OPEN_ACHIEVEMENTS', route: '/participant', tab: 'achievements' },
      ],
      suggestions: ['Show my achievements', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Interview Actions
  // E.g.: "Show my interviews", "Open interview", "What interviews do I have?", "Join my interview"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('interview') ||
    query.includes('mock interview') ||
    query.includes('schedule interview')
  ) {
    if (upcomingInterviews.length > 0) {
      const nextInterview = upcomingInterviews[0];
      const scheduledDate = new Date(nextInterview.scheduled_at);
      const formattedDate = isNaN(scheduledDate.getTime()) ? 'Soon' : scheduledDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      return {
        intent: 'OPEN_INTERVIEWS',
        action: {
          type: 'OPEN_INTERVIEWS',
          route: '/interviews',
          autoExecute: true,
          confirmationMessage: `Opening your Interviews page. Next interview: ${formattedDate}.`,
        },
        reply: `Your next interview **"${nextInterview.title || 'Technical Assessment'}"** is scheduled for **${formattedDate}** (${nextInterview.duration_minutes || 60} mins).\n\nOpening your Interview Room now.`,
        actionButtons: [
          { label: '🎥 Open Interview Room', action: 'navigate', type: 'OPEN_INTERVIEWS', route: '/interviews' },
          { label: '📷 Test QR Scanner', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
        ],
        suggestions: ['How do I scan the QR code?', 'What should I do next?'],
      };
    }

    return {
      intent: 'OPEN_INTERVIEWS',
      action: {
        type: 'OPEN_INTERVIEWS',
        route: '/interviews',
        autoExecute: true,
        confirmationMessage: 'Opening your Interviews page.',
      },
      reply: `You don't have any upcoming interviews scheduled right now.\n\nOpening your Interviews dashboard.`,
      actionButtons: [
        { label: 'Open Interviews', action: 'navigate', type: 'OPEN_INTERVIEWS', route: '/interviews' },
      ],
      suggestions: ['What should I do next?', 'Open my courses'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Dashboard / Overview Navigation
  // E.g.: "Open dashboard", "Go to dashboard", "dashboard open pannu", "Overview", "Home"
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('dashboard') ||
    query.includes('overview') ||
    query.includes('home') ||
    query.includes('main page') ||
    query === 'dashboard'
  ) {
    return {
      intent: 'OPEN_DASHBOARD',
      action: {
        type: 'OPEN_DASHBOARD',
        route: '/participant',
        tab: 'overview',
        autoExecute: true,
        confirmationMessage: 'You are now on your Dashboard Overview.',
      },
      reply: `Opening your **Dashboard Overview** now.`,
      actionButtons: [
        { label: '📊 Open Dashboard', action: 'navigate', type: 'OPEN_DASHBOARD', route: '/participant', tab: 'overview' },
      ],
      suggestions: ['Open my course', 'Scan QR', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. Fallback: Specific Named Course Not Enrolled
  // Only executed if the user explicitly requested a specific topic/technology not enrolled in
  // ─────────────────────────────────────────────────────────────────────────────
  const extractRequestedSubject = () => {
    const courseRegex = /^(?:open|go to|take me to|start|show|learn|i want to learn|open the)\s+(?:my\s+)?([a-z0-9+#.\s]+?)(?:\s+course|\s+training|\s+masterclass|\s+basics|\s+program)?$/i;
    const match = query.match(courseRegex);
    if (!match) return null;
    let subject = match[1].trim().toLowerCase();
    if (subject.startsWith('the ')) subject = subject.slice(4).trim();
    if (subject.startsWith('my ')) subject = subject.slice(3).trim();

    const systemKeywords = [
      'course', 'courses', 'the course', 'the courses', 'my course', 'my courses',
      'dashboard', 'overview', 'home', 'portal',
      'profile', 'the profile', 'my profile', 'account', 'my account',
      'certificate', 'certificates', 'the certificate', 'the certificates', 'my certificate', 'my certificates', 'cert', 'certs',
      'assessment', 'assessments', 'the assessment', 'the assessments', 'my assessment', 'my assessments',
      'quiz', 'quizzes', 'the quiz', 'the quizzes', 'my quiz', 'my quizzes',
      'test', 'tests', 'the test', 'the tests', 'my test', 'my tests',
      'exam', 'exams', 'the exam', 'the exams', 'my exam', 'my exams',
      'interview', 'interviews', 'the interview', 'the interviews', 'my interview', 'my interviews',
      'achievement', 'achievements', 'leaderboard', 'rank', 'ranking', 'rankings',
      'progress', 'my progress', 'reports', 'result', 'results', 'my result', 'my results',
      'score', 'scores', 'marks', 'mark',
      'qr', 'qr scanner', 'qr code', 'here', 'camera', 'scan'
    ];
    if (systemKeywords.includes(subject)) return null;
    return subject;
  };

  const requestedSubject = extractRequestedSubject();
  if (requestedSubject && !mentionedCourse) {
    const formattedSubject = requestedSubject.charAt(0).toUpperCase() + requestedSubject.slice(1);
    return {
      intent: 'OPEN_COURSE_NOT_ENROLLED',
      action: null,
      reply: `You are not currently enrolled in **"${formattedSubject}"**.` +
        (enrolledCourses.length > 0
          ? `\n\nYour active enrolled courses are:\n${enrolledCourses.map(c => `• **${c.courseTitle}**`).join('\n')}`
          : `\n\nYou don't have any enrolled courses assigned to your account yet.`),
      actionButtons: enrolledCourses.map(c => ({
        label: `📖 Open "${c.courseTitle}"`,
        action: 'navigate',
        type: 'OPEN_COURSE',
        route: '/participant',
        tab: 'myEnrollments',
        courseId: c.courseId,
        courseName: c.courseTitle,
      })),
      suggestions: enrolledCourses.length > 0 ? enrolledCourses.map(c => `Open ${c.courseTitle}`) : ['What should I do next?', 'Show my profile'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. "What Should I Do Next?" / "Guide me" / "Help me"
  // Multi-tier intelligent priority evaluation based on verified LMS state
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('what should i do') ||
    query.includes('what to do next') ||
    query.includes('what should i learn') ||
    query.includes('what to do now') ||
    query.includes('guide me') ||
    query.includes('help me') ||
    query.includes('next step') ||
    query.includes('next action')
  ) {
    // Priority 1: Incomplete Profile (< 75%)
    if (profileCompletion < 75) {
      const missingList = context.profile?.missingSections?.slice(0, 2).join(' and ') || 'details';
      return {
        intent: 'RECOMMENDATION_PROFILE',
        action: null,
        reply: `Hi **${userName}** 👋 Here is your recommended next step:\n\n` +
          `Your profile is currently at **${profileCompletion}%** completion.\n\n` +
          `👉 **Recommended Action:** Complete your profile details (e.g. ${missingList}) to ensure your account is verified and ready for certificates.`,
        actionButtons: [
          { label: '👤 Complete My Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
          ...(enrolledCourses.length > 0
            ? [{ label: `📖 Open "${enrolledCourses[0].courseTitle}"`, action: 'navigate', type: 'OPEN_COURSE', route: '/participant', tab: 'myEnrollments', courseId: enrolledCourses[0].courseId, courseName: enrolledCourses[0].courseTitle }]
            : []),
        ],
        suggestions: ['How do I complete my profile?', 'Open my course', 'Scan QR'],
      };
    }

    // Priority 2: Incomplete Enrolled Course
    const inProgressCourse = enrolledCourses.find(c => c.progressPercent < 100) || enrolledCourses[0];
    if (inProgressCourse) {
      const nextLesson = inProgressCourse.nextLesson;
      return {
        intent: 'RECOMMENDATION_COURSE',
        action: null,
        reply: `Hi **${userName}** 👋 Here is your recommended next step:\n\n` +
          `You are currently enrolled in **"${inProgressCourse.courseTitle}"** (Progress: **${inProgressCourse.progressPercent}%**).\n\n` +
          `👉 **Recommended Action:** Continue learning in **"${inProgressCourse.courseTitle}"**${nextLesson ? ` starting with lesson *"${nextLesson.title}"*` : ''}.`,
        actionButtons: [
          {
            label: `▶ Continue "${inProgressCourse.courseTitle}"`,
            action: 'navigate',
            type: 'CONTINUE_COURSE',
            route: '/participant',
            tab: 'myEnrollments',
            courseId: inProgressCourse.courseId,
            lessonId: nextLesson?.id || null,
            courseName: inProgressCourse.courseTitle,
          },
          ...(availableQuizzes.length > 0
            ? [{ label: `🚀 Start "${availableQuizzes[0].title}"`, action: 'navigate', type: 'START_ASSESSMENT', route: '/participant', tab: 'myEnrollments', courseId: availableQuizzes[0].courseId || inProgressCourse.courseId, subtab: 'quizzes', quizId: availableQuizzes[0].id }]
            : []),
        ],
        suggestions: [`Continue ${inProgressCourse.courseTitle}`, 'Show assessments', 'Show certificates'],
      };
    }

    // Priority 3: Pending Assessment
    if (availableQuizzes.length > 0) {
      const q = availableQuizzes[0];
      const qCourseId = q.courseId || primaryCourseId;
      return {
        intent: 'RECOMMENDATION_ASSESSMENT',
        action: null,
        reply: `Hi **${userName}** 👋 Here is your recommended next step:\n\n` +
          `👉 **Recommended Action:** You have an active assessment ready: **"${q.title}"** (${q.timeLimit || 30} mins).\n\n` +
          `Take the assessment now to validate your learning.`,
        actionButtons: [
          { label: `🚀 Start "${q.title}"`, action: 'navigate', type: 'START_ASSESSMENT', route: '/participant', tab: 'myEnrollments', courseId: qCourseId, subtab: 'quizzes', quizId: q.id },
          { label: '📷 Open QR Scanner', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
        ],
        suggestions: ['How do I scan the QR code?', 'Show my certificates'],
      };
    }

    // Priority 4: Upcoming Interview
    if (upcomingInterviews.length > 0) {
      const interview = upcomingInterviews[0];
      const scheduledDate = new Date(interview.scheduled_at);
      const formattedDate = isNaN(scheduledDate.getTime()) ? 'Soon' : scheduledDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return {
        intent: 'RECOMMENDATION_INTERVIEW',
        action: null,
        reply: `Hi **${userName}** 👋 Here is your recommended next step:\n\n` +
          `👉 **Recommended Action:** Prepare for your upcoming interview **"${interview.title || 'Technical Assessment'}"** on **${formattedDate}**.`,
        actionButtons: [
          { label: '🎥 Open Interview Room', action: 'navigate', type: 'OPEN_INTERVIEWS', route: '/interviews' },
        ],
        suggestions: ['Scan QR', 'Show certificates'],
      };
    }

    // Priority 5: Completed All Courses
    return {
      intent: 'RECOMMENDATION_ALL_COMPLETE',
      action: null,
      reply: `Hi **${userName}** 🎉 You are fully caught up on your courses and assessments!\n\n` +
        `👉 **Recommended Action:** View your earned certificates and see your ranking on the platform leaderboard.`,
      actionButtons: [
        { label: '🏆 View Certificates', action: 'navigate', type: 'OPEN_CERTIFICATES', route: '/participant', tab: 'certificates' },
        { label: '🥇 View Leaderboard', action: 'navigate', type: 'OPEN_LEADERBOARD', route: '/participant', tab: 'leaderboard' },
      ],
      suggestions: ['Show certificates', 'Show leaderboard', 'Open my profile'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. Contextual Query ("What can I do here?" / "Where am I?")
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('what can i do here') ||
    query.includes('what is this page') ||
    query.includes('where am i')
  ) {
    const currentRoute = context.clientContext?.currentRoute || '';
    const currentTab = context.clientContext?.currentTab || '';

    if (currentRoute === '/my-profile' || currentTab === 'profile') {
      return {
        intent: 'CONTEXT_PROFILE',
        action: null,
        reply: `You are on your **Participant Profile** page.\n\nHere you can view and update your contact information, bio, uploaded resume, verified skills, educational background, work experience, and personal projects.`,
        actionButtons: [
          { label: '✏️ Edit Profile Details', action: 'navigate', type: 'EDIT_PROFILE', route: '/my-profile' },
          { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
        ],
        suggestions: ['How do I complete my profile?', 'Open my course'],
      };
    }

    if (currentTab === 'myEnrollments' || currentRoute.includes('/courses')) {
      return {
        intent: 'CONTEXT_COURSES',
        action: null,
        reply: `You are in **My Courses**.\n\nHere you can browse your enrolled training programs, access lecture materials, watch video lessons, read notes, and work through coding exercises.`,
        actionButtons: [
          { label: 'Continue Learning', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
          { label: 'View Assessments', action: 'navigate', type: 'OPEN_ASSESSMENTS', route: '/participant', tab: 'ai-quizzes' },
        ],
        suggestions: ['Continue my course', 'Show certificates'],
      };
    }

    if (currentTab === 'ai-quizzes' || currentRoute.includes('/quizzes') || currentRoute.includes('/exam')) {
      return {
        intent: 'CONTEXT_QUIZZES',
        action: null,
        reply: `You are in **Assessments & Quizzes**.\n\nHere you can take proctored AI quizzes, view time limits, pair a secondary camera via QR code, and check published quiz scores.`,
        actionButtons: [
          { label: '📷 Scan QR Code', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
          { label: 'View Reports', action: 'navigate', type: 'VIEW_RESULTS', route: '/participant', tab: 'reports' },
        ],
        suggestions: ['Scan QR', 'Show my results'],
      };
    }

    if (currentRoute === '/interviews' || currentTab === 'interviews') {
      return {
        intent: 'CONTEXT_INTERVIEWS',
        action: null,
        reply: `You are in the **Interview Module**.\n\nHere you can join live technical interview rooms, connect secondary cameras, and review scheduled mock interviews.`,
        actionButtons: [
          { label: '📷 Scan QR Code', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
        ],
        suggestions: ['Scan QR', 'Open dashboard'],
      };
    }

    return {
      intent: 'CONTEXT_DASHBOARD',
      action: null,
      reply: `You are on the **WAVE INIT LMS Participant Portal**.\n\nFrom here you can access your enrolled courses, take proctored quizzes, scan QR codes for mobile pairing, view certificates, and manage your student profile.`,
      actionButtons: [
        { label: '📖 Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
        { label: '📷 Scan QR', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
      ],
      suggestions: ['Open my course', 'Show certificates', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. Unsupported / Non-existent Feature Guardrails
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    query.includes('download course offline') ||
    query.includes('offline mode') ||
    query.includes('delete account') ||
    query.includes('become admin') ||
    query.includes('hack') ||
    query.includes('drop database')
  ) {
    return {
      intent: 'UNSUPPORTED_FEATURE',
      action: null,
      reply: `That feature is not supported in WAVE INIT LMS.\n\nAll courses, lessons, code assessments, and quizzes are securely accessed online through your student portal.`,
      actionButtons: [
        { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
      ],
      suggestions: ['Open my course', 'What should I do next?'],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. Informational / Conceptual Query Fallback
  // E.g.: "What is a heatmap?", "What is proctoring?", "What is React?"
  // ─────────────────────────────────────────────────────────────────────────────
  return {
    intent: 'INFORMATIONAL',
    action: null,
    reply: `Hi **${userName}** 👋 I am your **WAVE INIT Action-Based LMS Agent**.\n\n` +
      `Instead of just giving instructions, I can directly perform real actions for you:\n` +
      `• **"Open my course"** or **"Open React"**\n` +
      `• **"Continue my course"**\n` +
      `• **"Scan QR"**\n` +
      `• **"Show certificates"**\n` +
      `• **"Start assessment"**\n` +
      `• **"Open my profile"**\n` +
      `• **"What should I do next?"**\n\n` +
      `Tell me what you'd like me to open or start!`,
    actionButtons: [
      { label: '✨ What should I do next?', action: 'send_message', message: 'What should I do next?' },
      { label: '📖 Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
      { label: '📷 Scan QR', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
    ],
    suggestions: ['Open my course', 'Scan QR', 'Show certificates', 'What should I do next?'],
  };
}

/**
 * Handle Participant Chatbot Request
 */
async function askParticipantChatbot({ userId, message, history = [], clientContext = {} }) {
  const context = await getParticipantContext(userId, clientContext);

  // 1. Resolve structured intent & action via deterministic Action Resolution Engine
  const resolved = resolveParticipantAction(message, context);

  // 2. If it's purely conversational or informational and Gemini is available, enhance the educational explanation
  if (resolved.intent === 'INFORMATIONAL' && GEMINI_API_KEY && GEMINI_API_KEY !== 'your-gemini-api-key-here') {
    try {
      const systemInstruction = `
You are the AI Action Agent for the Participant portal of WAVE INIT LMS.
Answer the learner's query clearly, accurately, and concisely in 2-3 sentences.
Do NOT give manual tutorial steps like "Click this then click that" if an action can be performed.
Participant Name: ${context.user.name}
Enrolled Courses: ${JSON.stringify(context.courses.map(c => c.courseTitle))}
Profile Completion: ${context.profile.completionPercent}%
Certificates Count: ${context.certificatesCount}
Current Route: ${clientContext.currentRoute || '/participant'}
      `.trim();

      const messagesPayload = [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Understood. I will provide a direct, concise, and helpful answer.' }] },
        ...history.slice(-4).map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content || h.message || '' }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: messagesPayload,
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        },
        { timeout: 7000 }
      );

      const aiText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiText && aiText.trim().length > 0) {
        resolved.reply = aiText.trim();
      }
    } catch (err) {
      // Gracefully maintain deterministic reply
    }
  }

  return {
    ...resolved,
    context: {
      profileCompletion: context.profile.completionPercent,
      enrolledCoursesCount: context.courses.length,
      certificatesCount: context.certificatesCount,
      availableQuizzesCount: context.quizzes.availableList.length,
    },
  };
}

module.exports = {
  askParticipantChatbot,
  getParticipantContext,
  resolveParticipantAction,
};
