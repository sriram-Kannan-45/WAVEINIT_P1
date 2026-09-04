'use strict';

/**
 * starterCodeIntegrity
 * ─────────────────────────────────────────────────────────────────────────────
 * Serve-time guard against the reference solution reaching a participant as the
 * *initial* content of their editor or answer field ("answer pre-filled in the
 * test").
 *
 * Why a serve-time guard rather than a fix at the writer:
 *   The starter template and the reference solution are generated together — the
 *   AI problem generator is asked for one JSON object containing both keys — and
 *   they are edited by trainers through several admin surfaces. Any one of those
 *   writers can put solution text in the starter column. Rather than chase every
 *   writer forever, every read path that ships a starter template to a
 *   participant passes through here first, so a polluted row can never be
 *   *served* even if it does get stored.
 *
 * Two deliberately different behaviours, because the fix requirement conflates
 * two surfaces that must not be treated alike:
 *
 *   1. The problem definition's starter template — nobody's work. If it matches
 *      the reference solution, that is a data-integrity bug: replace it with the
 *      clean per-language skeleton (default) or refuse to serve the attempt
 *      (PREFILL_ON_LEAK=block), and raise a CRITICAL alert either way.
 *
 *   2. A participant's own saved submission code — their work. A genuinely
 *      correct solution legitimately converges on the reference text, so a high
 *      score here is a *cheating signal to record*, never a pre-fill bug to
 *      overwrite. checkSubmittedCode() therefore reports and never mutates.
 *
 * Scoring reuses aiAnswerGuard's similarity primitives so that "how close is
 * this to the answer key" means exactly one thing across the codebase.
 */

const {
  similarity,
  structuralSimilarity,
  normaliseCode,
} = require('./aiAnswerGuard');
const { getDefaultStarterCode, getDefaultReferenceSolution } = require('../utils/languageTemplates');
const logger = require('../utils/logger');

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Tunables, all overridable per deployment without a code change. */
const INTEGRITY_CONFIG = {
  // Jaccard similarity (0-1) between served starter and stored reference at
  // which the starter is treated as the solution. Same 0.62 default as the AI
  // mentor guard so the two cannot disagree about what "close" means.
  similarityThreshold: num(process.env.PREFILL_SIMILARITY_THRESHOLD, 0.62),
  // Identifier-blind threshold, so renaming every variable in a pasted solution
  // does not sneak it past. Higher default: collapsing names raises all scores.
  structuralThreshold: num(process.env.PREFILL_STRUCTURAL_THRESHOLD, 0.72),
  // Below this many normalised characters a starter is a bare skeleton; scoring
  // two tiny strings is noise, so only exact equality counts.
  minComparableChars: num(process.env.PREFILL_MIN_COMPARABLE_CHARS, 24),
  // 'sanitise' (default) → serve the clean template and alert.
  // 'block'              → refuse the whole response and alert.
  // Sanitise is the default because a trainer's data-entry mistake should not
  // deny a participant their exam; both modes always alert.
  onLeak: String(process.env.PREFILL_ON_LEAK || 'sanitise').toLowerCase(),
};

/**
 * Is the reference solution's whole body present inside the starter?
 * Catches "skeleton + pasted solution + trailing scaffolding", where the extra
 * text can drag a Jaccard score below the threshold.
 */
function contains(starterNorm, referenceNorm) {
  if (!referenceNorm || referenceNorm.length < INTEGRITY_CONFIG.minComparableChars) return false;
  return starterNorm.includes(referenceNorm);
}

/**
 * Compares one starter template against one reference solution.
 *
 * @returns {{leak:boolean, exact:boolean, contained:boolean, similarity:number,
 *            structural:number, reason:string|null}}
 */
