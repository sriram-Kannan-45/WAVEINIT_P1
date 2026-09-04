/**
 * verify-attempt-draft-storage
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression check for the client half of the answer pre-fill fix (Issue 3):
 * a saved draft must only ever be restored into the attempt that wrote it.
 *
 * Run with:   node scripts/verify-attempt-draft-storage.js
 *
 * Deliberately a plain Node script rather than a test-runner suite: the frontend
 * has no test runner configured, and adding one is out of scope for this fix.
 * `frontend/package.json` sets "type": "module", so Node imports the module under
 * test natively — no transform, no new dependency.
 *
 * Exit code 0 = all checks passed; 1 = at least one failed.
 */

import {
  DRAFT_MAX_AGE_MS,
  buildAttemptScope,
  attemptStorageKey,
  readAttemptDraft,
  writeAttemptDraft,
  clearAttemptDraft,
  purgeStaleAttemptDrafts,
} from '../src/utils/attemptDraftStorage.js'

/** Minimal in-memory stand-in for Web Storage (same surface the module uses). */
class MemStore {
  constructor() { this.m = new Map() }
  get length() { return this.m.size }
  key(i) { return [...this.m.keys()][i] ?? null }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
}

let passed = 0
let failed = 0

function group(name) { console.log(`\n${name}`) }

function check(name, fn) {
  try {
    fn()
    console.log(`  ok   ${name}`)
    passed++
  } catch (e) {
    console.log(`  FAIL ${name}\n         ${e.message}`)
    failed++
  }
}

