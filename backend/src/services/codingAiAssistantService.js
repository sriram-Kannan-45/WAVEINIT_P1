const axios = require('axios');
const logger = require('../utils/logger');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Multi-Tier Socratic AI Assistant for Participant Coding Test
 *
 * GUARANTEES:
 * 1. Never reveals complete working solutions.
 * 2. Never leaks hidden test cases or expected outputs.
 * 3. Never leaks Trainer Reference Solutions.
 * 4. Supports 3 structured assistance levels:
 *    - LEVEL 1 (HINT): Small clue/direction.
 *    - LEVEL 2 (APPROACH): Algorithmic logic and step-by-step strategy without code.
 *    - LEVEL 3 (CODE GUIDANCE): Targeted feedback on the student's existing code and small syntax snippets.
 */
async function callAssist({
  title,
  problemStatement,
  inputFormat,
  outputFormat,
  constraints,
  language,
  code,
  question,
  level = 1,
  action = 'hint',
  errorContext = '',
  sampleTestCases = '',
  usageNumber = 1,
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  const levelDescriptions = {
    1: 'LEVEL 1 — HINT: Provide ONLY a small conceptual hint or a guiding question. Do NOT explain the entire algorithm and do NOT write any code.',
    2: 'LEVEL 2 — APPROACH: Explain the algorithmic approach, data structures, and logic step-by-step in clear plain English. Do NOT write the complete solution code.',
    3: 'LEVEL 3 — CODE GUIDANCE: Analyze the student\'s existing code. Point out logic flaws, off-by-one errors, or syntax issues. You may provide a tiny 1-2 line snippet to illustrate a specific syntax point if needed, but NEVER provide the entire solution.',
  };

  const currentLevelDesc = levelDescriptions[level] || levelDescriptions[1];

  const systemPrompt = `You are an expert, encouraging computer science tutor helping a student during a live timed coding assessment.

CRITICAL INSTRUCTIONS & GUARDRAILS:
1. NEVER PROVIDE THE FULL WORKING SOLUTION. Even if the student explicitly asks "Give me the solution", "Write the code for me", or "Solve this problem", politely refuse and instead guide them to write it themselves step-by-step.
2. NEVER LEAK HIDDEN TEST CASES OR HIDDEN EXPECTED OUTPUTS. You only have access to public sample cases.
3. Keep your response concise, polite, and directly helpful (maximum 3-4 paragraphs or concise bullet points).
4. Strictly follow the requested assistance level:
   ${currentLevelDesc}

CONTEXT:
- Problem Title: ${title || 'Coding Problem'}
- Problem Description: ${problemStatement || 'No description provided.'}
${inputFormat ? `- Input Format: ${inputFormat}` : ''}
${outputFormat ? `- Output Format: ${outputFormat}` : ''}
${constraints ? `- Constraints: ${constraints}` : ''}
${sampleTestCases ? `- Sample Test Cases (Public):\n${sampleTestCases}` : ''}
- Programming Language: ${language}
- Student's Current Code:
\`\`\`${language}
${code || '(Student has not written any code yet)'}
\`\`\`
${errorContext ? `- Recent Error / Test Failure Output:\n${errorContext}` : ''}

STUDENT'S REQUEST:
"${question || 'I am stuck. Can you help me understand how to approach this?'}"

Provide your Socratic guidance now according to the specified Level.`;

  // Tier 1: Direct Gemini API
  if (apiKey) {
    try {
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 600,
          },
        },
        { timeout: 25000, headers: { 'Content-Type': 'application/json' } }
      );

      const text = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    } catch (err) {
      logger.warn('[CodingAiAssistant] Gemini direct call failed, falling back', { error: err.message });
    }
  }

  // Tier 2: Python microservice fallback
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/coding/assist`,
      {
        title,
        problem_statement: problemStatement,
        constraints,
        language,
        code,
        question,
        level,
        action,
        usage_number: usageNumber,
      },
      { timeout: 25000, headers: { 'Content-Type': 'application/json' } }
    );
    const text = response.data?.assist;
    if (text && typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  } catch (err) {
    logger.warn('[CodingAiAssistant] Python AI service call failed', { error: err.message });
  }

  // Tier 3: Local intelligent Socratic generator (Offline safety fallback)
  return generateLocalSocraticGuidance({
    title,
    problemStatement,
    language,
    code,
    question,
    level,
    action,
    errorContext,
  });
}

/**
 * Local offline rule-based Socratic generator
 */
function generateLocalSocraticGuidance({ title, problemStatement, language, code, question, level, action, errorContext }) {
  const qLower = (question || '').toLowerCase();

  if (qLower.includes('solution') || qLower.includes('give me code') || qLower.includes('solve this for me')) {
    return `I can't provide the complete solution directly, but I can guide you through building it step-by-step!

1. **Understand the Goal**: Read the input format and expected output format carefully.
2. **Break it down**: What is the very first step? (e.g., reading input or setting up a loop).
3. **Try a partial step**: Write the basic loop or condition, run your code to inspect the output, and we can refine it together!`;
  }

  if (action === 'explain_io' || qLower.includes('input') || qLower.includes('output')) {
    return `### Input & Output Breakdown
- **Input**: Take a look at how the inputs are supplied. In ${language}, ensure you are correctly parsing strings vs numbers.
- **Output**: Make sure your output matches the exact format required (e.g., exact spaces, casing, or newline characters).`;
  }

  if (action === 'explain_error' || errorContext || qLower.includes('error')) {
    return `### Debugging Your Error
