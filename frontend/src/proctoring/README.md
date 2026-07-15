# Proctoring Module

Self-contained AI-proctored online quiz module for the existing
Express + Sequelize / React + Vite LMS. Adds fullscreen enforcement,
anti-cheat blockers, screen-share monitoring, single-device sessions,
realtime trainer monitoring, violation logging, AES-encrypted session
data, and synced countdown timers — without touching your existing
quiz, trainer, or participant code beyond a few lines of wiring.

> Persistence note: your project uses **MySQL + Sequelize**, so this
> module uses Sequelize models to integrate with your existing `User`,
> `AIQuiz`, and `QuizAttempt` tables. The business logic in
> `services/proctoringService.js` is framework-agnostic — swap to
> MongoDB by editing only that file if you ever migrate.

---

## Folder structure

```
backend/src/
├── models/
│   ├── examSession.js           ← session lifecycle
│   ├── violation.js             ← append-only violation log
│   ├── deviceFingerprint.js     ← device-bind enforcement
│   └── proctorActivity.js       ← timeline events
├── services/proctoringService.js
├── controllers/proctoringController.js
├── routes/proctoringRoutes.js
├── middleware/sessionLock.js
├── socket/events/proctorEvents.js
└── utils/crypto.js              ← AES-256-GCM helpers

frontend/src/
├── proctoring/
│   ├── index.js                 ← public surface
│   ├── api.js                   ← REST client
│   ├── ProctorContext.jsx       ← state machine
│   ├── constants.js
│   ├── hooks/
│   │   ├── useFullscreen.js
│   │   ├── useTabVisibility.js
│   │   ├── useAntiCheat.js
│   │   ├── useScreenShare.js
│   │   ├── useDeviceFingerprint.js
│   │   ├── useExamTimer.js
│   │   ├── useNetworkStatus.js
│   │   └── useProctorMonitor.js
│   └── components/
│       ├── ui.jsx
│       ├── ExamGate.jsx
│       ├── ProctoredExamShell.jsx
│       ├── ProctoredExamPage.jsx
│       ├── ViolationOverlay.jsx
│       ├── TerminatedScreen.jsx
│       ├── ParticipantMonitorCard.jsx
│       └── TrainerProctoringDashboard.jsx
└── pages/
    ├── ParticipantProctoredQuiz.jsx   ← /participant/exam/:quizId
    └── TrainerProctoringPage.jsx       ← /trainer/proctor/:quizId
```

---

## Backend wiring (already applied)

1. `backend/src/models/index.js` — registers the 4 new models and
   their associations.
2. `backend/src/app.js` — imports `proctoringRoutes`, mounts at
   `/api/proctor`, additively syncs the 4 new tables on startup, and
   starts a 60s heartbeat reaper.
3. `backend/src/config/socket.js` — registers `proctorEvents` inside
   `io.on('connection')`.

### Required environment variable

Add to `backend/.env`:

```
# 32-byte (64 hex chars) AES-GCM key for session payload encryption.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PROCTOR_ENC_KEY=...
```

If unset, the module falls back to a key derived from `JWT_SECRET` and
prints a warning. **Do not run production without this.**

---

## REST API

