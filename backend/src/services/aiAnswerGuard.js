'use strict';

/**
 * aiAnswerGuard
 * ─────────────────────────────────────────────────────────────────────────────
 * Response-level answer-leak guardrails for the assessment AI mentors.
 *
 * This module is deliberately independent of any prompt wording. Prompt rules
 * are advisory — a model can ignore them. Everything here runs AFTER generation
 * and can reject or redact a reply regardless of what the model was told.
 *
 * Two entry points:
 *   checkCodingResponse() — blocks assembled working solutions, and blocks
 *                           replies that are structurally close to the stored
 *                           reference solution (similarity threshold).
 *   checkQuizResponse()   — blocks the correct option's text/value, and blocks
 *                           any option asserted as the answer.
 *
 * Design rule that the whole module exists to serve: the answer key is used
 * ONLY here, for checking output. It is never placed in model context. Callers
 * must load it separately from the data they hand to the prompt builder.
 *
 * Allowed depth (per the approved mentor spec) — these must survive the guard:
 *   "You can use the modulo operator (%)."   "Example: n % 2"
 *   "If the result is 0 -> Even"             "If the result is 1 -> Odd"
 * Blocked — an isolated expression assembled into the answer:
 *   "if (n % 2 === 0) { return 'Even' } else { return 'Odd' }"
 */

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * Tunables. All overridable by environment variable so graders can tighten or
 * relax enforcement per deployment without a code change.
 */
const GUARD_CONFIG = {
  // Jaccard similarity (0-1) against the stored reference solution at which a
  // reply is treated as the solution restated. 0.62 blocks lightly-edited
  // copies while tolerating shared boilerplate like a language's I/O preamble.
  similarityThreshold: num(process.env.AI_LEAK_SIMILARITY_THRESHOLD, 0.62),
  // Identifier-blind similarity threshold, applied only to the code-like lines
  // of a reply. Renaming every variable drops the plain score below 0.62 (a
  // renamed copy of a short solution measures ~0.56), so structure is compared
  // separately with identifiers collapsed. Higher default because collapsing
  // names makes all scores rise.
  structuralSimilarityThreshold: num(process.env.AI_LEAK_STRUCTURAL_THRESHOLD, 0.72),
  // How many consecutive code-like lines a reply may contain before it counts
  // as "assembled code" rather than an isolated illustrative expression.
  maxConsecutiveCodeLines: num(process.env.AI_LEAK_MAX_CODE_LINES, 2),
  // An option string at least this long is uniquely identifying, so quoting it
  // verbatim is treated as pointing at it even without an assertive phrase.
  quizVerbatimMinChars: num(process.env.AI_LEAK_QUIZ_VERBATIM_MIN_CHARS, 12),
};

/** Replacement text used when a segment has to be removed. */
const REDACTION =
  'I have held that part back — work out that step yourself and tell me what you get.';

/**
 * Strips comments and normalises whitespace/identifier casing so that a
 * renamed-variable or re-indented copy of the reference solution still scores
 * as similar. Deliberately keeps operators and keywords: they carry the
 * structure we are trying to compare.
 */
