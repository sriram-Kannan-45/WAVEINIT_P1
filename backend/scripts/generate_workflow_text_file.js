/**
 * generate_workflow_text_file.js
 * ──────────────────────────────
 * Compiles all current LMS quiz assessment structure and workflow codes
 * into a single unified text file: `current_structure_creation_workflow_codes.txt`
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');
const outputFile = path.join(rootDir, 'current_structure_creation_workflow_codes.txt');

const filesToInclude = [
  {
    relPath: 'frontend/src/components/QuizTaking.jsx',
    category: '1. FRONTEND: QUIZ TAKING & SUBMISSION PROCESSING UI',
    description: 'Main Quiz Taking interface featuring WAVE INIT LMS header, 4-metric statistics grid, question navigator, answer tamper locking, and the immediate "Test Completed Successfully / Result Processing" modal with real-time stage progress indicator.'
  },
  {
    relPath: 'frontend/src/styles/quiz-taking.css',
    category: '2. FRONTEND: COMPLETE QUIZ TAKING & MODAL STYLES',
    description: 'Full CSS stylesheet for header pills, gradient progress rail, question card, option letters, 4-stat cards, question navigator buttons, and backdrop-blur completion modals.'
  },
  {
    relPath: 'frontend/src/pages/ParticipantQuizAttemptPage.jsx',
    category: '3. FRONTEND: QUIZ ATTEMPT & POST-SUBMIT REDIRECT',
    description: 'Quiz attempt page lifecycle controller: loads attempt data, verifies consent/camera gates, mounts QuizTaking, and triggers automatic redirect to the Result Page upon submission.'
  },
  {
    relPath: 'frontend/src/pages/ParticipantQuizResultPage.jsx',
    category: '4. FRONTEND: VERIFIED QUIZ RESULT PAGE',
    description: 'Comprehensive assessment result page: queries live backend database, renders Published scores & question-by-question review, or displays Pending Review status banner with attempt summary.'
  },
  {
    relPath: 'frontend/src/App.jsx',
    category: '5. FRONTEND: QUIZ & RESULT ROUTING CONFIGURATION',
    description: 'Application route definitions linking both standalone (/quizzes/:quizId/result) and course-linked (/trainings/:trainingId/quizzes/:quizId/result) flows.',
    extractSection: (content) => {
      const lines = content.split('\n');
      const startIdx = lines.findIndex(l => l.includes('path="/trainings/:trainingId/quizzes/:quizId/attempt"'));
      const endIdx = lines.findIndex((l, idx) => idx > startIdx && l.includes('path="/test/:testId"'));
      if (startIdx !== -1 && endIdx !== -1) {
        return lines.slice(Math.max(0, startIdx - 5), endIdx + 5).join('\n');
      }
      return content;
    }
  },
  {
    relPath: 'backend/src/controllers/participantCourseController.js',
    category: '6. BACKEND: QUIZ SUBMISSION & RESULT DATABASE CONTROLLER',
    description: 'Server-side evaluation, transaction safety, attempt completion, and getQuizResult endpoint with attemptId query support and rich database metadata.',
    extractSection: (content) => {
      const lines = content.split('\n');
      const startIdx = lines.findIndex(l => l.includes('async function loadAccessibleQuiz('));
      const endIdx = lines.findIndex(l => l.includes('// ── Coding Assessments'));
      if (startIdx !== -1 && endIdx !== -1) {
        return lines.slice(startIdx, endIdx).join('\n');
      }
      return content;
    }
  },
  {
    relPath: 'backend/src/routes/aiQuizRoutes.js',
    category: '7. BACKEND: AI QUIZ SUBMISSION & MENTOR ROUTES',
    description: 'POST /participant/submit/:attemptId endpoint with atomic score calculation, attemptId response payload, and AI Mentor query endpoints.',
    extractSection: (content) => {
      const lines = content.split('\n');
      const startIdx = lines.findIndex(l => l.includes("router.post('/participant/submit/:attemptId'"));
      const endIdx = lines.findIndex((l, idx) => idx > startIdx && l.includes("router.get('/participant/quizzes'"));
      if (startIdx !== -1 && endIdx !== -1) {
        return lines.slice(Math.max(0, startIdx - 15), endIdx).join('\n');
      }
      return content;
    }
  },
  {
    relPath: 'backend/src/services/aiProvider.js',
    category: '8. BACKEND: AI PROVIDER & GROQ/GEMINI FAILOVER',
    description: 'Multi-provider AI routing with automatic Groq failover and 60-second cooldown on Gemini quota exhaustion (429).'
  },
  {
    relPath: 'backend/src/services/mentorProvider.js',
    category: '9. BACKEND: AI MENTOR CONTEXTUAL GUIDANCE & SAFETY',
    description: 'AI Mentor service that generates pedagogical conceptual hints without leaking answers and safely reviews mentor output.'
  },
  {
    relPath: 'backend/src/models/aiQuiz.js',
    category: '10. DATABASE SCHEMA: AI QUIZ STRUCTURE MODEL',
    description: 'Sequelize model definition for quizzes (title, timeLimit, resultStatus, courseId, trainingId, status).'
  },
  {
    relPath: 'backend/src/models/aiQuestion.js',
    category: '11. DATABASE SCHEMA: QUIZ QUESTION MODEL',
    description: 'Sequelize model definition for questions (questionText, questionType, options, correctAnswer, pairs, explanation, marks).'
  },
  {
    relPath: 'backend/src/models/quizAttempt.js',
    category: '12. DATABASE SCHEMA: QUIZ ATTEMPT MODEL',
    description: 'Sequelize model definition tracking attempt lifecycle (status, startedAt, submittedAt, timeTaken, monitoringSessionId).'
  },
  {
    relPath: 'backend/src/models/quizResult.js',
    category: '13. DATABASE SCHEMA: QUIZ RESULT MODEL',
    description: 'Sequelize model definition for computed results (totalScore, maxScore, percentage, passStatus, resultPublished).'
  },
  {
    relPath: 'backend/src/controllers/aiQuizGenerationController.js',
    category: '14. BACKEND: QUIZ STRUCTURE CREATION & AI GENERATION',
    description: 'Controller governing the creation and AI synthesis of quiz structures from documents or prompts.'
  }
];

let output = '';
output += '================================================================================\n';
output += '       WAVE INIT LMS: CURRENT STRUCTURE CREATION & WORKFLOW CODE ARCHIVE       \n';
output += '================================================================================\n';
output += `Generated At: ${new Date().toISOString()}\n`;
output += `Workspace: ${rootDir}\n`;
output += '\n';
output += 'WORKFLOW SUMMARY:\n';
output += '-----------------\n';
output += '1. Test-Taking UI Structure:\n';
output += '   - Header with WAVE INIT LMS brand pill, title, live red timer, and amber counter.\n';
output += '   - Main pane: Question card, 4-metric stats grid (Progress ring, Answered, Remaining, Total), and question navigator.\n';
output += '   - Sidebar: Live webcam & mobile monitoring tile + AI Mentor conceptual guidance chat.\n';
output += '2. Submission & Anti-Tamper Lifecycle:\n';
output += '   - Manual confirmation or auto-submit on time expiry (0s).\n';
output += '   - Immediate interaction lock preventing answer modifications.\n';
output += '   - Full-screen "Test Completed Successfully" modal with dynamic progress stages.\n';
output += '3. Database Submission & Calculation:\n';
output += '   - Backend transaction computes scores, creates QuizAnswer records, and upserts QuizResult.\n';
output += '   - Background proctoring audit teardown and session conclusion.\n';
output += '4. Result Verification & Automatic Redirect:\n';
output += '   - Live result queried from database (no fake delays).\n';
output += '   - Automatic redirection to ParticipantQuizResultPage displaying official scores or pending review notice.\n';
output += '5. Quiz Structure Creation & Database Models:\n';
output += '   - Database schemas (AIQuiz, AIQuestion, QuizAttempt, QuizResult) and generation controller.\n';
output += '\n';
output += 'TABLE OF CONTENTS:\n';
output += '------------------\n';
filesToInclude.forEach((f, idx) => {
  output += `${idx + 1}. [${f.category}] ${f.relPath}\n`;
});
output += '\n';

filesToInclude.forEach((item, idx) => {
  const fullPath = path.join(rootDir, item.relPath);
  output += '================================================================================\n';
  output += `SECTION ${idx + 1}: ${item.category}\n`;
  output += `FILE: ${item.relPath}\n`;
  output += `DESCRIPTION: ${item.description}\n`;
  output += '================================================================================\n\n';

  if (!fs.existsSync(fullPath)) {
    output += `[WARNING: File not found at path: ${fullPath}]\n\n`;
    return;
  }

  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (item.extractSection) {
      content = item.extractSection(content);
    }
    output += content;
    output += '\n\n';
  } catch (err) {
    output += `[ERROR READING FILE: ${err.message}]\n\n`;
  }
});

output += '================================================================================\n';
output += '                             END OF CODE ARCHIVE                                \n';
output += '================================================================================\n';

fs.writeFileSync(outputFile, output, 'utf8');
const stats = fs.statSync(outputFile);
console.log(`Successfully generated: ${outputFile} (${(stats.size / 1024).toFixed(1)} KB)`);