function checkStarterCode({ starterCode, referenceSolution } = {}) {
  const empty = {
    leak: false, exact: false, contained: false,
    similarity: 0, structural: 0, reason: null,
  };

  const starter = String(starterCode || '');
  const reference = String(referenceSolution || '');
  if (!starter.trim() || !reference.trim()) return empty;

  const a = normaliseCode(starter);
  const b = normaliseCode(reference);
  if (!a || !b) return empty;

  if (a === b) {
    return {
      leak: true, exact: true, contained: true,
      similarity: 1, structural: 1,
      reason: 'starter_equals_reference',
    };
  }

  // Two skeletons differing only in whitespace are not evidence of anything.
  if (a.length < INTEGRITY_CONFIG.minComparableChars) return empty;

  if (contains(a, b)) {
    return {
      leak: true, exact: false, contained: true,
      similarity: 1, structural: 1,
      reason: 'starter_contains_reference',
    };
  }

  const plain = similarity(starter, reference);
  const structural = structuralSimilarity(starter, reference);

  // Jaccard divides by the union, so a small skeleton fully inside a much
  // larger solution scores low — which is correct. Only near-equal bodies trip.
  let reason = null;
  if (plain >= INTEGRITY_CONFIG.similarityThreshold) reason = 'starter_similar_to_reference';
  else if (structural >= INTEGRITY_CONFIG.structuralThreshold) reason = 'starter_structurally_matches_reference';

  return {
    leak: Boolean(reason),
    exact: false,
    contained: false,
    similarity: Math.round(plain * 1000) / 1000,
    structural: Math.round(structural * 1000) / 1000,
    reason,
  };
}

/**
 * Scores a participant's saved code against the reference solution. Reports
 * only — see the module header for why this must never rewrite their work.
 *
 * @returns {{suspicious:boolean, similarity:number, structural:number, reason:string|null}}
 */
function checkSubmittedCode({ code, referenceSolution } = {}) {
  const res = checkStarterCode({ starterCode: code, referenceSolution });
  return {
    suspicious: res.leak,
    similarity: res.similarity,
    structural: res.structural,
    reason: res.leak ? (res.exact ? 'submission_equals_reference' : 'submission_similar_to_reference') : null,
  };
}

/** Thrown when INTEGRITY_CONFIG.onLeak === 'block'. Carries an HTTP status. */
class StarterCodeIntegrityError extends Error {
  constructor(leaks) {
    super('Assessment content failed an integrity check and was not served.');
    this.name = 'StarterCodeIntegrityError';
    this.status = 409;
    this.code = 'STARTER_CODE_INTEGRITY';
    this.leaks = leaks;
  }
}

/**
 * Every place a reference solution can live on a problem row, across the three
 * storage generations (per-language rows, the `languageSolutions` JSON blob, and
 * the legacy scalar columns). A starter is compared against all of them, not
 * just its own language's, because a copy-paste mistake in the admin UI can put
 * the Python answer in the JavaScript starter.
 *
 * Un-filled placeholder references are dropped (see dropTemplateReferences):
 * they contain no answer, so nothing can leak from them, and in C/C++ the
 * placeholder reference differs from the placeholder starter only by a comment —
 * which normalisation strips — so keeping them would flag every such row.
 */
function collectReferenceSolutions(problem = {}) {
  const out = [];
  const push = (v) => {
    if (v != null && String(v).trim()) out.push(String(v));
  };

  push(problem.referenceSolution);
  push(problem.expectedSolution);
  push(problem.solution);

  if (Array.isArray(problem.languages)) {
    problem.languages.forEach((row) => push(row?.referenceSolution));
  }
  if (problem.languageSolutions && typeof problem.languageSolutions === 'object') {
    Object.values(problem.languageSolutions).forEach((sol) => push(sol?.referenceSolution));
  }
  return dropTemplateReferences(problem, out);
}

/** Every language name the problem mentions, in any storage generation. */
function problemLanguages(problem = {}) {
  const langs = new Set();
  if (problem.programmingLanguage) langs.add(String(problem.programmingLanguage).toLowerCase());
  if (Array.isArray(problem.languages)) {
    problem.languages.forEach((row) => {
      if (row?.language) langs.add(String(row.language).toLowerCase());
    });
  }
  if (problem.languageSolutions && typeof problem.languageSolutions === 'object') {
    Object.keys(problem.languageSolutions).forEach((l) => langs.add(String(l).toLowerCase()));
  }
  if (langs.size === 0) langs.add('javascript');
  return [...langs];
}

/**
 * Removes references that are still the generator's un-filled placeholder.
 * Matched by exact normalised equality against the shipped templates rather than
 * by keyword, so a real solution that merely quotes "not implemented" in a
 * string or comment is never mistaken for a placeholder.
 */
