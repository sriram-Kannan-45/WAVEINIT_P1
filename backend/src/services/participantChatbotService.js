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
  QuizAttempt,
  CodingAttempt,
  Certificate,
} = require('../models');
const logger = require('../utils/logger');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Gather live LMS context for the authenticated participant.
 */
async function getParticipantContext(userId, clientContext = {}) {
  try {
    const [
      user,
      profile,
      enrollments,
      quizAttempts,
      availableQuizzes,
      certificates,
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
      }),
      Enrollment.findAll({
        where: { participantId: userId },
        include: [
          { model: Training, as: 'training', attributes: ['id', 'title'] },
          { model: Course, as: 'course', attributes: ['id', 'title', 'status'] },
        ],
      }),
      QuizAttempt.findAll({
        where: { participantId: userId },
        attributes: ['id', 'quizId', 'status', 'startedAt', 'submittedAt'],
        raw: true,
      }),
      AIQuiz.findAll({
        where: { isResultPublished: true },
        attributes: ['id', 'title', 'courseId', 'lessonId', 'timeLimit'],
        raw: true,
      }).catch(() => []),
      Certificate.findAll({
        where: { userId },
        attributes: ['id', 'certificateCode', 'issuedAt'],
        raw: true,
      }).catch(() => []),
    ]);

    // Calculate profile completion
    let completedSections = 0;
    const totalSections = 8;
    const missingSections = [];

    if (profile?.phone) completedSections++; else missingSections.push('Phone Number');
    if (profile?.about) completedSections++; else missingSections.push('About / Bio');
    if (profile?.profileImage) completedSections++; else missingSections.push('Profile Photo');
    if (profile?.resume) completedSections++; else missingSections.push('Resume');
    if (profile?.skills?.length > 0) completedSections++; else missingSections.push('Skills');
    if (profile?.experiences?.length > 0) completedSections++; else missingSections.push('Experience & Projects');
    if (profile?.educations?.length > 0) completedSections++; else missingSections.push('Education');
    if (profile?.certificates?.length > 0) completedSections++; else missingSections.push('Certifications');

    const profilePercent = Math.round((completedSections / totalSections) * 100);

    const enrolledCoursesList = enrollments.map(e => ({
      courseId: e.courseId,
      trainingId: e.trainingId,
      courseTitle: e.course?.title || 'Enrolled Course',
      trainingTitle: e.training?.title || 'Assigned Training',
      progressPercent: e.progressPercent || '0',
      status: e.status,
    }));

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
        completedCount: quizAttempts.filter(q => q.status === 'COMPLETED' || q.submittedAt).length,
        attemptedCount: quizAttempts.length,
        availableCount: availableQuizzes.length,
      },
      certificatesCount: certificates.length,
      clientContext,
    };
  } catch (err) {
    logger.error('Error fetching participant context for chatbot:', err);
    return {
      user: { name: 'Learner' },
      profile: { completionPercent: 0, missingSections: ['Profile details'] },
      courses: [],
      quizzes: { completedCount: 0, attemptedCount: 0 },
      certificatesCount: 0,
      clientContext,
    };
  }
}

/**
 * Intelligent Rule-Based Context Engine (Provides fast, deterministic, 100% accurate LMS instructions)
 */