function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${label} expected ${b}, got ${a}`)
}

/** The reference attempt, matching the shape of a real coding attempt URL. */
const SESSION_TOKEN = '2ca0a19f-4d1e-4c33-9a77-0f2b6c5d81aa'
const scope = (overrides = {}) => buildAttemptScope({
  kind: 'coding',
  userId: 7,
  attemptId: 28,
  sessionToken: SESSION_TOKEN,
  problemIds: [134, 135],
  ...overrides,
})

// ── The session token is a credential and must not be persisted ──────────────

group('key and payload hygiene')

check('the storage key carries no session token in cleartext', () => {
  const key = attemptStorageKey(scope())
  if (key.includes(SESSION_TOKEN.slice(0, 8))) throw new Error(`token leaked into key: ${key}`)
  if (!/^coding_draft_u7_a28_s[0-9a-f]{8}$/.test(key)) throw new Error(`unexpected key shape: ${key}`)
})

check('the stored payload carries no session token in cleartext', () => {
  const store = new MemStore()
  writeAttemptDraft(scope(), { code: 'x' }, { store })
  const raw = store.getItem(attemptStorageKey(scope()))
  if (raw.includes(SESSION_TOKEN.slice(0, 8))) throw new Error('token leaked into payload')
})

// ── Normal operation ─────────────────────────────────────────────────────────

group('round trip')

check('an attempt reads back its own draft', () => {
  const store = new MemStore()
  writeAttemptDraft(scope(), { code: 'mine' }, { store })
  eq(readAttemptDraft(scope(), { store }), { data: { code: 'mine' }, rejected: null })
})

check('a draft written before the problem list loaded is still readable after', () => {
  const store = new MemStore()
  writeAttemptDraft(scope({ problemIds: undefined }), { code: 'early' }, { store })
  eq(readAttemptDraft(scope(), { store }).data, { code: 'early' })
})

check('the problem-set digest is order independent but value sensitive', () => {
  eq(buildAttemptScope({ problemIds: [135, 134] }).problems, buildAttemptScope({ problemIds: [134, 135] }).problems)
  if (buildAttemptScope({ problemIds: [134] }).problems === buildAttemptScope({ problemIds: [134, 135] }).problems) {
    throw new Error('digest ignored a changed problem set')
  }
})

// ── Every collision the audit called out must fail closed ────────────────────

group('collisions fail closed (nothing is pre-filled)')

const COLLISIONS = {
  'a second participant on a shared browser': { userId: 8 },
  'a different attempt id': { attemptId: 29 },
  'a re-issued session token': { sessionToken: 'ffffffff-0000-0000-0000-000000000000' },
  'a reset attempt with a new problem set': { problemIds: [900] },
}

for (const [label, override] of Object.entries(COLLISIONS)) {
  check(`${label} restores nothing`, () => {
    const store = new MemStore()
    writeAttemptDraft(scope(), { code: "someone else's answer" }, { store })
    const res = readAttemptDraft(scope(override), { store })
    if (res.data !== null) throw new Error(`draft leaked across scopes: ${JSON.stringify(res)}`)
  })
}

check('two participants on one browser keep their own drafts', () => {
  const store = new MemStore()
  writeAttemptDraft(scope(), { code: 'mine' }, { store })
  writeAttemptDraft(scope({ userId: 8 }), { code: 'theirs' }, { store })
  eq(readAttemptDraft(scope(), { store }).data, { code: 'mine' })
  eq(readAttemptDraft(scope({ userId: 8 }), { store }).data, { code: 'theirs' })
})

group('rejected entries are deleted, never re-served')

check('a scope mismatch under this exact key is reported and removed', () => {
  const store = new MemStore()
  const key = attemptStorageKey(scope())
  store.setItem(key, JSON.stringify({ scope: scope({ attemptId: 999 }), savedAt: Date.now(), data: { code: 'stale' } }))
  eq(readAttemptDraft(scope(), { store }), { data: null, rejected: 'scope_mismatch' })
  if (store.getItem(key) !== null) throw new Error('the offending entry survived')
})

check('an unparseable entry is reported and removed', () => {
  const store = new MemStore()
  store.setItem(attemptStorageKey(scope()), '{not json')
  eq(readAttemptDraft(scope(), { store }), { data: null, rejected: 'unparseable' })
  if (store.length !== 0) throw new Error('the offending entry survived')
})

check('an expired entry is reported and removed', () => {
  const store = new MemStore()
  store.setItem(attemptStorageKey(scope()), JSON.stringify({
    scope: scope(), savedAt: Date.now() - DRAFT_MAX_AGE_MS - 1000, data: { code: 'old' },
  }))
  eq(readAttemptDraft(scope(), { store }), { data: null, rejected: 'expired' })
  if (store.length !== 0) throw new Error('the offending entry survived')
})

// ── Lifecycle ────────────────────────────────────────────────────────────────

group('lifecycle')

check('clearing on submit removes exactly this attempt', () => {
  const store = new MemStore()
  writeAttemptDraft(scope(), { code: 'mine' }, { store })
  writeAttemptDraft(scope({ attemptId: 99 }), { code: 'other' }, { store })
  clearAttemptDraft(scope(), { store })
  if (readAttemptDraft(scope(), { store }).data !== null) throw new Error('draft was not cleared')
  eq(readAttemptDraft(scope({ attemptId: 99 }), { store }).data, { code: 'other' })
})

check('purge drops aged-out and corrupt entries only', () => {
  const store = new MemStore()
  writeAttemptDraft(scope(), { code: 'mine' }, { store })                     // keep: current
  writeAttemptDraft(scope({ attemptId: 99 }), { code: 'live other' }, { store }) // keep: someone's live work
  store.setItem('coding_draft_u9_a55_sdeadbeef', JSON.stringify({             // drop: aged out
    scope: scope({ userId: 9 }), savedAt: Date.now() - DRAFT_MAX_AGE_MS - 1, data: {},
  }))
  store.setItem('coding_draft_u9_a56_sdeadbeef', 'garbage')                   // drop: unreadable
  store.setItem('quiz_draft_u9_a57_sdeadbeef', 'garbage')                     // keep: other namespace

  eq(purgeStaleAttemptDrafts(scope(), { store }), 2, 'purged count')
  eq(readAttemptDraft(scope(), { store }).data, { code: 'mine' })
  eq(readAttemptDraft(scope({ attemptId: 99 }), { store }).data, { code: 'live other' })
  if (store.getItem('quiz_draft_u9_a57_sdeadbeef') === null) throw new Error('purge crossed namespaces')
})

check('the quiz and coding namespaces never collide', () => {
  const store = new MemStore()
  const coding = buildAttemptScope({ kind: 'coding', userId: 7, attemptId: 28, sessionToken: 't' })
  const quiz = buildAttemptScope({ kind: 'quiz', userId: 7, attemptId: 28, sessionToken: 't' })
  writeAttemptDraft(coding, { code: 'code' }, { store })
  writeAttemptDraft(quiz, { answers: { 1: 'A' } }, { store })
  eq(readAttemptDraft(coding, { store }).data, { code: 'code' })
  eq(readAttemptDraft(quiz, { store }).data, { answers: { 1: 'A' } })
})

check('a missing store or missing attempt id is a safe no-op', () => {
  eq(readAttemptDraft(scope(), { store: null }), { data: null, rejected: null })
  eq(readAttemptDraft(buildAttemptScope({ kind: 'coding' }), { store: new MemStore() }), { data: null, rejected: null })
  eq(writeAttemptDraft(buildAttemptScope({ kind: 'coding' }), {}, { store: new MemStore() }), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