function dropTemplateReferences(problem, references) {
  if (references.length === 0) return references;
  const ctx = templateContext(problem);
  const templates = new Set();
  problemLanguages(problem).forEach((lang) => {
    templates.add(normaliseCode(getDefaultStarterCode(lang, ctx)));
    templates.add(normaliseCode(getDefaultReferenceSolution(lang, ctx)));
  });
  return references.filter((r) => !templates.has(normaliseCode(r)));
}

/** Worst-case check of one starter against several candidate references. */
function checkAgainstAll(starterCode, references) {
  let worst = checkStarterCode({ starterCode, referenceSolution: null });
  for (const reference of references) {
    const res = checkStarterCode({ starterCode, referenceSolution: reference });
    if (res.leak) return res;
    if (res.similarity > worst.similarity || res.structural > worst.structural) worst = res;
  }
  return worst;
}

/** Context object getDefaultStarterCode uses to shape the clean skeleton. */
function templateContext(problem = {}) {
  return {
    title: problem.title,
    description: problem.description,
    sampleOutput: problem.sampleOutput,
    testCases: problem.testCases,
  };
}

/** Trainer-only keys that must never reach a participant. */
const TRAINER_ONLY_LANGUAGE_KEYS = [
  'referenceSolution',
  'starterCodeSource',
  'referenceSolutionSource',
  'generationStatus',
];

/**
 * The one entry point read paths use before shipping a coding problem to a
 * participant. Cleans the legacy scalar `starterCode` and every per-language
 * row, strips trainer-only fields, alerts on anything it had to replace, and
 * (in block mode) refuses to serve at all.
 *
 * @param {object}   args.problem    raw problem JSON, reference fields still present
 * @param {Array}    [args.languages] rows from getProblemLanguages({includeReference:true})
 * @param {object}   [args.context]  ids for the alert (participantId, attemptId, ...)
 * @returns {{starterCode:(string|undefined), languages:(Array|null), leaks:Array}}
 */
function sanitiseServedProblem({ problem = {}, languages = null, context = {} } = {}) {
  const references = collectReferenceSolutions(problem);
  const ctx = templateContext(problem);
  const leaks = [];

  const record = (where, language, res) => {
    leaks.push({
      problemId: problem.id ?? null,
      where,
      language: language || null,
      reason: res.reason,
      similarity: res.similarity,
      structural: res.structural,
    });
    logger.error('[StarterCodeIntegrity] Starter template matched the reference solution — replaced before serving', {
      ...context,
      problemId: problem.id ?? null,
      where,
      language: language || null,
      reason: res.reason,
      similarity: res.similarity,
      structural: res.structural,
      mode: INTEGRITY_CONFIG.onLeak,
    });
  };

  // ── Legacy scalar column (the frontend's last-resort starter fallback) ──
  let starterCode = problem.starterCode;
  const legacyLanguage = String(
    problem.programmingLanguage || languages?.[0]?.language || 'javascript',
  ).toLowerCase();

  if (starterCode != null && String(starterCode).trim() && references.length > 0) {
    const res = checkAgainstAll(starterCode, references);
    if (res.leak) {
      record('problem.starterCode', legacyLanguage, res);
      starterCode = getDefaultStarterCode(legacyLanguage, ctx);
    }
  }

  // ── Per-language rows ──
  let cleanRows = null;
  if (Array.isArray(languages)) {
    cleanRows = languages.map((row) => {
      const language = String(row?.language || legacyLanguage).toLowerCase();
      // The row's own reference first, so the reported reason names the real
      // pair. `references` is already placeholder-filtered, so membership in it
      // is also the test for whether this row's reference is a real answer.
      const ownReference = references.includes(row?.referenceSolution) ? row.referenceSolution : null;
      const candidates = ownReference
        ? [ownReference, ...references.filter((r) => r !== ownReference)]
        : references;

      let starter = row?.starterCode;
      if (starter != null && String(starter).trim() && candidates.length > 0) {
        const res = checkAgainstAll(starter, candidates);
        if (res.leak) {
          record(`languages[${language}].starterCode`, language, res);
          starter = getDefaultStarterCode(language, ctx);
        }
      }

      const out = { ...row, language, starterCode: starter };
      TRAINER_ONLY_LANGUAGE_KEYS.forEach((k) => { delete out[k]; });
      return out;
    });
  }

  if (leaks.length > 0 && INTEGRITY_CONFIG.onLeak === 'block') {
    throw new StarterCodeIntegrityError(leaks);
  }

  return { starterCode, languages: cleanRows, leaks };
}