function generateContextualGuidance(message, context) {
  const query = (message || '').toLowerCase().trim();
  const currentRoute = context.clientContext?.currentRoute || '';
  const currentTab = context.clientContext?.currentTab || '';
  const userName = context.user?.name || 'there';

  // 1. "What should I do next?" / "What do I do?" / "Next step"
  if (
    query.includes('what should i do') ||
    query.includes('what to do next') ||
    query.includes('next step') ||
    query.includes('i don\'t know what to do') ||
    query === 'what should i do next?'
  ) {
    if (context.profile.completionPercent < 80) {
      return {
        reply: `Hi **${userName}** 👋 Here is your recommended next step:\n\n` +
          `Your profile is currently at **${context.profile.completionPercent}%** completion (${context.profile.completedSections}/${context.profile.totalSections} sections).\n\n` +
          `### 🎯 Suggested Actions:\n` +
          `1. **Complete your Profile** — Add missing details (${context.profile.missingSections.slice(0, 3).join(', ')}).\n` +
          (context.courses.length > 0
            ? `2. **Continue Learning** — Open **"${context.courses[0].courseTitle}"** and resume your lessons.\n`
            : `2. **Wait for Training Assignment** — Your trainer or admin will assign your courses soon.\n`) +
          `3. **Attempt Pending Assessments** — Check the Assessments tab when quizzes become active.\n`,
        actionButtons: [
          { label: 'Complete My Profile', action: 'navigate', route: '/my-profile' },
          ...(context.courses.length > 0
            ? [{ label: `Open "${context.courses[0].courseTitle}"`, action: 'navigate', route: '/participant', tab: 'myCourses' }]
            : []),
        ],
        suggestions: ['How do I complete my profile?', 'How do I start a course?', 'How do I scan the QR code?'],
      };
    }

    if (context.courses.length > 0) {
      const firstCourse = context.courses[0];
      return {
        reply: `Hi **${userName}** 👋 You have **${context.courses.length} enrolled course(s)**.\n\n` +
          `### 🚀 Next Step:\n` +
          `👉 Open **"${firstCourse.courseTitle}"**\n\n` +
          `1. Go to **My Courses**.\n` +
          `2. Click on **"${firstCourse.courseTitle}"** to view lessons and materials.\n` +
          `3. Complete the current lesson video or reading.\n` +
          `4. Take the module quiz or coding assessment when ready.\n`,
        actionButtons: [
          { label: 'Open My Courses', action: 'navigate', route: '/participant', tab: 'myCourses' },
          { label: 'View Assessments', action: 'navigate', route: '/participant', tab: 'myQuizzes' },
        ],
        suggestions: ['How do I complete a lesson?', 'How do I take a quiz?', 'Where can I see my results?'],
      };
    }

    return {
      reply: `Hi **${userName}**! You are all set up on WAVE INIT LMS.\n\n` +
        `You currently don't have any assigned training or active courses. Please wait for your trainer or administrator to enroll you in a training batch. In the meantime, ensure your profile and contact links are up to date!`,
      actionButtons: [
        { label: 'View Profile', action: 'navigate', route: '/my-profile' },
      ],
      suggestions: ['How do I complete my profile?', 'Where can I see my certificates?', 'How do I scan the QR code?'],
    };
  }

  // 2. Profile completion / resume / skills
  if (
    query.includes('profile') ||
    query.includes('resume') ||
    query.includes('skill') ||
    query.includes('education') ||
    query.includes('experience') ||
    query.includes('certif')
  ) {
    const isProfilePage = currentRoute === '/my-profile' || currentTab === 'profile';
    return {
      reply: `${isProfilePage ? 'You are currently on your **Participant Profile** page.' : 'To manage your profile details:'}\n\n` +
        `### 📋 How to complete your profile:\n` +
        `1. Click the **Edit Profile** button in the header.\n` +
        `2. Fill in your **Phone Number**, **Department**, and **Bio**.\n` +
        `3. Under **Skills**, click **+ Add Skill** to add technical competencies.\n` +
        `4. Under **Education & Experience**, add your college, degree, or past internships.\n` +
        `5. Under **Resume**, click **Upload Resume** (PDF/DOC up to 5MB).\n` +
        `6. Add your **LinkedIn / GitHub** links in Social Links.\n\n` +
        `Your profile progress ring and learning heatmap will update dynamically!`,
      actionButtons: [
        { label: 'Open My Profile', action: 'navigate', route: '/my-profile' },
      ],
      suggestions: ['How do I upload my resume?', 'What should I do next?', 'How do I scan the QR code?'],
    };
  }

  // 3. QR Code Scanning & Mobile Camera Pairing
  if (
    query.includes('qr') ||
    query.includes('camera') ||
    query.includes('scan') ||
    query.includes('mobile join') ||
    query.includes('pair phone')
  ) {
    return {
      reply: `📱 **How to Scan the QR Code**\n\n` +
        `For proctored quizzes, coding assessments, or live interviews, secondary mobile camera pairing is used:\n\n` +
        `### Step-by-Step Instructions:\n` +
        `1. When a test or interview starts, a QR code appears on your screen.\n` +
        `2. Open your smartphone's camera or tap **[Start QR Scan]** below.\n` +
        `3. Point your camera at the QR code on the screen.\n` +
        `4. Tap the link that pops up on your phone (e.g. \`https://...\`).\n` +
        `5. Allow camera permissions on your phone when prompted.\n` +
        `6. Position your phone to show your desk and hands as requested.\n` +
        `7. Desktop will automatically detect the connection and unlock the test!`,
      actionButtons: [
        { label: '📷 Start QR Scan', action: 'open_qr_scanner' },
        { label: 'Go to Assessments', action: 'navigate', route: '/participant', tab: 'myQuizzes' },
      ],
      suggestions: ['Why do I need camera access?', 'What if QR scan fails?', 'What should I do next?'],
    };
  }

  // 4. Quizzes & Assessments & Results
  if (
    query.includes('quiz') ||
    query.includes('assessment') ||
    query.includes('exam') ||
    query.includes('test') ||
    query.includes('result') ||
    query.includes('score')
  ) {
    return {
      reply: `📝 **Taking Assessments & Viewing Results**\n\n` +
        `### How to take an Assessment:\n` +
        `1. Navigate to **Assessments** from the sidebar or click below.\n` +
        `2. Locate the assigned **Quiz** or **Coding Assessment**.\n` +
        `3. Click **Start Attempt**.\n` +
        `4. If secondary proctoring is enabled, scan the QR code with your phone.\n` +
        `5. Answer the questions before the timer runs out and click **Submit**.\n\n` +
        `### Where to see results:\n` +
        `• Go to **Assessments** → **Results** tab to view your score breakdown and feedback once published by your trainer.`,
      actionButtons: [
        { label: 'Open Assessments', action: 'navigate', route: '/participant', tab: 'myQuizzes' },
        { label: 'View My Results', action: 'navigate', route: '/participant', tab: 'myEnrollments' },
      ],
      suggestions: ['How do I scan the QR code?', 'What should I do next?', 'Where are my certificates?'],
    };
  }

  // 5. Courses / Lessons / Progress
  if (
    query.includes('course') ||
    query.includes('lesson') ||
    query.includes('training') ||
    query.includes('progress') ||
    query.includes('video')
  ) {
    const courseCount = context.courses.length;
    return {
      reply: `🎓 **Accessing Courses & Tracking Progress**\n\n` +
        (courseCount > 0
          ? `You are currently enrolled in **${courseCount} course(s)** (e.g. "${context.courses[0].courseTitle}").\n\n`
          : `You do not have any enrolled courses yet.\n\n`) +
        `### How to learn:\n` +
        `1. Go to **My Courses** from the sidebar.\n` +
        `2. Click **Open Course** on your active course card.\n` +
        `3. Select a module and click on a lesson to watch videos or view resources.\n` +
        `4. Complete lessons to increase your course progress bar.\n` +
        `5. Reach 100% completion to earn your course certificate!`,
      actionButtons: [
        { label: 'Open My Courses', action: 'navigate', route: '/participant', tab: 'myCourses' },
        { label: 'View Certificates', action: 'navigate', route: '/participant', tab: 'certificates' },
      ],
      suggestions: ['What should I do next?', 'How do I take a quiz?', 'Where can I see my certificates?'],
    };
  }

  // 6. Certificates
  if (query.includes('certificate') || query.includes('cert')) {
    return {
      reply: `🏆 **Your Certificates**\n\n` +
        `You have earned **${context.certificatesCount} certificate(s)** so far.\n\n` +
        `### How to get and download your certificate:\n` +
        `1. Complete all required lessons, quizzes, and assessments in your enrolled training.\n` +
        `2. Once your trainer approves final completion, your certificate is generated.\n` +
        `3. Go to **Certificates** in the sidebar to view, verify, and print your official certificate.`,
      actionButtons: [
        { label: 'View Certificates', action: 'navigate', route: '/participant', tab: 'certificates' },
      ],
      suggestions: ['What should I do next?', 'How do I start my training?', 'How do I complete my profile?'],
    };
  }

  // 7. Non-existent feature safeguard (e.g., Download course offline, Delete account, Change role)
  if (
    query.includes('download course') ||
    query.includes('offline mode') ||
    query.includes('delete account') ||
    query.includes('become admin') ||
    query.includes('become trainer')
  ) {
    return {
      reply: `That option is not currently available in WAVE INIT LMS.\n\n` +
        `You can access all course materials, video streams, quizzes, and code assessments directly online through the web portal.`,
      actionButtons: [
        { label: 'Open My Courses', action: 'navigate', route: '/participant', tab: 'myCourses' },
      ],
      suggestions: ['What should I do next?', 'How do I start a course?', 'How do I scan the QR code?'],
    };
  }

  // General LMS Assistant Fallback
  return {
    reply: `Hi **${userName}** 👋 I am your **WAVE INIT LMS Assistant**.\n\n` +
      `I can help you navigate courses, complete your profile, prepare for assessments, scan QR codes for secondary proctoring, and track your learning progress.\n\n` +
      `How can I assist you right now?`,
    actionButtons: [
      { label: '✨ What should I do next?', action: 'send_message', message: 'What should I do next?' },
      { label: 'Open My Courses', action: 'navigate', route: '/participant', tab: 'myCourses' },
      { label: 'Open My Profile', action: 'navigate', route: '/my-profile' },
    ],
    suggestions: ['What should I do next?', 'How do I complete my profile?', 'How do I scan the QR code?', 'How do I take a quiz?'],
  };
}

