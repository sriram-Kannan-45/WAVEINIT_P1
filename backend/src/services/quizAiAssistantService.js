'use strict';

const { requestMentorText, reviewMentorText } = require('./mentorProvider');
const logger = require('../utils/logger');
const answerGuard = require('./aiAnswerGuard');


/**
 * Default AI mentor limit when the quiz has not configured one (ai_help_limit = 0).
 */
const DEFAULT_AI_MENTOR_LIMIT = 3;

/**
 * Quiz answer-leak sanitisation layer (first pass).
 *
 * Neutralises letter-style reveals in place ("the answer is B", "Answer: C").
 * This runs BEFORE aiAnswerGuard.checkQuizResponse, which is the actual gate —
 * the guard blocks a reply outright when it contains the correct answer's text,
 * asserts an option as the answer, or quotes a long option verbatim. Keeping
 * both means an otherwise-good reply with a stray letter reveal gets repaired
 * rather than discarded, while a real answer leak is still blocked.
 */
function sanitiseQuizAiResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return 'Let us take a step back and reason about the question together.';
  }

  let text = rawText;

  // Hard rule: never allow a verbatim single-letter/option-style answer to stand alone.
  // Patterns: "the answer is B", "Answer: C", "correct option is A", "option 2", etc.
  const revealPatterns = [
    /\bthe\s+(correct\s+)?answer\s+(is|should\s+be)\s*[:=\-]?\s*\(?\s*[A-Da-d1-4]\)?/g,
    /\banswer\s*[:=\-]\s*\(?\s*[A-Ca-c1-4]\)?/g,
    /\boption\s+[A-Ca-c1-4]\s+is\s+(the\s+)?(correct|right|answer)/g,
    /\bchoose\s+[A-Ca-c1-4]\b/g,
    /\bselect\s+[A-Ca-c1-4]\b/g,
    /\b(correct|right)\s+option\s+is\s+[A-Ca-c1-4]/g,
    /\b(is|are)\s+(the|an?)\s+possible\s+answer\s*[:=\-]/gi,
  ];

  for (const re of revealPatterns) {
    text = text.replace(re, 'Apply the rule you identified to each choice yourself.');
  }

  // Strip any line that is just a bare letter answer (e.g. "B" or "Option B")
  text = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (/^\(?[A-Ca-c]\)?\.?\s*$/.test(trimmed) || /^option\s+[A-Ca-c]$/i.test(trimmed)) {
        return 'Apply the rule you identified to each choice yourself.';
      }
      return line;
    })
    .join('\n');

  return text.trim() || 'Let us reason about the question step by step.';
}

/**
 * Builds the strict Socratic quiz-mentor system prompt.
 *
 * IMPORTANT (Anti-Leak): The prompt context NEVER contains the correct answer,
 * the acceptable answers, the matching pairs, or the explanation. Only the
 * question stem, question type, the visible options (without marking any of
 * them), and their own chat history.
 */