All endpoints require `Authorization: Bearer <jwt>`.
Endpoints marked **🔒** also require `X-Proctor-Session-Token`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/proctor/sessions/start` | Create + return new session |
| GET  | `/api/proctor/sessions/active` | Resume active session (if any) |
| POST | `/api/proctor/sessions/:id/activate` 🔒 | Mark PENDING → ACTIVE |
| POST | `/api/proctor/sessions/:id/heartbeat` 🔒 | Liveness ping |
| POST | `/api/proctor/sessions/:id/violation` 🔒 | Record violation |
| POST | `/api/proctor/sessions/:id/activity` 🔒 | Low-severity timeline event |
| POST | `/api/proctor/sessions/:id/submit` 🔒 | Final submission |
| POST | `/api/proctor/sessions/:id/terminate` 🔒 | Self-terminate |
| GET  | `/api/proctor/sessions/:id` | Single session view |
| GET  | `/api/proctor/sessions/:id/violations` | Trainer/Admin |
| GET  | `/api/proctor/sessions/:id/export.json` | Trainer/Admin — full audit JSON download |
| POST | `/api/proctor/sessions/:id/force-terminate` | Trainer/Admin override |
| GET  | `/api/proctor/quiz/:quizId/monitor` | Trainer dashboard snapshot |

---

## Socket events

### Participant emits
- `proctor:join { sessionId }`  → joins session room, kicks other tabs
- `proctor:heartbeat { sessionId }`
- `proctor:state { sessionId, isFullscreen?, isScreenSharing?, isOnline? }`
- `proctor:violation { sessionId, type, message?, metadata? }`

### Trainer emits
- `proctor:trainerJoin { quizId }` → returns full snapshot in ack
- `proctor:trainerLeave { quizId }`
- `proctor:forceTerminate { sessionId, reason? }`

### Server pushes
- `proctor:update { type, session, violation? }` — to trainers
- `proctor:heartbeat { sessionId, at }` — to trainers
- `proctor:terminated { sessionId, reason }` — to participant
- `proctor:warning { type, message }` — to participant
- `proctor:multipleLogin` — to participant being kicked

### Rooms
- `user_<id>` — joined by core auth middleware (existing)
- `proctor_quiz_<quizId>` — trainers monitoring one quiz
- `proctor_session_<id>` — participant + trainers monitoring one session

---

## Database schema (Sequelize → MySQL)

| Table | Key columns |
| --- | --- |
| `exam_sessions` | id, quiz_id, attempt_id, participant_id, session_token, status (PENDING/ACTIVE/SUBMITTED/TERMINATED/EXPIRED), warnings_count, fullscreen_exits, is_fullscreen, is_screen_sharing, is_online, started_at, ends_at, ended_at, encrypted_payload, last_heartbeat_at |
| `proctor_violations` | id, session_id, participant_id, quiz_id, type (enum), severity, message, metadata (JSON), occurred_at |
| `device_fingerprints` | id, user_id, fingerprint_hash, ip_address, user_agent, last_seen_at |
| `proctor_activities` | id, session_id, participant_id, event_type, payload (JSON), occurred_at |

All four are auto-synced on backend startup.

---

## Frontend usage

### Participant — protected exam route

The `App.jsx` already exposes `/participant/exam/:quizId`. Link to it
from your participant quizzes list:

```jsx
import { Link } from 'react-router-dom';

<Link to={`/participant/exam/${quiz.id}`}>Start exam</Link>
```

### Trainer — live monitoring dashboard

```jsx
import { Link } from 'react-router-dom';

<Link to={`/trainer/proctor/${quiz.id}`}>Live monitor</Link>
```

You can also embed the dashboard inside any existing trainer page:

```jsx
import { TrainerProctoringDashboard } from '../proctoring';

<TrainerProctoringDashboard quizId={42} quizTitle="Final Exam" />
```

### Wrapping any custom exam UI

```jsx
import { ProctorProvider, ProctoredExamPage } from '../proctoring';

<ProctorProvider>
  <ProctoredExamPage quizId={42} quizTitle="Final" onExit={...}>
    {({ session }) => <YourExamComponent attemptId={session.attemptId} />}
  </ProctoredExamPage>
</ProctorProvider>
```

---

## Violation policy (server-enforced)

| Type | Counts as warning | Auto-terminate |
| --- | --- | --- |
| `FULLSCREEN_EXIT` | yes | after 3 |
| `TAB_SWITCH`, `WINDOW_BLUR`, `BROWSER_MINIMIZE` | yes | after 5 warnings total |
| `COPY_ATTEMPT`, `PASTE_ATTEMPT`, `BLOCKED_SHORTCUT`, `DEVTOOLS_OPENED` | yes | after 5 warnings total |
| `SCREEN_SHARE_STOPPED` | yes | after 5 warnings total |
| `SCREEN_SHARE_DENIED`, `MULTIPLE_LOGIN` | yes | immediately |
| `RIGHT_CLICK`, `NETWORK_LOST` | no | no |

Constants in `services/proctoringService.js`:
```js
MAX_FULLSCREEN_EXITS = 3
MAX_WARNINGS = 5
HEARTBEAT_TIMEOUT_MS = 25_000
```

---

## Security checklist

- [x] All REST endpoints require valid JWT
- [x] Locked endpoints also require `X-Proctor-Session-Token`
- [x] Session token is generated server-side via `crypto.randomBytes(48)`
- [x] Session payload encrypted with AES-256-GCM at rest
- [x] Single-device enforcement via `proctor:join` socket eviction
- [x] Server is the source of truth for warning counters and termination
- [x] Heartbeat reaper expires stale sessions automatically
- [x] Violation log is append-only (no `updatedAt`)

---

## Operational tips

- Generate `PROCTOR_ENC_KEY` once per environment and store in your
  secret manager.
- The frontend uses `getDisplayMedia` which **requires HTTPS in
  production** (localhost works without TLS).
- Browsers cannot truly block OS shortcuts (Alt-Tab, Win-key, Cmd-Tab).
  These are detected via `visibilitychange` / `blur` and logged.
- For multi-instance scaling, the existing Socket.IO Redis adapter in
  `config/socket.js` already handles cross-node room broadcast — no
  proctoring-specific changes needed.