/**
 * Handle Participant Chatbot Request
 */
async function askParticipantChatbot({ userId, message, history = [], clientContext = {} }) {
  const context = await getParticipantContext(userId, clientContext);

  // If Gemini API Key is configured, attempt intelligent model generation with LMS knowledge base
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your-gemini-api-key-here') {
    try {
      const systemInstruction = `
You are the built-in AI Guide Assistant for the Participant/Learner module of WAVE INIT LMS.
Your task is to guide the student with simple, step-by-step, actionable instructions based on their current page and real state.

CURRENT LEARNER CONTEXT:
- Learner Name: ${context.user.name}
- Current Page/Route: ${clientContext.currentRoute || '/participant'}
- Current Tab: ${clientContext.currentTab || 'overview'}
- Profile Completion: ${context.profile.completionPercent}% (${context.profile.completedSections}/${context.profile.totalSections} sections done)
- Missing Profile Sections: ${context.profile.missingSections.join(', ') || 'None'}
- Enrolled Courses: ${JSON.stringify(context.courses)}
- Quizzes Completed: ${context.quizzes.completedCount}
- Certificates Earned: ${context.certificatesCount}

RULES & GUARDRAILS:
1. Provide short, clean, structured markdown responses with numbered steps.
2. NEVER invent non-existent LMS features (e.g. do NOT say "Download Course", "Offline Mode"). If asked for an unavailable feature, politely state: "That option is not currently available in your LMS."
3. If asked "What should I do next?", inspect their profile completion, enrolled courses, and pending assessments to give real next steps.
4. If asked about QR code scanning, explain the steps clearly: open camera, point at QR on screen, tap the link, allow camera permission on phone, position phone as secondary proctor.
5. Use a friendly, professional tone matching the WAVE INIT design.
      `.trim();

      const messagesPayload = [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Understood. I will provide concise, context-aware LMS guidance tailored to the learner without hallucinating features.' }] },
        ...history.slice(-6).map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content || h.message || '' }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: messagesPayload,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        },
        { timeout: 10000 }
      );

      const generatedText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generatedText) {
        // Formulate matching action buttons
        const guidance = generateContextualGuidance(message, context);
        return {
          reply: generatedText,
          actionButtons: guidance.actionButtons || [],
          suggestions: guidance.suggestions || [],
          context: {
            profileCompletion: context.profile.completionPercent,
            enrolledCoursesCount: context.courses.length,
          },
        };
      }
    } catch (apiErr) {
      logger.warn('Gemini API call failed for chatbot, falling back to contextual engine:', apiErr.message);
    }
  }

  // Context-aware rule engine (instant & 100% reliable)
  const guidance = generateContextualGuidance(message, context);
  return {
    ...guidance,
    context: {
      profileCompletion: context.profile.completionPercent,
      enrolledCoursesCount: context.courses.length,
    },
  };
}

module.exports = {
  askParticipantChatbot,
  getParticipantContext,
};
