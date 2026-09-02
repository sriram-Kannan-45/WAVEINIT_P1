'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const HTTP_TIMEOUT = process.env.AI_HTTP_TIMEOUT ? Number(process.env.AI_HTTP_TIMEOUT) : 4000;

/**
 * Default configurable thresholds for unlocking AI assistance levels.
 * Can be overridden per-assessment via CodingAssessment.aiUnlockThresholds.
 */
const DEFAULT_AI_UNLOCK_THRESHOLDS = {
  level1: {
    minSeconds: 120, // 2 minutes
    minEdits: 1,
    minTypedChars: 15,
  },
  level2: {
    minSeconds: 240, // 4 minutes
    minEdits: 2,
    minRunAttempts: 1,
  },
  level3: {
    minSeconds: 360, // 6 minutes
    minFailedRuns: 2,
  },
};

/**
 * Evaluates participant effort against the unlock requirements.
 */
function evaluateEffortAndUnlockStatus({
  timeSpentSeconds = 0,
  editCount = 0,
  typedChars = 0,
  runAttempts = 0,
  usageCount = 0,
  levelsUsed = [],
  customThresholds = null,
}) {
  const t = {
    level1: { ...DEFAULT_AI_UNLOCK_THRESHOLDS.level1, ...(customThresholds?.level1 || {}) },
    level2: { ...DEFAULT_AI_UNLOCK_THRESHOLDS.level2, ...(customThresholds?.level2 || {}) },
    level3: { ...DEFAULT_AI_UNLOCK_THRESHOLDS.level3, ...(customThresholds?.level3 || {}) },
  };

  const spent = Math.max(0, Number(timeSpentSeconds) || 0);
  const edits = Math.max(0, Number(editCount) || 0);
  const chars = Math.max(0, Number(typedChars) || 0);
  const runs = Math.max(0, Number(runAttempts) || 0);
  const used = Math.max(0, Number(usageCount) || 0);
  const usedLevels = Array.isArray(levelsUsed) ? levelsUsed : [];

  // Level 1: Hint
  // Requires at least 2 minutes spent AND at least one meaningful effort (editor changes, typed code, or a run attempt)
  const hasMadeMeaningfulAttempt = edits >= t.level1.minEdits || chars >= t.level1.minTypedChars || runs >= 1;
  const level1Unlocked = spent >= t.level1.minSeconds && hasMadeMeaningfulAttempt;

  // Level 2: Approach
  // Requires at least 4 minutes spent AND (>=2 edits OR >=1 run attempt OR Level 1 already used)
  const level2EffortMet = edits >= t.level2.minEdits || runs >= t.level2.minRunAttempts || used >= 1 || usedLevels.includes(1);
  const level2Unlocked = spent >= t.level2.minSeconds && level2EffortMet;

  // Level 3: Code Guidance
  // Requires at least 6 minutes spent AND (Level 1/2 used OR multiple run attempts)
  const level3EffortMet = usedLevels.includes(1) || usedLevels.includes(2) || used >= 1 || runs >= t.level3.minFailedRuns;
  const level3Unlocked = spent >= t.level3.minSeconds && level3EffortMet;

  const getReason = (lvl, unlocked) => {
    if (unlocked) return 'Available';
    if (lvl === 1) {
      if (spent < t.level1.minSeconds) {
        const remainingTime = Math.ceil(t.level1.minSeconds - spent);
        return `Try the problem for a little longer (${remainingTime}s remaining). Your hint will unlock after you make an attempt.`;
      }
      return 'Make an attempt in the editor or run your code to unlock this hint.';
    }
    if (lvl === 2) {
      if (spent < t.level2.minSeconds) {
        const remainingTime = Math.ceil(t.level2.minSeconds - spent);
        return `Approach guidance unlocks after ${remainingTime}s and some code attempts or running your code.`;
      }
      return 'Try modifying your code or running test cases first to unlock the approach guidance.';
    }
    if (lvl === 3) {
      if (spent < t.level3.minSeconds) {
        const remainingTime = Math.ceil(t.level3.minSeconds - spent);
        return `Code Guidance unlocks after ${remainingTime}s and prior attempts or hints.`;
      }
      return 'Try using Level 1 / Level 2 hints or testing your code multiple times first.';
    }
    return 'Not yet available.';
  };

  return {
    thresholds: t,
    activity: { timeSpentSeconds: spent, editCount: edits, typedChars: chars, runAttempts: runs, usageCount: used },
    levels: {
      1: {
        unlocked: Boolean(level1Unlocked),
        minSeconds: t.level1.minSeconds,
        timeRemaining: Math.max(0, t.level1.minSeconds - spent),
        message: getReason(1, level1Unlocked),
      },
      2: {
        unlocked: Boolean(level2Unlocked),
        minSeconds: t.level2.minSeconds,
        timeRemaining: Math.max(0, t.level2.minSeconds - spent),
        message: getReason(2, level2Unlocked),
      },
      3: {
        unlocked: Boolean(level3Unlocked),
        minSeconds: t.level3.minSeconds,
        timeRemaining: Math.max(0, t.level3.minSeconds - spent),
        message: getReason(3, level3Unlocked),
      },
    },
  };
}