function buildQuizSystemPrompt({
  questionText,
  questionType,
  options,
  question,
  history,
}) {
  const typeLabel = {
    MCQ: 'Multiple Choice (one correct option among the listed choices)',
    SHORT_ANSWER: 'Short Answer (the student types a brief response)',
    TRUE_FALSE: 'True or False',
    FILL_BLANK: 'Fill in the Blank',
    MATCHING: 'Matching (pairs)',
  }[questionType] || 'Quiz question';

  const optionsBlock = Array.isArray(options) && options.length > 0
    ? options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n')
    : '(No options listed)';

  return `You are an AI Mentor helping a participant during a live quiz assessment.

Your purpose is to help them understand the question and reach the answer themselves. You are not here to tell them which option is right.

NEVER DO THESE:
- Never say or hint which option, letter, value, word or match is correct.
- Never rank the options, say one is "most likely", or narrow it to a single choice.
- Never supply the fill-in-the-blank word, the short answer, or a matching pair.
- Never say "choose", "select", "pick", "go with" or "mark" followed by an option.
- Never state that any option is wrong in a way that leaves only one option standing.
- Never reveal marking, scoring or grading logic.

YOU MAY DO THESE:
- Restate the question in plainer words so they can see what it is really asking.
- Explain the concept, rule or definition the question is testing.
- Define a term the participant does not recognise.
- Explain what makes two options different in kind, without saying which side is right.
- Teach them the test to apply — the question they should ask of each option — and let them apply it.
- Ask one guiding question that moves their reasoning forward.

WHEN THEY ASK YOU TO ELIMINATE OPTIONS:
Give them the criterion, not the verdict. Say what an option would have to be true for, or what category it belongs to, and let them check each one against that. Do not walk down the list marking options out.

If they ask outright for the answer, decline warmly and redirect:
"I can't tell you which one it is during the assessment — but let's get you there. <guiding question>"

HOW TO WRITE THE REPLY:
- Write 3 to 5 very short paragraphs, one idea each, separated by a blank line. Never one dense block.
- Plain sentences. No markdown headings, no bullet characters, no code fences.
- Simple, warm, encouraging English. Short words, short sentences.
- End with one small thing they can try or check themselves.
- If the participant writes in Tamil or Tanglish (for example "enaku purila", "puriyala", "therila", "sollunga"), reply in the same friendly Tamil/Tanglish mix — the rules above still apply exactly.

WHAT YOU KNOW ABOUT THIS QUESTION:
- Question Type: ${typeLabel}
- Question Text: ${questionText || '(no question statement provided)'}
- Answer Choices, in the order shown to the participant. None of these is marked, and you have not been told which is correct:
${optionsBlock}
${history ? `- Your earlier messages with this participant on this question:\n${history}` : ''}

You have not been given the correct answer, the acceptable answers, the pairs, or the official explanation. Do not guess at them or claim to know them.

WHAT THEY ASKED:
"${question || 'Can you help me think through this question?'}"

Reply now, as their mentor, within the limits above.`;
}

/**
 * Multi-tier AI mentor call (shared Gemini/Groq provider with bounded live regeneration).
 *
 * Every tier's output passes through the answer guard and independent live
 * coaching review. A blocked reply falls through to the next tier
 * (regeneration); exhausted attempts return an error instead of local text.
 *
 * @returns {Promise<{text: string, possibleLeak: boolean, reasons: string[], tier: string}>}
 */
async function callQuizAssist({
  questionText,
  questionType,
  options,
  question,
  history,
  // Correct answer(s), used ONLY to check generated output. Deliberately never
  // passed to buildQuizSystemPrompt, so they never enter model context.
  answerStrings = [],
}) {
  const prompt = buildQuizSystemPrompt({
    questionText,
    questionType,
    options,
    question,
    history,
  });

  const leakReasons = [];
  let possibleLeak = false;

  /**
   * Returns the safe text, or null when the reply was blocked and the next tier
   * should be tried instead.
   */
  const guard = (text, tier) => {
    const firstPass = text;
    const verdict = answerGuard.checkQuizResponse({
      text: firstPass,
      options: Array.isArray(options) ? options : [],
      answerStrings,
    });
    if (verdict.possibleLeak) {
      possibleLeak = true;
      for (const r of verdict.reasons) leakReasons.push(`${tier}:${r}`);
      logger.warn('[QuizAiAssistant] Possible answer leak in AI response', {
        tier,
        reasons: verdict.reasons,
      });
    }
    if (verdict.blocked) return null;
    return verdict.text ? verdict.text : null;
  };

  const deadline = Date.now() + 18000;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (deadline - Date.now() < 1000) throw Object.assign(new Error('AI guidance timed out. Please retry.'), {status:503,code:'AI_GUIDANCE_TIMEOUT'});
    const remote = await requestMentorText(prompt + (attempt ? '\nYour previous response was rejected. Give a fresh conceptual hint without identifying any answer, final result, or complete solution. Do not require waiting or prior attempts.' : ''), {timeout: deadline - Date.now()});
    if (!remote?.text || !remote.provider) throw Object.assign(new Error('The AI provider returned no usable guidance. Please retry.'), {status: 503, code: 'AI_INVALID_RESPONSE'});
    const safe = guard(remote.text, remote.provider);
    if (safe && deadline - Date.now() >= 1000 && await reviewMentorText(prompt, safe, {timeout:deadline - Date.now()})) return {text: safe, possibleLeak, reasons: leakReasons, tier: remote.provider};
    possibleLeak = true;
    leakReasons.push('guidance_rejected');
  }
  throw Object.assign(new Error('The AI could not provide guidance without revealing the assessment answer. Please rephrase your question.'), {status: 502, code: 'AI_GUIDANCE_REJECTED'});
}