function normaliseCode(src) {
  if (!src || typeof src !== 'string') return '';
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, ' ')
    .replace(/(^|\s)#.*$/gm, ' ')
    .replace(/["'`][^"'`\n]*["'`]/g, '"s"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token stream: identifiers, numbers and operator glyphs. */
function tokenise(src) {
  const norm = normaliseCode(src);
  return norm.match(/[a-z_][a-z0-9_]*|\d+|[^\sa-z0-9_]/g) || [];
}

/** Overlapping token trigrams, used as the similarity feature set. */
function trigrams(tokens) {
  const out = new Set();
  for (let i = 0; i + 2 < tokens.length; i++) {
    out.add(`${tokens[i]}${tokens[i + 1]}${tokens[i + 2]}`);
  }
  return out;
}

/**
 * Jaccard similarity over token trigrams, in [0,1]. Order-insensitive enough to
 * survive reordering, structural enough that prose never scores against code.
 */
function similarity(a, b) {
  const ta = trigrams(tokenise(a));
  const tb = trigrams(tokenise(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/**
 * Words that carry program structure rather than naming. Everything outside this
 * set is treated as an author-chosen identifier and collapsed, so that renaming
 * variables cannot hide a copied solution. Deliberately spans the languages the
 * platform runs (JS, Python, Java, C/C++) — a keyword missing from one language
 * is only ever a slight loss of precision, never a false block, because it just
 * becomes another collapsed identifier on both sides of the comparison.
 */
const STRUCTURAL_KEYWORDS = new Set([
  'function', 'def', 'lambda', 'class', 'struct', 'public', 'private', 'protected',
  'static', 'void', 'int', 'long', 'float', 'double', 'char', 'bool', 'boolean',
  'string', 'str', 'var', 'let', 'const', 'final', 'new', 'this', 'self', 'super',
  'if', 'elif', 'else', 'switch', 'case', 'default', 'for', 'while', 'do', 'break',
  'continue', 'return', 'yield', 'try', 'catch', 'except', 'finally', 'throw', 'raise',
  'in', 'of', 'is', 'not', 'and', 'or', 'true', 'false', 'null', 'none', 'nil',
  'undefined', 'import', 'from', 'export', 'require', 'print', 'println', 'printf',
  'console', 'log', 'system', 'out', 'cout', 'cin', 'endl', 'input', 'scanf', 'len',
  'range', 'main', 'end', 'then', 'fi', 'done', 'elsif', 'unless', 'echo',
]);

/**
 * Token stream with author-chosen names and literal numbers collapsed, leaving
 * only structure: keywords, operators, and placeholders.
 */
function structuralTokens(src) {
  return tokenise(src).map((tok) => {
    if (/^\d+$/.test(tok)) return 'num';
    if (/^[a-z_]/.test(tok)) return STRUCTURAL_KEYWORDS.has(tok) ? tok : 'id';
    return tok;
  });
}

/**
 * The code-like lines of a reply, joined. Prose is dropped so that structural
 * comparison — which collapses words to a single placeholder — can never make an
 * ordinary English paragraph score against a solution.
 */
function extractCodeLines(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => isCodeLine(line))
    .join('\n');
}

/**
 * Identifier-blind similarity. Only meaningful when `a` is code; callers must
 * pass the output of extractCodeLines(), not raw reply text.
 */
function structuralSimilarity(a, b) {
  const ta = trigrams(structuralTokens(a));
  const tb = trigrams(structuralTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/**
 * True when a single line reads as executable code rather than prose.
 *
 * Intentionally does NOT match a bare illustrative expression such as
 * "Example: n % 2" or "n % 2" — naming an operator and showing the expression
 * it produces is the approved maximum mentor depth.
 */
function isCodeLine(line) {
  const t = String(line || '').trim().replace(/^[-*•\d.)\s]+/, '');
  if (!t || t.length < 3) return false;

  // Prose that merely mentions an operator or shows one expression is allowed.
  const wordCount = t.split(/\s+/).length;
  const looksLikeSentence = /^[A-Z][^;{}]*[.:!?]$/.test(t) && !/[;{}]/.test(t);
  if (looksLikeSentence && wordCount > 3) return false;

  return (
    /\b(?:function|def|class|public\s+static|void|const|let|var)\b[^=]*\(/.test(t) ||
    /\b(?:return|yield)\b\s+\S/.test(t) ||
    /\b(?:if|elif|else\s+if|while|for|switch)\b\s*\(?.*[):{]\s*$/.test(t) ||
    /\b(?:console\.log|System\.out\.print(?:ln)?|printf|cout\s*<<)\b/.test(t) ||
    /^\s*print\s*\(/.test(t) ||
    /[;{}]\s*$/.test(t) ||
    /^\s*(?:end|fi|done|\}|\)|\];?)\s*$/.test(t) ||
    /^[A-Za-z_$][\w$]*\s*=\s*[^=]/.test(t)
  );
}

/**
 * Detects a reply that has assembled guidance into a runnable answer:
 * a declaration or conditional paired with a value-producing statement, or a
 * run of code lines longer than the configured allowance.
 */
function findAssembledCode(text) {
  const lines = String(text || '').split('\n');
  let run = 0;
  let longestRun = 0;
  for (const line of lines) {
    run = isCodeLine(line) ? run + 1 : 0;
    if (run > longestRun) longestRun = run;
  }

  const flat = String(text || '');
  const hasFence = /```|~~~/.test(flat);
  const hasBranch = /\b(?:if|switch|case)\b\s*\(?[^\n]*[):{]/.test(flat);
  const hasProducer = /\b(?:return|yield)\b\s+\S|\b(?:console\.log|System\.out\.print(?:ln)?|printf)\b|^\s*print\s*\(/m.test(flat);
  const hasDeclaration = /\b(?:function|def|class|public\s+static|void)\b[^=\n]*\(/.test(flat);

  const reasons = [];
  if (hasFence) reasons.push('fenced_code');
  if (longestRun > GUARD_CONFIG.maxConsecutiveCodeLines) {
    reasons.push(`code_block:${longestRun}_lines`);
  }
  if (hasBranch && hasProducer) reasons.push('branch_with_output');
  if (hasDeclaration && hasProducer) reasons.push('function_body_with_output');
  return reasons;
}

/**
 * Removes fenced blocks and any run of code lines longer than the allowance,
 * while leaving short illustrative snippets in place.
 */
function redactAssembledCode(text) {
  let out = String(text || '');

  // Fenced blocks are always assembled code by intent.
  out = out.replace(/```[\s\S]*?(?:```|$)/g, `\n${REDACTION}\n`);
  out = out.replace(/~~~[\s\S]*?(?:~~~|$)/g, `\n${REDACTION}\n`);

  const lines = out.split('\n');
  const keep = [];
  let buffer = [];

  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length > GUARD_CONFIG.maxConsecutiveCodeLines) keep.push(REDACTION);
    else keep.push(...buffer);
    buffer = [];
  };

  for (const line of lines) {
    if (isCodeLine(line)) buffer.push(line);
    else {
      flush();
      keep.push(line);
    }
  }
  flush();

  return keep
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Guardrail for coding-problem mentor replies.
 *
 * Two similarity passes run against the stored solutions. The plain pass catches
 * a near-verbatim copy; the identifier-blind pass, applied only to the reply's
 * code lines, catches the same solution with every name changed. Either one
 * crossing its threshold rejects the reply outright. Assembled code is also
 * rejected so callers can regenerate instead of serving a partially redacted
 * solution.
 *
 * @param {object}   args
 * @param {string}   args.text                 raw model output
 * @param {string[]} args.referenceSolutions   stored solutions — CHECKING ONLY,
 *                                             never passed to a model
 * @returns {{text: string, possibleLeak: boolean, reasons: string[], blocked: boolean, similarity: number, structuralSimilarity: number}}
 */
function checkCodingResponse({ text, referenceSolutions = [] } = {}) {
  const raw = typeof text === 'string' ? text : '';
  const reasons = findAssembledCode(raw);
  const replyCode = extractCodeLines(raw);

  let best = 0;
  let bestStructural = 0;
  for (const sol of referenceSolutions) {
    if (!sol || typeof sol !== 'string' || sol.trim().length < 20) continue;
    const score = similarity(raw, sol);
    if (score > best) best = score;
    if (replyCode) {
      const structural = structuralSimilarity(replyCode, sol);
      if (structural > bestStructural) bestStructural = structural;
    }
  }

  const plainHit = best >= GUARD_CONFIG.similarityThreshold;
  const structuralHit = bestStructural >= GUARD_CONFIG.structuralSimilarityThreshold;
  if (plainHit) reasons.push(`reference_similarity:${best.toFixed(2)}`);
  if (structuralHit) reasons.push(`reference_structure:${bestStructural.toFixed(2)}`);

  const possibleLeak = reasons.length > 0;
  const blocked = possibleLeak;
  const safe = blocked ? '' : redactAssembledCode(raw);

  return {
    text: safe,
    possibleLeak,
    reasons,
    blocked,
    similarity: best,
    structuralSimilarity: bestStructural,
  };
}

/** Loose normaliser for comparing free-text answers and option labels. */
function normaliseAnswer(v) {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Escapes a string for safe use inside a RegExp. */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Phrases that turn a mention of an option into an assertion that it is the
 * answer. "Option B is worth ruling out" is fine; "Option B is correct" is not.
 */
const ASSERTIVE_FRAMES = [
  /\b(?:the\s+)?(?:correct|right|best|expected)\s+(?:answer|option|choice|value|match)\b/i,
  /\bis\s+(?:the\s+)?(?:correct|right|answer)\b/i,
  /\banswer\s*(?:is|:|=|->|→)/i,
  /\b(?:choose|select|pick|go\s+with|tick|mark)\b/i,
  /(?:->|→|=>)\s*(?:correct|right|answer)\b/i,
];

/**
 * Guardrail for quiz mentor replies.
 *
 * Blocks: the correct answer's text or value in any form; any option asserted as
 * the answer; and verbatim quotation of a long (uniquely identifying) option.
 *
 * Deliberate refinement of "block any response containing an option string":
 * short options such as "Even", "Odd", "True" legitimately appear in conceptual
 * guidance — the approved mentor example says "Think about the property of even
 * and odd numbers" — so a blanket verbatim block would break intended replies.
 * Short options are blocked only when asserted as the answer.
 *
 * @param {object}   args
 * @param {string}   args.text            raw model output
 * @param {string[]} args.options         visible option labels
 * @param {string[]} args.answerStrings   correct answer(s) — CHECKING ONLY,
 *                                        never passed to a model
 */
function checkQuizResponse({ text, options = [], answerStrings = [] } = {}) {
  let out = typeof text === 'string' ? text : '';
  const reasons = [];
  const flatNorm = normaliseAnswer(out);

  // 1. The correct answer itself, in any casing/punctuation, is always a leak.
  for (const ans of answerStrings) {
    const norm = normaliseAnswer(ans);
    if (norm.length < 2) continue;
    if (flatNorm.includes(norm)) {
      reasons.push('correct_answer_verbatim');
      break;
    }
  }

  // 2. Any option named inside an assertive frame.
  const asserts = ASSERTIVE_FRAMES.some((re) => re.test(out));
  if (asserts) {
    for (const opt of options) {
      const norm = normaliseAnswer(opt);
      if (norm.length >= 2 && flatNorm.includes(norm)) {
        reasons.push('option_asserted_as_answer');
        break;
      }
    }
    if (/\b(?:option|choice)\s*[A-Da-d1-9]\b/.test(out) || /\b(?:choose|select|pick)\s+[A-Da-d1-9]\b/.test(out)) {
      reasons.push('option_letter_asserted');
    }
  }

  // 3. Verbatim quotation of a long, uniquely identifying option.
  for (const opt of options) {
    const raw = String(opt ?? '').trim();
    if (normaliseAnswer(raw).length < GUARD_CONFIG.quizVerbatimMinChars) continue;
    if (new RegExp(escapeRe(raw), 'i').test(out)) {
      reasons.push('long_option_verbatim');
      break;
    }
  }

  const possibleLeak = reasons.length > 0;
  if (possibleLeak) out = '';

  return { text: out, possibleLeak, reasons, blocked: possibleLeak };
}

module.exports = {
  GUARD_CONFIG,
  REDACTION,
  STRUCTURAL_KEYWORDS,
  normaliseCode,
  normaliseAnswer,
  tokenise,
  structuralTokens,
  extractCodeLines,
  similarity,
  structuralSimilarity,
  isCodeLine,
  findAssembledCode,
  redactAssembledCode,
  checkCodingResponse,
  checkQuizResponse,
};