/**
 * AI Output Safety Validation Layer.
 * Guarantees that no programming code, syntax snippets, pseudocode, or copy-paste code blocks
 * are ever returned to the participant.
 */
function filterAndSanitizeAiResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return 'Let us take a step back and think about the problem logic step by step.';
  }

  let text = rawText;

  // 1. Detect and replace full markdown code fences (```...``` or ~~~...~~~)
  const codeBlockRegex = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  text = text.replace(codeBlockRegex, () => {
    return 'Think about this step conceptually and try writing the logic in your own words.';
  });

  // 2. Strip inline code backticks containing code statements
  text = text.replace(/`([^`]+)`/g, (match, inner) => {
    if (isCodeSyntaxLine(inner)) {
      return `the condition to check`;
    }
    return inner;
  });

  // 3. Clean up line-by-line syntax remnants
  const rawLines = text.split('\n');
  const cleanedLines = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (isCodeSyntaxLine(trimmed)) {
      cleanedLines.push('Think about how to check this condition in your code.');
    } else {
      cleanedLines.push(line);
    }
  }

  let result = cleanedLines.join('\n').trim();

  // 4. Double check for any residual raw syntax keywords or return statements
  result = result
    .replace(/\bdef\s+[a-zA-Z0-9_]+\s*\(.*?\):?/gi, 'define your function')
    .replace(/\bfunction\s+[a-zA-Z0-9_]*\s*\(.*?\)\s*\{?/gi, 'create a function')
    .replace(/\bfor\s*\(.*?\)\s*\{?/gi, 'use a loop to check each element')
    .replace(/\bwhile\s*\(.*?\)\s*\{?/gi, 'use a loop while the condition is true')
    .replace(/\bif\s*\(.*?\)\s*\{?/gi, 'check the condition with an if check')
    .replace(/\bSystem\.out\.print(ln)?\s*\(.*?\);?/gi, 'print the result')
    .replace(/\bconsole\.log\s*\(.*?\);?/gi, 'output the result')
    .replace(/\bprint\s*\(.*?\)/gi, 'display the answer')
    .replace(/\breturn\s+["']?[a-zA-Z0-9_+\-*/%<>=!&|()\s]+["']?;?/gi, 'produce the required result');

  return result || 'Let us think about what the question is asking and solve it step by step.';
}

/**
 * Helper to identify if a single line or snippet resembles raw programming syntax.
 */
function isCodeSyntaxLine(line) {
  if (!line || typeof line !== 'string') return false;
  const s = line.trim();

  const codePatterns = [
    /^(def\s+|function\s+|class\s+|public\s+class|public\s+static\s+void|int\s+main)/i,
    /^(import\s+|from\s+\w+\s+import|#include\s+<|package\s+|using\s+namespace)/i,
    /^(const\s+|let\s+|var\s+|int\s+|float\s+|double\s+|char\s+|boolean\s+|bool\s+)[a-zA-Z0-9_]+\s*=/i,
    /^(for\s*\(|while\s*\(|if\s*\(|elif\s+|else\s*:|else\s*\{|switch\s*\(|case\s+)/i,
    /(console\.log\(|System\.out\.print|printf\(|cout\s*<<|cin\s*>>|scanf\()/i,
    /\breturn(\s+.*)?$/i,
    /(;\s*$|{\s*$|=>\s*{|\bdef\b|\bpublic\b)/,
    /(\[.*\]\s*=\s*|->|::|nullptr|NULL;)/,
  ];

  return codePatterns.some(pattern => pattern.test(s));
}

function containsDangerousCode(text) {
  return /```|(\bdef\s+\w+\()|(\bfunction\s+\w+\()|(\bint\s+main\s*\()|(console\.log)|(System\.out\.println)/i.test(text);
}

/**
 * Builds the strict beginner-friendly teaching prompt.
 */
function buildSystemPrompt({
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
}) {
  const levelDirections = {
    1: 'LEVEL 1 — HINT: Give ONLY a short, simple conceptual clue (1-2 easy sentences) to help the student start thinking. Do NOT explain the whole algorithm and NEVER write code.',
    2: 'LEVEL 2 — APPROACH: Explain the solving direction and steps in clear, very simple English. What to think first, what concept helps, and what result to expect. No code, no syntax, no pseudocode.',
    3: 'LEVEL 3 — CODE GUIDANCE: Explain the high-level program structure conceptually (for example: "First receive the input, then check your condition, then display the result"). NEVER show code, loops syntax, if syntax, or language keywords.',
  };

  const currentLevelInstruction = levelDirections[level] || levelDirections[1];

  return `You are a beginner-friendly coding mentor during a live assessment.

Your job is to help the participant understand the problem and think independently.

Use extremely simple English.
Explain concepts step by step.
Give ideas and directions, not solutions.
Never write code.
Never provide programming syntax.
Never provide pseudocode.
Never provide copy-paste instructions.
Never provide the final algorithm in exact implementation form.
Never reveal hidden test cases.
Never reveal the reference solution.

If asked for code or syntax, politely refuse and explain the idea instead:
"I cannot write the code for you during this assessment, but I can help you understand the idea."

LANGUAGE & TEACHING STYLE RULES:
- Use very simple English with short, clear sentences and easy words.
- If a technical word is needed, explain the word simply and why it is useful.
- Use a friendly teaching style ("Let's understand this step by step.", "First, think about what the question is asking.", "Try to solve this part yourself first.").
- If the student writes in Tamil or Tanglish (e.g. "Enaku purila"), reply in friendly, simple Tamil/Tanglish mixed with simple concepts, but NEVER provide code.
- If the student asks for error help, explain what the error means simply and where to check logically, without rewriting their code.

OUTPUT STRUCTURE:
Always organize your response into short, clear sections:

WHAT THE QUESTION WANTS:
(Simple explanation of what the question is asking)

WHAT YOU NEED TO THINK ABOUT:
(Simple points on what information is given and what to check)

IDEA TO TRY:
(Conceptual direction in plain words)

NEXT STEP:
(One simple action the student can try themselves)

LEVEL REQUIREMENT:
${currentLevelInstruction}

CONTEXT:
- Problem Title: ${title || 'Coding Problem'}
- Problem Description: ${problemStatement || 'No description provided.'}
${inputFormat ? `- Input Format: ${inputFormat}` : ''}
${outputFormat ? `- Output Format: ${outputFormat}` : ''}
${constraints ? `- Constraints: ${constraints}` : ''}
${sampleTestCases ? `- Sample Test Cases (Public):\n${sampleTestCases}` : ''}
- Programming Language: ${language}
- Student's Current Code (For your understanding of their thought process only):
${code || '(Student has not written code yet)'}
${errorContext ? `- Recent Error / Test Failure Output:\n${errorContext}` : ''}

STUDENT REQUEST:
"${question || 'Can you guide me on how to think about this problem?'}"

Provide your beginner-friendly, zero-code teaching guidance now:`;
}

/**
 * Multi-Tier Socratic AI Assistant call (Gemini Direct -> Python Microservice -> Local Offline Fallback)
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
  const prompt = buildSystemPrompt({
    title,
    problemStatement,
    inputFormat,
    outputFormat,
    constraints,
    language,
    code,
    question,
    level,
    action,
    errorContext,
    sampleTestCases,
  });

  // Tier 1: Direct Gemini API
  if (apiKey) {
    try {
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
          },
        },
        { timeout: HTTP_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
      );

      const text = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && typeof text === 'string' && text.trim()) {
        return filterAndSanitizeAiResponse(text.trim());
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
      { timeout: HTTP_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
    );
    const text = response.data?.assist;
    if (text && typeof text === 'string' && text.trim()) {
      return filterAndSanitizeAiResponse(text.trim());
    }
  } catch (err) {
    logger.warn('[CodingAiAssistant] Python AI service call failed', { error: err.message });
  }

  // Tier 3: Local intelligent Socratic generator (Offline safety fallback)
  const localOutput = generateLocalSocraticGuidance({
    title,
    problemStatement,
    language,
    code,
    question,
    level,
    action,
    errorContext,
  });

  return filterAndSanitizeAiResponse(localOutput);
}

/**
 * Local offline rule-based Socratic generator ensuring beginner-friendly, zero-code responses.
 */
function generateLocalSocraticGuidance({ title, problemStatement, language, code, question, level, action, errorContext }) {
  const qLower = (question || '').toLowerCase().trim();

  // Multi-lingual Tamil / Tanglish detection
  if (
    qLower.includes('purila') ||
    qLower.includes('puriyala') ||
    qLower.includes('therila') ||
    qLower.includes('enna panradhu') ||
    qLower.includes('solli thanga') ||
    qLower.includes('tamil')
  ) {
    return `WHAT THE QUESTION WANTS:
Parava illa. Simple ah paakalam.

WHAT YOU NEED TO THINK ABOUT:
Indha question la first enna input kudukranga, enna output venum nu yosinga.

IDEA TO TRY:
Oru oru step ah solve panna try pannunga. First input vaangi, apram check panna vendiya condition ah yosinga.

NEXT STEP:
Ungaloda code la first step mattum ezhudhi try pannunga.`;
  }

  // Student asking for code or syntax
  if (
    qLower.includes('give me code') ||
    qLower.includes('give code') ||
    qLower.includes('write code') ||
    qLower.includes('python code') ||
    qLower.includes('java code') ||
    qLower.includes('solution') ||
    qLower.includes('solve this for me') ||
    qLower.includes('give me an if') ||
    qLower.includes('syntax')
  ) {
    return `WHAT THE QUESTION WANTS:
I cannot write the code for you during this assessment, but I can help you understand the idea.

WHAT YOU NEED TO THINK ABOUT:
Let us think about what the question is asking. We need to take the input and check the condition step by step.

IDEA TO TRY:
1. Think about what information comes in first.
2. Think about what condition separates the right answer from other cases.
3. Decide what needs to be displayed at the end.

NEXT STEP:
Try writing the first part where you receive the input and test it in the editor.`;
  }

  // Error explanation
  if (action === 'explain_error' || errorContext || qLower.includes('error') || qLower.includes('wrong') || qLower.includes('fail')) {
    return `WHAT THE QUESTION WANTS:
Let us understand why your test did not pass.

WHAT YOU NEED TO THINK ABOUT:
${errorContext ? 'Look closely at what your program produced compared to what was expected.' : 'Check if all possible input cases are being handled.'}

IDEA TO TRY:
1. Check if the values match the exact expected format.
2. Check if your condition handles zero or edge cases properly.
3. Make sure all values are converted to the correct type before doing math.

NEXT STEP:
Check the condition in your code where the decision is made and test it again.`;
  }

  // Explain Problem / IO
  if (action === 'explain_problem' || action === 'explain_io' || qLower.includes('explain') || qLower.includes('input') || qLower.includes('output')) {
    return `WHAT THE QUESTION WANTS:
The goal is to read the given input and produce the correct output according to the problem rules.

WHAT YOU NEED TO THINK ABOUT:
- Look at the input values provided in the question.
- Notice what changes from the input to produce the expected answer.
- Think about what rule connects the input to the output.

IDEA TO TRY:
Think about what simple check or calculation is needed for each piece of input data.

NEXT STEP:
Look at the sample test case and walk through the calculation on paper or in your head first.`;
  }

  // Level 1: Hint
  if (level === 1 || action === 'hint') {
    return `WHAT THE QUESTION WANTS:
Let us start with a simple hint.

WHAT YOU NEED TO THINK ABOUT:
Think about what makes one input different from another.

IDEA TO TRY:
Can you break this into two simple steps: first reading the data, and then checking the rule?

NEXT STEP:
Think about the simplest possible example and what check is needed for it.`;
  }

  // Level 2: Approach
  if (level === 2 || action === 'approach') {
    return `WHAT THE QUESTION WANTS:
Let us understand the step-by-step solving approach.

WHAT YOU NEED TO THINK ABOUT:
1. First, receive and prepare the input data.
2. Next, look at each value and check if it satisfies the question condition.
3. Finally, format and display the result.

IDEA TO TRY:
Follow this direction: start by reading the input, apply your condition check, and save the result.

NEXT STEP:
Write the input part first and check if your values are ready for the condition.`;
  }

  // Level 3: Code Guidance
  return `WHAT THE QUESTION WANTS:
Let us understand the overall program structure.

WHAT YOU NEED TO THINK ABOUT:
- You will need a place to receive the input values.
- You will need a check to decide what result to give based on the condition.
- You will need a place to display the final result.

IDEA TO TRY:
Organize your thoughts into three parts: Input part, Condition check part, and Output part.

NEXT STEP:
Check whether both possible outcomes are handled in your check.`;
}

/**
 * Backend-enforced AI assistant for a coding participant.
 * Evaluates effort unlock criteria, checks hint limit, generates beginner-friendly guidance,
 * and passes the result through the AI safety filter.
 */
async function grantAssist({
  attemptId,
  problemId,
  participantId,
  code = '',
  language = 'javascript',
  question = "I'm stuck. Can you guide me?",
  level = 1,
  action = 'hint',
  errorContext = '',
  activity = {},
}) {
  const {
    CodingAttempt, CodingProblem, CodingTestCase, CodingAiHelp, CodingAssessment,
  } = require('../models');
  const { sequelize } = require('../config/db');

  const reqLevel = Math.min(3, Math.max(1, Number(level) || 1));

  const problem = await CodingProblem.findByPk(problemId, {
    include: [
      {
        model: CodingAssessment,
        as: 'assessment',
        attributes: ['id', 'title', 'aiHelpLimit', 'aiAssistantEnabled', 'aiUnlockThresholds'],
      },
    ],
  });
  if (!problem) throw Object.assign(new Error('Problem not found'), { status: 404 });

  const assessment = problem.assessment;
  const aiEnabled = assessment?.aiAssistantEnabled !== false;
  const limit = assessment?.aiHelpLimit != null ? Number(assessment.aiHelpLimit) : 1;

  if (!aiEnabled) throw Object.assign(new Error('AI assistant is disabled for this assessment'), { status: 400 });
  if (limit === 0) throw Object.assign(new Error('AI assistant is not available for this assessment'), { status: 400 });

  const unlimited = limit === -1;

  // Query previous help usage and attempt details to verify eligibility
  const attempt = await CodingAttempt.findOne({
    where: { id: attemptId, participantId, status: 'IN_PROGRESS' },
  });
  if (!attempt) throw Object.assign(new Error('Attempt not found or already submitted'), { status: 404 });

  const usage = (attempt.aiHelpUsage && typeof attempt.aiHelpUsage === 'object') ? attempt.aiHelpUsage : {};
  const used = Number(usage[String(problemId)] || 0);

  // Check hint limit
  if (!unlimited && used >= limit) {
    const err = new Error('You have used your AI assistant help limit for this question.');
    err.status = 429;
    err.code = 'AI_HELP_LIMIT_REACHED';
    err.remaining = 0;
    throw err;
  }

  // Get previous AI help records for this question to check levels used
  const previousHelps = await CodingAiHelp.findAll({
    where: { attemptId, problemId, participantId },
    attributes: ['id', 'usageNumber'],
  });
  const levelsUsed = previousHelps.map(h => h.usageNumber);

  // Calculate actual time and edits using server timestamps + client telemetry
  let timeSpent = Number(activity.timeSpentSeconds) || 0;
  if (!timeSpent && attempt.startedAt) {
    timeSpent = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
  }

  const editCount = Number(activity.editCount) || (code && code.length > 20 ? 1 : 0);
  const typedChars = Number(activity.typedChars) || (code ? code.length : 0);
  const runAttempts = Number(activity.runAttempts) || 0;

  // Evaluate unlock eligibility for the requested level
  const unlockEval = evaluateEffortAndUnlockStatus({
    timeSpentSeconds: timeSpent,
    editCount,
    typedChars,
    runAttempts,
    usageCount: used,
    levelsUsed,
    customThresholds: assessment.aiUnlockThresholds,
  });

  const levelStatus = unlockEval.levels[reqLevel];

  // If level is not unlocked, return encouragement without consuming a hint
  if (!levelStatus.unlocked) {
    const encouragementResponse = `WHAT THE QUESTION WANTS:
${levelStatus.message}

WHAT YOU NEED TO THINK ABOUT:
Take a few minutes to read the problem description, look at the sample input and output, and try writing your thoughts in code.

NEXT STEP:
Try typing your first step in the editor or run your code. Your help options will unlock as you make progress.`;

    const remaining = unlimited ? -1 : Math.max(0, limit - used);
    return {
      response: encouragementResponse,
      isLocked: true,
      unlockStatus: unlockEval,
      usageUsed: used,
      usageLimit: limit,
      remaining,
      unlimited,
      level: reqLevel,
    };
  }

  // Level is unlocked -> Execute transaction to consume hint and generate guidance
  const result = await sequelize.transaction(async (t) => {
    const lockedAttempt = await CodingAttempt.findOne({
      where: { id: attemptId, participantId, status: 'IN_PROGRESS' },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!lockedAttempt) throw Object.assign(new Error('Attempt not found or already submitted'), { status: 404 });

    const currentUsage = (lockedAttempt.aiHelpUsage && typeof lockedAttempt.aiHelpUsage === 'object') ? lockedAttempt.aiHelpUsage : {};
    const currentUsed = Number(currentUsage[String(problemId)] || 0);

    if (!unlimited && currentUsed >= limit) {
      const err = new Error('You have used your AI assistant help limit for this question.');
      err.status = 429;
      err.code = 'AI_HELP_LIMIT_REACHED';
      err.remaining = 0;
      throw err;
    }

    const nextNumber = currentUsed + 1;

    // Sanitize context: fetch visible sample test cases only, NEVER reference solution or hidden cases
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
      level: reqLevel,
      action: action || 'hint',
      errorContext: errorContext || '',
      sampleTestCases,
      usageNumber: nextNumber,
    });

    // Enforce safety filter
    const safeCoachingText = filterAndSanitizeAiResponse(coachingText);

    // Increment usage atomically
    currentUsage[String(problemId)] = nextNumber;
    await lockedAttempt.update({ aiHelpUsage: currentUsage }, { transaction: t });

    if (safeCoachingText) {
      await CodingAiHelp.create({
        attemptId,
        problemId,
        participantId,
        prompt: String(question || '').slice(0, 8000),
        response: String(safeCoachingText).slice(0, 20000),
        language: language || problem.programmingLanguage || 'javascript',
        code: code ? String(code).slice(0, 32000) : null,
        usageNumber: nextNumber,
      }, { transaction: t });
    }

    return { text: safeCoachingText, used: nextNumber };
  });

  const remaining = unlimited ? -1 : Math.max(0, limit - result.used);
  return {
    response: result.text,
    isLocked: false,
    unlockStatus: unlockEval,
    usageUsed: result.used,
    usageLimit: limit,
    remaining,
    unlimited,
    level: reqLevel,
  };
}

/**
 * Returns the current AI status and unlock progress for all levels.
 */
async function getStatus({ attemptId, problemId, participantId, activity = {} }) {
  const { CodingAttempt, CodingProblem, CodingAssessment, CodingAiHelp } = require('../models');

  const attempt = await CodingAttempt.findOne({ where: { id: attemptId, participantId, status: 'IN_PROGRESS' } });
  if (!attempt) return { used: 0, remaining: 0, enabled: false, unlockStatus: null };

  const problem = await CodingProblem.findByPk(problemId, {
    include: [{ model: CodingAssessment, as: 'assessment', attributes: ['aiHelpLimit', 'aiAssistantEnabled', 'aiUnlockThresholds'] }],
  });

  const assessment = problem?.assessment;
  const limit = assessment?.aiHelpLimit != null ? Number(assessment.aiHelpLimit) : 1;
  const enabled = assessment?.aiAssistantEnabled !== false;

  const usage = attempt.aiHelpUsage || {};
  const used = Number(usage[String(problemId)] || 0);

  const previousHelps = await CodingAiHelp.findAll({
    where: { attemptId, problemId, participantId },
    attributes: ['id', 'usageNumber'],
  });
  const levelsUsed = previousHelps.map(h => h.usageNumber);

  let timeSpent = Number(activity.timeSpentSeconds) || 0;
  if (!timeSpent && attempt.startedAt) {
    timeSpent = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
  }

  const unlockStatus = evaluateEffortAndUnlockStatus({
    timeSpentSeconds: timeSpent,
    editCount: Number(activity.editCount) || 0,
    typedChars: Number(activity.typedChars) || 0,
    runAttempts: Number(activity.runAttempts) || 0,
    usageCount: used,
    levelsUsed,
    customThresholds: assessment?.aiUnlockThresholds,
  });

  return {
    used,
    limit,
    enabled,
    unlimited: limit === -1,
    remaining: limit === -1 ? -1 : Math.max(0, limit - used),
    unlockStatus,
  };
}

module.exports = {
  grantAssist,
  getStatus,
  callAssist,
  evaluateEffortAndUnlockStatus,
  filterAndSanitizeAiResponse,
  DEFAULT_AI_UNLOCK_THRESHOLDS,
};