async function loadQuizHistory({ attemptId, questionId, participantId, noAnswerFilter }) {
  const { QuizAiHelp } = require('../models');
  const helps = await QuizAiHelp.findAll({
    where: { attemptId, questionId, participantId },
    order: [['id', 'DESC']],
    attributes: ['prompt', 'response'],
    limit: 8,
  });
  return helps.reverse()
    .map((h) => `Student: ${h.prompt}\nMentor: ${h.response}`)
    .join('\n\n')
    .slice(0, 4000);
}

/**
 * Backend-enforced AI mentor for a quiz attempt.
 *
 * Anti-leak, two separate loads:
 *   questionRow  — excludes correctAnswer/acceptableAnswers/pairs/explanation.
 *                  This is the ONLY row that reaches the prompt builder.
 *   answerStrings — loaded separately below and handed only to the response
 *                  guard for checking. Never passed to a model.
 */
async function grantQuizAssist({ attemptId, questionId, participantId, question = '' }) {
  const { QuizAttempt, AIQuestion, AIQuiz, QuizAiHelp } = require('../models');
  const { sequelize } = require('../config/db');

  const attempt = await QuizAttempt.findOne({
    where: { id: attemptId, participantId, status: 'IN_PROGRESS' },
  });
  if (!attempt) throw Object.assign(new Error('Attempt not found or already submitted'), { status: 404 });

  const questionRow = await AIQuestion.findByPk(questionId, {
    attributes: { exclude: ['correctAnswer', 'acceptableAnswers', 'pairs', 'explanation'] },
  });
  if (!questionRow || String(questionRow.quizId) !== String(attempt.quizId)) {
    throw Object.assign(new Error('Question not found for this quiz attempt'), { status: 404 });
  }

  // Answer key — CHECKING ONLY. Kept in its own variable, never merged into
  // questionRow, so it cannot be picked up by the prompt builder by accident.
  const answerStrings = [];
  try {
    const keyRow = await AIQuestion.findByPk(questionId, {
      attributes: ['correctAnswer', 'acceptableAnswers', 'pairs'],
    });
    const collect = (v) => {
      if (v == null) return;
      if (Array.isArray(v)) { v.forEach(collect); return; }
      if (typeof v === 'object') { Object.values(v).forEach(collect); return; }
      const s = String(v).trim();
      if (s) answerStrings.push(s);
    };
    // MCQ keys are stored as zero-based indices. Resolve them to the actual
    // answer text for the guard; an index such as "1" cannot catch "50 km/h".
    const options = Array.isArray(questionRow.options) ? questionRow.options : [];
    const key = String(keyRow?.correctAnswer ?? '').trim();
    if (['MCQ', 'TRUE_FALSE'].includes(questionRow.questionType) && /^[0-3]$/.test(key) && options[Number(key)] != null) collect(options[Number(key)]);
    else collect(keyRow?.correctAnswer);
    collect(keyRow?.acceptableAnswers);
    collect(keyRow?.pairs);
  } catch (err) {
    throw Object.assign(new Error('The mentor could not load this question safely. Please retry.'), {status: 503, cause: err});
  }

  const quiz = await AIQuiz.findByPk(attempt.quizId, {
    attributes: ['id', 'aiAssistantEnabled', 'aiHelpLimit'],
  });

  const enabled = quiz?.aiAssistantEnabled !== false;
  if (!enabled) throw Object.assign(new Error('AI mentor is disabled for this quiz'), { status: 400 });

  const configured = quiz?.aiHelpLimit != null ? Number(quiz.aiHelpLimit) : 0;
  const limit = configured === 0 ? DEFAULT_AI_MENTOR_LIMIT : configured;
  const unlimited = limit === -1;

  if (attempt.aiHelpUsage >= limit && !unlimited) {
    const err = new Error('You have used your AI mentor help limit for this attempt.');
    err.status = 429;
    err.code = 'AI_HELP_LIMIT_REACHED';
    err.remaining = 0;
    throw err;
  }

  const history = await loadQuizHistory({ attemptId, questionId, participantId });

  // Do not hold an attempt row lock while waiting on an external AI provider.
  // Submission and another tab must remain responsive; recheck below on save.
  const assist = await callQuizAssist({
    questionText: questionRow?.questionText || '',
    questionType: questionRow?.questionType || 'MCQ',
    options: Array.isArray(questionRow?.options) ? questionRow.options : [],
    question: String(question || '').slice(0, 4000), history, answerStrings,
  });

  const result = await sequelize.transaction(async (t) => {
    const lockedAttempt = await QuizAttempt.findOne({
      where: { id: attemptId, participantId, status: 'IN_PROGRESS' },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!lockedAttempt) throw Object.assign(new Error('Attempt not found or already submitted'), { status: 404 });

    if (lockedAttempt.aiHelpUsage >= limit && !unlimited) {
      const err = new Error('You have used your AI mentor help limit for this attempt.');
      err.status = 429;
      err.code = 'AI_HELP_LIMIT_REACHED';
      err.remaining = 0;
      throw err;
    }

    const safeCoachingText = assist.text;
    const possibleLeak = Boolean(assist.possibleLeak);

    const nextUsage = (Number(lockedAttempt.aiHelpUsage) || 0) + 1;
    await lockedAttempt.update({ aiHelpUsage: nextUsage }, { transaction: t });

    if (safeCoachingText) {
      await QuizAiHelp.create({
        attemptId,
        questionId,
        participantId,
        prompt: String(question || '').slice(0, 8000),
        response: String(safeCoachingText).slice(0, 20000),
        questionText: questionRow?.questionText ? String(questionRow.questionText).slice(0, 10000) : null,
        usageNumber: nextUsage,
        possibleLeakDetected: possibleLeak,
        leakReasons: possibleLeak ? assist.reasons.join(',').slice(0, 500) : null,
      }, { transaction: t });
    }

    if (possibleLeak) {
      logger.warn('[QuizAiAssistant] Leak guard triggered on served exchange', {
        participantId,
        questionId,
        attemptId,
        usageNumber: nextUsage,
        reasons: assist.reasons,
      });
    }

    return { text: safeCoachingText, used: nextUsage, possibleLeak, provider: assist.tier };
  });

  const remaining = unlimited ? -1 : Math.max(0, limit - result.used);
  return {
    response: result.text,
    provider: result.provider,
    used: result.used,
    limit,
    unlimited,
    remaining,
    enabled,
    possibleLeakDetected: Boolean(result.possibleLeak),
  };
}

/**
 * Returns the current AI mentor status for an attempt.
 */
async function getQuizStatus({ attemptId, participantId }) {
  const { QuizAttempt, AIQuiz } = require('../models');

  const attempt = await QuizAttempt.findOne({ where: { id: attemptId, participantId, status: 'IN_PROGRESS' } });
  if (!attempt) return { enabled: false, used: 0, remaining: 0, unlimited: false };

  const quiz = await AIQuiz.findByPk(attempt.quizId, {
    attributes: ['id', 'aiAssistantEnabled', 'aiHelpLimit'],
  });
  const enabled = quiz?.aiAssistantEnabled !== false;
  const configured = quiz?.aiHelpLimit != null ? Number(quiz.aiHelpLimit) : 0;
  const limit = enabled && configured === 0 ? DEFAULT_AI_MENTOR_LIMIT : configured;
  const unlimited = enabled && limit === -1;
  const used = Number(attempt.aiHelpUsage) || 0;

  return {
    enabled,
    used,
    limit,
    unlimited,
    remaining: enabled ? (unlimited ? -1 : Math.max(0, limit - used)) : 0,
  };
}

module.exports = {
  grantQuizAssist,
  getQuizStatus,
  sanitiseQuizAiResponse,
  buildQuizSystemPrompt,
  callQuizAssist,
  DEFAULT_AI_MENTOR_LIMIT,
};