/**
 * Scores a participant's own saved code against the answer key and logs a hit.
 * The key is collected inside this module and never returned, so a caller can
 * ask "does this look copied?" without ever holding the solution.
 *
 * Reports only — see the module header. A correct solution legitimately
 * converges on the reference text, so this is a review signal, not a leak fix.
 */
function auditSavedCode({ problem = {}, code, context = {} } = {}) {
  if (!code || !String(code).trim()) {
    return { suspicious: false, similarity: 0, structural: 0, reason: null };
  }
  const references = collectReferenceSolutions(problem);
  if (references.length === 0) {
    return { suspicious: false, similarity: 0, structural: 0, reason: null };
  }

  const res = checkAgainstAll(code, references);
  if (!res.leak) {
    return { suspicious: false, similarity: res.similarity, structural: res.structural, reason: null };
  }

  const reason = res.exact ? 'submission_equals_reference' : 'submission_similar_to_reference';
  logger.warn('[StarterCodeIntegrity] Saved submission closely matches the reference solution — flagged for review, served unchanged', {
    ...context,
    problemId: problem.id ?? null,
    reason,
    similarity: res.similarity,
    structural: res.structural,
  });
  return { suspicious: true, similarity: res.similarity, structural: res.structural, reason };
}

/**
 * Answer-bearing fields on a quiz question. A live exam payload must carry none
 * of them; `explanation` is included because for a quiz it usually *is* the
 * answer worked through. (Review/results payloads do not go through here.)
 */
const QUIZ_ANSWER_KEYS = [
  'correctAnswer',
  'correctOption',
  'correctOptionIndex',
  'acceptableAnswers',
  'answerKey',
  'solution',
  'explanation',
];

/**
 * Assertion for the quiz analogue of a pre-filled editor: a question served
 * during a live attempt must not carry the answer key.
 *
 * @returns {{leak:boolean, keys:string[]}}
 */
function checkServedQuestion(question = {}) {
  const keys = QUIZ_ANSWER_KEYS.filter((k) => {
    const v = question?.[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).trim() !== '';
  });
  return { leak: keys.length > 0, keys };
}

/**
 * Same idea for the answer side: a freshly created attempt must come back with
 * nothing selected or typed. Anything present means state from another attempt
 * (or seed data) reached the participant.
 *
 * @returns {{leak:boolean, offenders:Array<{questionId:*, field:string}>}}
 */
function checkInitialAnswers(answers = []) {
  const offenders = [];
  (Array.isArray(answers) ? answers : []).forEach((a) => {
    if (a?.selectedOption != null && String(a.selectedOption).trim() !== '') {
      offenders.push({ questionId: a.questionId ?? null, field: 'selectedOption' });
    }
    if (a?.answerText != null && String(a.answerText).trim() !== '') {
      offenders.push({ questionId: a.questionId ?? null, field: 'answerText' });
    }
  });
  return { leak: offenders.length > 0, offenders };
}

/**
 * Guards a live quiz payload. Questions are asserted rather than rewritten: the
 * read paths already whitelist their fields, so a hit here means a regression
 * introduced upstream and the loud log is the point.
 */
function assertQuizPayloadClean({ questions = [], context = {} } = {}) {
  const leaks = [];
  (Array.isArray(questions) ? questions : []).forEach((q) => {
    const res = checkServedQuestion(q);
    if (res.leak) {
      leaks.push({ questionId: q?.id ?? null, keys: res.keys });
      logger.error('[StarterCodeIntegrity] Quiz question carried answer-key fields into a live attempt', {
        ...context,
        questionId: q?.id ?? null,
        keys: res.keys,
      });
    }
  });

  if (leaks.length > 0 && INTEGRITY_CONFIG.onLeak === 'block') {
    throw new StarterCodeIntegrityError(leaks);
  }
  return { leaks };
}

module.exports = {
  INTEGRITY_CONFIG,
  StarterCodeIntegrityError,
  QUIZ_ANSWER_KEYS,
  TRAINER_ONLY_LANGUAGE_KEYS,
  checkStarterCode,
  checkSubmittedCode,
  collectReferenceSolutions,
  sanitiseServedProblem,
  auditSavedCode,
  checkServedQuestion,
  checkInitialAnswers,
  assertQuizPayloadClean,
};
