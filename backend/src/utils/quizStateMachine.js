/**
 * Quiz State Machine
 * ─────────────────────────────────────────────────────────────────────────
 * Enforces valid lifecycle transitions for the AIQuiz model:
 *
 *   DRAFT → PUBLISHED
 *   PUBLISHED → CLOSED
 *   CLOSED → RESULTS_PUBLISHED
 *   RESULTS_PUBLISHED → ARCHIVED
 *   PUBLISHED → DRAFT  (only if zero attempts exist — "unpublish")
 */

const TRANSITIONS = {
  DRAFT:             new Set(['PUBLISHED']),
  PUBLISHED:         new Set(['CLOSED', 'DRAFT']),
  CLOSED:            new Set(['RESULTS_PUBLISHED']),
  RESULTS_PUBLISHED: new Set(['ARCHIVED']),
  ARCHIVED:          new Set(),
};

const VALID_STATES = new Set(Object.keys(TRANSITIONS));

function isKnownState(state) {
  return VALID_STATES.has(state);
}

function canTransition(fromState, toState) {
  if (!isKnownState(fromState)) return false;
  if (!isKnownState(toState)) return false;
  return TRANSITIONS[fromState].has(toState);
}

function assertTransition(quiz, toState, extraMsg) {
  const fromState = quiz.status;
  if (!canTransition(fromState, toState)) {
    throw new Error(
      extraMsg
        ? `Invalid state transition: ${fromState} → ${toState} (${extraMsg})`
        : `Invalid state transition: ${fromState} → ${toState}`
    );
  }
}

/**
 * Return the effective "is result visible?" flag for a quiz.
 * Participants can see results when status=RESULTS_PUBLISHED
 * OR when showResultImmediately=true (allows bypassing trainer release).
 */
function areResultsVisible(quiz) {
  if (!quiz) return false;
  return quiz.status === 'RESULTS_PUBLISHED' || quiz.showResultImmediately === true;
}

module.exports = {
  TRANSITIONS,
  VALID_STATES,
  isKnownState,
  canTransition,
  assertTransition,
  areResultsVisible,
};
