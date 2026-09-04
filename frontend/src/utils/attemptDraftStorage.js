/**
 * attemptDraftStorage
 * ─────────────────────────────────────────────────────────────────────────────
 * Composite-key storage for assessment drafts (Issue 3).
 *
 * A draft is only ever readable by the exact attempt that wrote it. The key is
 * scoped by user + attempt + session, and the payload additionally carries the
 * scope it was written under, which is re-verified on read. The key alone would
 * be enough in normal operation; the embedded scope is what makes a *collision*
 * — a reused attempt id after a reset, a shared kiosk browser, a stale entry
 * from a previous session — fail closed instead of pre-filling someone else's
 * answers into the editor.
 *
 * The session token is never written into a key or a payload in cleartext: keys
 * are visible to anything running on the origin, and the token is a credential.
 * Only a short digest of it is stored, which is all that is needed to tell "same
 * session" from "different session".
 *
 * Anything that fails verification is deleted rather than returned, so a bad
 * entry cannot keep resurfacing.
 */

/** Milliseconds a draft stays valid. Past this it is treated as expired. */
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12h — longer than any assessment

/**
 * FNV-1a, 32-bit, hex. Not a security primitive: it exists so that "which
 * session wrote this" can be compared without persisting the session token.
 */
export function fingerprint(value) {
  const s = value == null ? '' : String(value)
  if (!s) return 'none'
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Stable, order-independent digest of the problem/question ids in the attempt. */
function idsFingerprint(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 'any'
  return fingerprint([...ids].map(String).sort().join(','))
}

/**
 * Builds the full scope a draft is bound to.
 *
 * @param {object} args
 * @param {string} args.kind          'coding' | 'quiz' — separate namespaces
 * @param {string|number} args.userId
 * @param {string|number} args.attemptId
 * @param {string} [args.sessionToken]
 * @param {Array}  [args.problemIds]  problem/question ids in this attempt
 */
export function buildAttemptScope({ kind, userId, attemptId, sessionToken, problemIds } = {}) {
  return {
    kind: String(kind || 'coding'),
    userId: userId != null ? String(userId) : '',
    attemptId: attemptId != null ? String(attemptId) : '',
    token: fingerprint(sessionToken),
    problems: idsFingerprint(problemIds),
  }
}

/** The storage key. Contains no credential and no answer content. */
export function attemptStorageKey(scope) {
  const s = scope || {}
  return `${s.kind || 'coding'}_draft_u${s.userId || '0'}_a${s.attemptId || '0'}_s${s.token || 'none'}`
}

/**
 * True when a stored payload was written by this exact user + attempt + session.
 * The problem-set digest is compared only when both sides know it, so a draft
 * written before the problem list loaded is not thrown away needlessly.
 */
function scopeMatches(stored, scope) {
  if (!stored || typeof stored !== 'object') return false
  if (stored.kind !== scope.kind) return false
  if (stored.userId !== scope.userId) return false
  if (stored.attemptId !== scope.attemptId) return false
  if (stored.token !== scope.token) return false
  if (stored.problems !== 'any' && scope.problems !== 'any' && stored.problems !== scope.problems) return false
  return true
}

function safeStore(store) {
  try {
    return store || (typeof window !== 'undefined' ? window.localStorage : null)
  } catch (_) {
    return null
  }
}

/**
 * Reads a draft, or null. Returns null (and removes the entry) if the payload
 * was written under a different scope, is expired, or is unparseable — the
 * editor then falls back to the server's starter template, which is the correct
 * behaviour for every one of those cases.
 *
 * @returns {{data:object|null, rejected:string|null}}
 */
export function readAttemptDraft(scope, { store, maxAgeMs = DRAFT_MAX_AGE_MS } = {}) {
  const s = safeStore(store)
  if (!s || !scope?.attemptId) return { data: null, rejected: null }

  const key = attemptStorageKey(scope)
  let raw = null
  try { raw = s.getItem(key) } catch (_) { return { data: null, rejected: null } }
  if (!raw) return { data: null, rejected: null }

  const drop = (reason) => {
    try { s.removeItem(key) } catch (_) {}
    return { data: null, rejected: reason }
  }

  let parsed
  try { parsed = JSON.parse(raw) } catch (_) { return drop('unparseable') }
  if (!parsed || typeof parsed !== 'object') return drop('unparseable')
  if (!scopeMatches(parsed.scope, scope)) return drop('scope_mismatch')

  const savedAt = Number(parsed.savedAt) || 0
  if (maxAgeMs > 0 && savedAt > 0 && Date.now() - savedAt > maxAgeMs) return drop('expired')

  return { data: parsed.data ?? null, rejected: null }
}

/** Writes a draft, stamped with its scope and time. */
export function writeAttemptDraft(scope, data, { store } = {}) {
  const s = safeStore(store)
  if (!s || !scope?.attemptId) return false
  try {
    s.setItem(attemptStorageKey(scope), JSON.stringify({ scope, savedAt: Date.now(), data }))
    return true
  } catch (_) {
    return false
  }
}

/** Removes this attempt's draft. Called on submission and on timer expiry. */
export function clearAttemptDraft(scope, { store } = {}) {
  const s = safeStore(store)
  if (!s) return
  try { s.removeItem(attemptStorageKey(scope)) } catch (_) {}
}

/**
 * Housekeeping: drops this namespace's drafts that are unreadable or past their
 * max age, bounding storage growth on a shared browser.
 *
 * Deliberately does NOT delete another user's or another attempt's live draft:
 * the scope check on read already makes those unreadable here, and deleting them
 * would destroy unsaved work belonging to whoever wrote them.
 */
export function purgeStaleAttemptDrafts(scope, { store, maxAgeMs = DRAFT_MAX_AGE_MS } = {}) {
  const s = safeStore(store)
  if (!s || !scope?.kind) return 0

  const prefix = `${scope.kind}_draft_`
  const keep = attemptStorageKey(scope)
  const doomed = []

  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (!key || !key.startsWith(prefix) || key === keep) continue

      let stale = true
      try {
        const parsed = JSON.parse(s.getItem(key) || 'null')
        const savedAt = Number(parsed?.savedAt) || 0
        stale = !parsed?.scope || !savedAt || (maxAgeMs > 0 && Date.now() - savedAt > maxAgeMs)
      } catch (_) {
        stale = true
      }
      if (stale) doomed.push(key)
    }
  } catch (_) {
    return 0
  }

  doomed.forEach((key) => { try { s.removeItem(key) } catch (_) {} })
  return doomed.length
}
