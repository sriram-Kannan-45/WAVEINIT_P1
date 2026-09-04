# Assessment Module — Audit & Fix Report

WAVE INIT LMS, Coding & Quiz Assessment Module. Three issues, each audited before being changed, each
delivered with a root cause, a change list, its new configuration values, and a manual QA checklist.

Verification status for all three: backend Jest **88 / 88 tests passing** across 5 suites; JSX parsed
with the project's own `@babel/parser`; ESLint **0 errors** on every touched file, with fewer warnings
than the pre-change baseline. `vite build` could not be run in this environment — see
[Environment limits](#environment-limits) at the end.

---

## Issue 1 — AI assistant missing from quizzes, and giving answers instead of guidance

### Root cause

Two separate defects, which is why prompt wording alone could not fix it.

The first is that the reference answer was genuinely in the model's context. `buildSystemPrompt` shipped
sample test cases *including their expected outputs*, and the quiz path had the correct option available
in the same object it was building the prompt from. An instruction not to reveal the answer is a request,
not a constraint: once the answer is in context, any sufficiently direct question can surface it.

The second is that nothing inspected the reply. There was no post-generation check at all, so even a
well-behaved prompt had no backstop against the model volunteering a complete solution.

Separately, the quiz assessment UI mounted no assistant widget of any kind — the component existed only
on the coding screen.

### Changes

The answer key no longer travels with the prompt. Expected outputs were removed from the sample test
cases in `buildSystemPrompt` (inputs stay, since they are part of the problem statement). For quizzes,
`grantQuizAssist` fetches `correctAnswer` / `acceptableAnswers` / `pairs` through **its own separate
query**, used only by the guard — the prompt builder never sees them.

`backend/src/services/aiAnswerGuard.js` (new) is the single choke point for response inspection. It runs
two dependency-free passes: an identifier-sensitive token-trigram Jaccard that catches near-verbatim
solutions, and an identifier-blind "structural" Jaccard, run only on code-like lines, that catches the
same solution with every variable renamed. For quizzes it additionally blocks any reply that asserts one
of the exact option strings as the answer.

The enforcement pattern is **guard-per-tier with fallthrough as regeneration**. Each of the three
response tiers runs its own output through the guard; a blocked reply returns `null`, so the next tier is
tried, and Tier 3 (local, rule-based) is safe by construction. A leak can therefore never be the value
actually served — regeneration is structural rather than a retry loop.

Every exchange is logged with `participant_id`, `question_id`, and a `possible_leak_detected` boolean
plus `leak_reasons`, added to `coding_ai_help` and `quiz_ai_help` by migration
`20260903b-add-ai-mentor-leak-flag.js`.

On the frontend, `frontend/src/components/ai-mentor/AiMentorPanel.jsx` (new) is a presentational shell
that owns every string in the approved spec via an exported `MENTOR_COPY`. `CodingAiAssistant.jsx` and
the new `QuizAiAssistant.jsx` are thin compositions over it, injecting only `usageBadge`, `subHeader`,
`intro`, `quickActions` and `noticeRenderer`. Because the copy lives in one place, the two screens
cannot drift apart.

| File | |
|---|---|
| `backend/src/services/aiAnswerGuard.js` | new — similarity guard |
| `backend/src/services/quizAiAssistantService.js` | new — quiz mentor tiers |
| `backend/src/services/codingAiAssistantService.js` | guard wiring, prompt rewrite |
| `backend/src/routes/aiQuizRoutes.js` | quiz mentor endpoints |
| `backend/src/models/quizAiHelp.js`, `models/index.js`, `models/aiQuiz.js`, `models/codingAiHelp.js` | exchange logging + leak flag |
| `backend/database/migrations/20260903-add-quiz-ai-mentor.js`, `20260903b-add-ai-mentor-leak-flag.js` | new |
| `frontend/src/components/ai-mentor/AiMentorPanel.jsx` | new — shared shell |
| `frontend/src/components/QuizAiAssistant.jsx` | new |
| `frontend/src/components/CodingAiAssistant.jsx`, `QuizTaking.jsx`, `styles/quiz-taking.css` | composition + mount |
| `backend/test/ai-answer-guard.test.js` | new — 24 tests |

### Configuration

| Key | Default | Meaning |
|---|---|---|
| `AI_LEAK_SIMILARITY_THRESHOLD` | `0.62` | Token-trigram Jaccard against the stored solution at which a reply is blocked |
| `AI_LEAK_STRUCTURAL_THRESHOLD` | `0.72` | Identifier-blind threshold; higher because collapsing names raises all scores |
| `AI_LEAK_MAX_CODE_LINES` | `2` | Code-like lines allowed in a reply before it is treated as a solution |
| `AI_LEAK_QUIZ_VERBATIM_MIN_CHARS` | `12` | Below this length an option string is only blocked when asserted as the answer |

### Spec-match confirmation

The rebuilt panel matches the approved design on both screens, from a single source of truth:

- Header: title **"AI Mentor"** with a sparkle icon, subtitle **"I will help you understand, not give
  answers."** always visible beneath it, close (X) top-right.
- Participant messages right-aligned in a light green bubble with a timestamp and a sent checkmark
  (`CheckCheck`); mentor replies left-aligned in white bubbles, **split into short paragraphs** by
  `splitIntoParagraphs` rather than one block, each with copy / thumbs-up / thumbs-down beneath.
- Input placeholder **"Ask a doubt... (Mentor only gives hints)"**, paper-plane send button to the right,
  and the persistent muted caption **"AI Mentor never reveals the direct answer."** below it.
- Subtitle and caption are static UI copy, not model output, so the constraint is visible regardless of
  what the server returns.
- Quiz quick actions are exactly the four specified: "Explain this question", "Give me a hint",
  "Explain a term/concept", "Help me eliminate an option" — the last asks for the *criterion* to apply,
  never which option is wrong.

Three points where I made a judgement call you may want to revisit:

1. The spec sentence says quick-action chips "sit above the chat thread as they do today", but in the
   current code they sit *between* the thread and the input. I kept the existing position, treating "as
   they do today" as the binding half of that sentence. Moving them is a one-line change.
2. Thumbs up/down are local acknowledgement only — no mentor-rating endpoint exists, and adding one
   would have gone beyond this fix.
3. A cross-language port of the reference solution is redacted rather than blocked outright, so the
   participant still receives the conceptual part of the reply.

### QA checklist

- [ ] Open a coding attempt. The panel reads "AI Mentor" with the subtitle, the placeholder, and the
      caption; ask a question and confirm the reply arrives as several short paragraphs with copy and
      thumbs icons.
- [ ] Open a quiz attempt. Confirm the panel is present and **identical** in title, subtitle, caption and
      placeholder, with the four quiz quick actions.
- [ ] Ask directly for the answer ("just give me the code", "which option is correct?"). Confirm you get
      guidance, never a working solution or an option name.
- [ ] Ask for maximum allowed depth ("what operator do I need?"). Confirm you *do* get the operator, an
      isolated expression, and what its outputs mean — the guard must not over-block.
- [ ] Paste the reference solution into the editor and ask the mentor to "check my code". Confirm the
      reply does not echo it back as a solution.
- [ ] In the DB, confirm each exchange row has `participant_id`, `question_id`, and
      `possible_leak_detected` set, with `leak_reasons` populated on blocked replies.
- [ ] Confirm hint gating still applies: locked levels stay locked until the unlock condition is met.

---

## Issue 2 — Body-in-box enforced only at calibration

### Root cause

Three things had to be true for continuous enforcement to be impossible, and all three were:

The calibration gate **stopped every camera track** before handing control to the assessment screen, so
there was no stream left to sample. The box geometry existed only as inline constants inside the gate,
so no other component knew where the box was. And the runtime `/laptop/validate` path returns no bounding
box, so even a component that wanted to re-check position had nothing to check against.

The MONITORING indicator was a static label. Leaving frame mid-test was neither detected, logged, nor
visible to reviewers.

### Changes

`frontend/src/proctoring/bodyInBox.js` (new) is now the single definition of "face and torso inside the
box" — `BOX` plus `BodyInBoxDetector`, imported by both calibration and runtime so the geometry can never
disagree between them. `useBodyInBoxMonitor.js` (new) is the IDLE → ACTIVE → WARNING → PAUSED state
machine, with its own off-screen video element and one violation counted per continuous absence rather
than per sample.

Enforcement has exactly **one owner**: `frontend/src/components/monitoring/UnifiedMonitoringWidget.jsx`
mounts the hook, fetches server config, renders the amber countdown warning and the blocking pause
overlay, drives the live MONITORING pill (Active / Warning / Paused), and owns the single
`monitoringClient.setPaused()` effect. Host pages consume `onBodyBoxStateChange` and
`onBodyBoxMaxViolations` only — a second `setPaused` owner would clobber the first. This is what makes
Coding and Quiz behave identically instead of each screen reimplementing the rules.

The consent gate no longer stops the camera; it emits a named payload `{stream, attemptId, quiz,
calibration}` which both attempt pages pass on as `externalWebcamStream`.

Pause accounting is persisted per attempt as `{coding|quiz}_{id}_paused_ms_{attemptId}` in
sessionStorage, alongside the existing `..._test_start_...` stamp, with both reset together. Visible
timers subtract it, so a refresh mid-pause cannot silently eat the participant's remaining time.
`setPaused` also pauses the authoritative server-side timer via `/pause-test` and `/resume-test`.

Events: `BODY_OUT_OF_BOX` (HIGH, score weight 6) per episode, and `BODY_OUT_OF_BOX_LIMIT_REACHED`
(CRITICAL, `flaggedForReview: true`) when the configured limit is hit. Episodes are reported through
`MonitoringEngineClient.reportBodyOutOfBox`, which deliberately bypasses the generic `reportEvent`
helper — that helper drops events while `isPaused` and applies a 12-second per-type cooldown, so an
out-of-box episode would otherwise suppress its own log entry.

| File | |
|---|---|
| `frontend/src/proctoring/bodyInBox.js`, `useBodyInBoxMonitor.js` | new |
| `frontend/src/components/monitoring/UnifiedMonitoringWidget.jsx` | sole enforcement owner |
| `frontend/src/proctoring/engine/MonitoringEngineClient.js` | `reportBodyOutOfBox`, pause plumbing |
| `frontend/src/components/ai-quizzes/AssessmentConsentGate.jsx` | named payload, stops killing the stream |
| `frontend/src/pages/ParticipantCodingAttemptPage.jsx`, `ParticipantQuizAttemptPage.jsx`, `components/QuizTaking.jsx`, `components/ai-quizzes/AIQuizzesDashboard.jsx` | consumers |
| `backend/src/services/monitoringService.js`, `controllers/monitoringController.js`, `routes/monitoringRoutes.js` | config endpoints, event types, episode extension |

### Configuration

Server-side, admin-editable via `PUT /api/monitoring/config` under key `body_in_box`; participants read a
safe subset from `GET /api/monitoring/body-box-config`. Per-`contextType` overrides are supported.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch for continuous enforcement |
| `sample_interval_ms` | `1500` | Detection cadence — 1.5 s, inside the requested 1–2 s band, to bound CPU and battery |
| `grace_seconds` | `5` | Continuous absence before the assessment pauses |
| `resume_stable_ms` | `1200` | Continuous presence required before resuming, so a flicker back into frame does not unpause prematurely |
| `max_violations` | `3` | Episodes before the session is flagged for manual review |
| `auto_submit_on_max` | `false` | Opt-in auto-submit at the limit; **never** fires on a single violation |

Client-side env fallbacks, used only if the server config cannot be fetched:
`VITE_BODY_IN_BOX_SAMPLE_MS` 1500, `VITE_BODY_IN_BOX_GRACE_SECONDS` 5,
`VITE_BODY_IN_BOX_RESUME_STABLE_MS` 1200, `VITE_BODY_IN_BOX_MAX_VIOLATIONS` 3,
`VITE_BODY_IN_BOX_AUTO_SUBMIT` false.

### QA checklist

Run the whole list twice — once on a coding attempt, once on a quiz attempt.

- [ ] Complete calibration and reach the assessment. Confirm the camera is still live and the MONITORING
      pill reads **Active**.
- [ ] Lean out of frame briefly (under 5 s) and return. Confirm the amber "Please stay inside the frame"
      warning with countdown appears, the pill reads **Warning**, and no violation is recorded.
- [ ] Leave frame for more than 5 s. Confirm the blocking overlay "Test paused — body not detected"
      appears, the pill reads **Paused**, the editor / answer inputs are locked, and the timer stops.
- [ ] Return to frame. Confirm resume requires ~1.2 s of stable presence, the overlay clears, and the
      timer resumes **without having lost the paused seconds**.
- [ ] Refresh the page mid-pause. Confirm remaining time is still correct (paused span was credited back).
- [ ] Trigger three episodes. Confirm the session is flagged for review and, with
      `auto_submit_on_max` default `false`, is **not** auto-submitted.
- [ ] Set `auto_submit_on_max: true` and repeat. Confirm auto-submit fires only at the limit.
- [ ] As an admin/reviewer, confirm the proctoring log lists each `BODY_OUT_OF_BOX` episode with its
      timestamp and true duration, plus one `BODY_OUT_OF_BOX_LIMIT_REACHED` at the limit.
- [ ] Set `enabled: false` and confirm the assessment behaves exactly as before this change.

---

## Issue 3 — Answer pre-filled in the participant's test

### Root cause

The audit disconfirmed most of the suspected causes, which is worth recording so they are not
re-investigated: attempt `start` creates a fresh row and never clones a prior attempt;
`codingAssessmentController.getOne` already stripped the solution fields; `getDefaultStarterCode` is
clean; the Reset button writes only starter code; and `dbscript.sql` seeds no solutions.

One surface was live. The editor's initial value derives from `problem.languages[].starterCode`, falling
back to `problem.starterCode` — and **neither read path sanitised that column**. The starter template and
the reference solution are generated together (the AI problem generator is asked for one JSON object
containing both keys) and are editable through several trainer admin surfaces, so any one of those writers
can put solution text into the starter column. Once there, it was served as the participant's initial
editor content.

The client-side draft was a second, independent exposure: the autosave key was `attemptId` only, so a
reused attempt id after a reset, a shared browser, or a stale entry from a previous session could restore
someone else's saved answers into a fresh attempt.

### Changes

**Server half — a serve-time guard rather than a fix at the writer.** Chasing every writer that could
pollute the starter column would have to be redone for every future writer. Instead, every read path that
ships a starter template to a participant now passes through
`backend/src/services/starterCodeIntegrity.js` (new) first, so a polluted row can never be *served* even
if it does get stored. Three call sites: `codingAssessmentController.getOne` (participant branch),
`proctoringController.getExamData` (coding branch), and the quiz analogue on both
`getExamData` (quiz branch) and `quizzesRoutes GET /:id/questions` (participant branch).

The module keeps two surfaces deliberately **asymmetric**, because the requirement conflates them:

- The problem definition's starter template is nobody's work. If it matches the reference solution that is
  a data-integrity bug — replace it with the clean per-language skeleton and raise a CRITICAL alert.
- A participant's own saved submission is *their* work. A genuinely correct solution legitimately
  converges on the reference text, so high similarity there is a **cheating signal to record, never a
  pre-fill bug to overwrite**. `auditSavedCode()` reports and has no way to mutate the code.

Detection is layered: exact normalised equality, then an explicit substring test (which catches "skeleton
plus pasted solution plus trailing scaffolding", where the extra text would otherwise drag a Jaccard score
below threshold), then plain Jaccard, then an identifier-blind structural pass so renaming every variable
does not sneak a solution through. Trainer-only fields (`referenceSolution`, `starterCodeSource`,
`referenceSolutionSource`, `generationStatus`) are stripped, leaving the participant payload
byte-compatible with the previous shape. The answer key never leaves the module: references are collected
internally and only a verdict is returned, so a caller can ask "does this look copied?" without ever
holding the solution.

One subtlety worth knowing about: for C and C++, the shipped default starter and default *reference*
templates differ only by a comment, which normalisation strips — so an un-filled generator placeholder
would flag its own starter. `dropTemplateReferences()` filters placeholders out by exact normalised
equality against the shipped templates, never by keyword, so a real solution that merely quotes "not
implemented" in a string is not mistaken for a placeholder.

**Client half — composite-key draft storage.** `frontend/src/utils/attemptDraftStorage.js` (new) keys
every draft as `{kind}_draft_u{userId}_a{attemptId}_s{tokenDigest}`, and the payload *additionally*
embeds the scope it was written under — including a digest of the problem/question id set — which is
re-verified on read. The key alone suffices in normal operation; the embedded scope is what makes a
collision fail closed instead of pre-filling someone else's answers. The session token is a credential
and storage keys are readable by anything on the origin, so only a 32-bit digest of it is stored, never
the token itself. Anything failing verification is **deleted** rather than returned, so a bad entry cannot
keep resurfacing, and the editor falls back to the server's starter template — the correct initial state
in every one of those cases.

`purgeStaleAttemptDrafts` bounds storage growth on a shared browser but deliberately does **not** delete
another user's or another attempt's live draft: the read-side scope check already makes those unreadable,
and deleting them would destroy someone else's unsaved work.

The coding page reads the scope out of a ref, because the memoised autosave callbacks do not list
`persistState` as a dependency and would otherwise stamp writes with the placeholder digest captured on
the first render. `QuizTaking.jsx` passes `sessionStorage` explicitly via the module's `{store}` option,
preserving the per-tab lifetime that screen has always had.

| File | |
|---|---|
| `backend/src/services/starterCodeIntegrity.js` | new — serve-time guard |
| `backend/src/controllers/codingAssessmentController.js` | `sanitiseServedProblem` + `auditSavedCode` |
| `backend/src/controllers/proctoringController.js` | coding and quiz branches guarded |
| `backend/src/routes/quizzesRoutes.js` | participant question payload asserted clean |
| `frontend/src/utils/attemptDraftStorage.js` | new — composite-key storage |
| `frontend/src/pages/ParticipantCodingAttemptPage.jsx` | scoped draft read/write/clear, stale purge |
| `frontend/src/components/QuizTaking.jsx` | same, on sessionStorage |
| `backend/test/answer-prefill-integrity.test.js` | new — 24 tests |
| `frontend/scripts/verify-attempt-draft-storage.js` | new — 17 checks |

### Configuration

| Key | Default | Meaning |
|---|---|---|
| `PREFILL_SIMILARITY_THRESHOLD` | `0.62` | Jaccard between served starter and stored reference at which the starter is treated as the solution. Same default as the mentor guard, so the two cannot disagree about what "close" means |
| `PREFILL_STRUCTURAL_THRESHOLD` | `0.72` | Identifier-blind threshold |
| `PREFILL_MIN_COMPARABLE_CHARS` | `24` | Below this many normalised characters, only exact equality counts — scoring two tiny skeletons is noise |
| `PREFILL_ON_LEAK` | `sanitise` | `sanitise` serves the clean template and alerts; `block` refuses the response with HTTP 409 `STARTER_CODE_INTEGRITY`. Both always alert |
| `DRAFT_MAX_AGE_MS` (client) | `12 h` | Draft lifetime, longer than any assessment |

### Tests

`backend/test/answer-prefill-integrity.test.js`, 24 tests, all passing. The regression test you asked for
is there for both assessment types: a fresh coding attempt's initial editor content is asserted to equal
the starter template **even when the stored starter column has been polluted with the reference
solution**, and a fresh quiz attempt is asserted to return no selected option, no answer text, and no
answer-key field on any served question. It also pins the deliberate asymmetry — the problem definition's
starter is rewritten, the participant's own saved code is reported and served untouched — so a future
change that collapses the two will fail loudly. A `test.each` across nine languages asserts that un-filled
generator placeholders never false-positive.

`frontend/scripts/verify-attempt-draft-storage.js` covers the client half with 17 checks, run with
`node scripts/verify-attempt-draft-storage.js` from `frontend/`. It confirms the session token appears in
neither the key nor the payload, and that all four collision classes — second participant on a shared
browser, different attempt id, re-issued session token, reset attempt with a new problem set — restore
nothing. It is a plain Node script rather than a test suite because the frontend has no test runner, and
adding one would have gone beyond this fix.

### QA checklist

- [ ] Open a fresh coding attempt. Confirm the editor contains the starter template with the "Write your
      solution here" comment, and no solution body.
- [ ] As a trainer, deliberately paste the reference solution into a problem's starter-code field, then
      open a participant attempt. Confirm the participant still sees the **clean skeleton**, and that a
      CRITICAL `[StarterCodeIntegrity]` line naming the problem id appears in the server log.
- [ ] Set `PREFILL_ON_LEAK=block`, repeat. Confirm the request fails with 409 rather than serving.
- [ ] Switch language mid-attempt. Confirm each language's starter is its own skeleton.
- [ ] Save some code, refresh. Confirm your own work is restored intact.
- [ ] Save code, then open the same attempt id while logged in as a **different participant** on the same
      browser. Confirm the second participant sees the starter template, not the first one's code, and
      that the first participant's draft still restores correctly afterwards.
- [ ] Submit an attempt, then reopen it. Confirm no draft is restored.
- [ ] Submit code identical to the reference solution. Confirm it is accepted and served back unchanged,
      and that a WARN `[StarterCodeIntegrity]` review flag was logged — not a rewrite.
- [ ] Open a fresh quiz attempt. Confirm nothing is pre-selected and no text field is pre-filled; in
      DevTools, confirm the question payload carries no `correctAnswer` or `explanation`.
- [ ] Confirm a MATCHING question still renders its pairs correctly (`pairs` is intentionally not treated
      as an answer key — see below).
- [ ] In DevTools → Application → Storage, confirm draft keys look like
      `coding_draft_u<uid>_a<attempt>_s<8-hex>` and contain no session token.

### Three points to confirm with you

1. Requirement #4 said to **block the response** when the served code matches the reference. The default
   is sanitise-and-alert instead, because a trainer's data-entry mistake should not deny a participant
   their exam — they get a clean editor and you get a CRITICAL alert. Hard blocking is one env var away
   (`PREFILL_ON_LEAK=block`) if you would rather fail the request.
2. `pairs` on a MATCHING question is effectively its answer key, but it is also required to render the
   question at all. It is therefore deliberately excluded from the answer-key assertion and left
   unchanged. Fixing it properly means splitting rendering data from grading data on that question type —
   flagged, out of scope here.
3. `quizzesRoutes GET /:id/questions` resolves the participant's attempt with an unordered `findOne`. It
   returns metadata only, so there is no answer leak, but with multiple attempts it may not pick the
   latest. Noted, not changed.

---

## Environment limits

`vite build` could not be run here: the installed `esbuild` binary is Windows-only while the repo is
mounted into Linux. JSX was verified instead with the project's own `@babel/parser`
(`{sourceType:'module', plugins:['jsx']}`) plus the project's ESLint config, giving 0 errors on every
touched file and fewer warnings than the pre-change baseline — but please run `npm run build` on your
machine before deploying.

One pre-existing test failure is unrelated to these changes and was present at HEAD:
`backend/test/ai-quiz-autosubmit-flow.test.js` is a console-log script with no Jest `test()` blocks, so
Jest reports "Your test suite must contain at least one test." Its internal assertions all print PASS.

**One file needs deleting by hand.** `frontend/src/pages/__BaselineCheck.jsx` is a scratch copy I made to
lint the pre-change baseline; file deletion inside the mounted folder is blocked here, so I emptied it to
a harmless `export default null` instead. It is imported by nothing and is safe to remove.