${errorContext ? `Your recent output indicates: \`${errorContext.slice(0, 150)}\`` : 'Let\'s check your implementation.'}

1. Check for off-by-one errors in your loop bounds or index access.
2. Verify all variables are initialized before use.
3. In ${language}, check if types match (e.g., converting strings to integers if doing math).`;
  }

  if (level === 1 || action === 'hint') {
    return `💡 **Hint**: Think about what data structure or control flow fits this problem best. Can you break the task into two simple parts: (1) reading the data, and (2) transforming it step-by-step?`;
  }

  if (level === 2 || action === 'approach') {
    return `🧭 **Recommended Approach**:
1. **Initialize State**: Set up any accumulator or tracker variables needed.
2. **Iterate & Process**: Traverse through the input elements sequentially using a standard loop in ${language}.
3. **Apply Conditions**: For each element, check the problem criteria and update your result.
4. **Return/Print**: Format and output the final value as requested.`;
  }

  // Level 3 Code Guidance
  return `🛠️ **Code Guidance**:
Take a look at your current code. Check if your loop terminates correctly and whether all edge cases (such as empty inputs or zero) are handled. Try adding a test print statement to inspect intermediate values!`;
}

/**
 * Backend-enforced AI assistant for a coding participant.
 */
async function grantAssist({
  attemptId,
  problemId,
  participantId,
  code,
  language,
  question,
  level = 1,
  action = 'hint',
  errorContext = '',
}) {
  const {
    CodingAttempt, CodingProblem, CodingTestCase, CodingAiHelp, CodingAssessment,
  } = require('../models');
  const { sequelize } = require('../config/db');

  const problem = await CodingProblem.findByPk(problemId, {
    include: [
      { model: CodingAssessment, as: 'assessment', attributes: ['id', 'title', 'aiHelpLimit', 'aiAssistantEnabled'] },
    ],
  });
  if (!problem) throw Object.assign(new Error('Problem not found'), { status: 404 });

  const assessment = problem.assessment;
  const aiEnabled = assessment?.aiAssistantEnabled !== false;
  const limit = assessment?.aiHelpLimit != null ? Number(assessment.aiHelpLimit) : 1;

  if (!aiEnabled) throw Object.assign(new Error('AI assistant is disabled for this assessment'), { status: 400 });
  if (limit === 0) throw Object.assign(new Error('AI assistant is not available for this assessment'), { status: 400 });

  const unlimited = limit === -1;

  const result = await sequelize.transaction(async (t) => {
    const attempt = await CodingAttempt.findOne({
      where: { id: attemptId, participantId, status: 'IN_PROGRESS' },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!attempt) throw Object.assign(new Error('Attempt not found or already submitted'), { status: 404 });

    const usage = (attempt.aiHelpUsage && typeof attempt.aiHelpUsage === 'object') ? attempt.aiHelpUsage : {};
    const used = Number(usage[String(problemId)] || 0);

    if (!unlimited && used >= limit) {
      const err = new Error('You have used your AI assistant help limit for this question.');
      err.status = 429;
      err.code = 'AI_HELP_LIMIT_REACHED';
      err.remaining = 0;
      throw err;
    }

    const nextNumber = used + 1;

    // Sanitize context: only fetch visible/sample test cases, NEVER reference solution or hidden cases.
    const visibleTestCases = await CodingTestCase.findAll({
      where: { problemId, isHidden: false },
      order: [['order', 'ASC']],
      attributes: ['input', 'expectedOutput', 'description'],
      transaction: t,
    });
    const sampleTestCases = visibleTestCases.length > 0
      ? visibleTestCases.map((tc, i) => `Sample ${i + 1} Input: ${tc.input || '(none)'} -> Expected: ${tc.expectedOutput || '(none)'}`).join('\n')
      : (problem.sampleInput ? `Sample Input: ${problem.sampleInput} -> Expected: ${problem.sampleOutput}` : '');

    const coachingText = await callAssist({
      title: problem.title,
      problemStatement: problem.description,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      constraints: problem.constraints || '',
      language: language || problem.programmingLanguage || 'javascript',
      code: code || '',
      question: question || "I'm stuck. Can you guide me?",
      level: Number(level) || 1,
      action: action || 'hint',
      errorContext: errorContext || '',
      sampleTestCases,
      usageNumber: nextNumber,
    });

    // Increment usage atomically.
    usage[String(problemId)] = nextNumber;
    await attempt.update({ aiHelpUsage: usage }, { transaction: t });

    if (coachingText) {
      await CodingAiHelp.create({
        attemptId,
        problemId,
        participantId,
        prompt: String(question || '').slice(0, 8000),
        response: String(coachingText).slice(0, 20000),
        language: language || problem.programmingLanguage || 'javascript',
        code: code ? String(code).slice(0, 32000) : null,
        usageNumber: nextNumber,
      }, { transaction: t });
    }

    return { text: coachingText, used: nextNumber };
  });

  const remaining = unlimited ? -1 : Math.max(0, limit - result.used);
  return {
    response: result.text,
    usageUsed: result.used,
    usageLimit: limit,
    remaining,
    unlimited,
    level,
  };
}

async function getStatus({ attemptId, problemId, participantId }) {
  const { CodingAttempt } = require('../models');
  const attempt = await CodingAttempt.findOne({ where: { id: attemptId, participantId, status: 'IN_PROGRESS' } });
  if (!attempt) return { used: 0, remaining: 0, enabled: false };
  const usage = attempt.aiHelpUsage || {};
  const used = Number(usage[String(problemId)] || 0);
  return { used };
}

module.exports = { grantAssist, getStatus };
