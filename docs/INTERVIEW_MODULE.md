# Interview Module — Enterprise LMS

A complete, production-ready in-app interview system for the LMS. All video/audio runs over native WebRTC with a self-hosted Socket.IO signalling server — **zero dependency on external meeting platforms** (no Zoom, Google Meet, Teams, or Jitsi).

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (React)                    │
│  InterviewRoom │ SharedCodeEditor │ ChatPanel │ QR    │
│       ↕ WebRTC (RTCPeerConnection)                    │
│       ↕ Socket.IO (signalling, chat, code sync)       │
├──────────────────────────────────────────────────────┤
│              Socket.IO Signalling Server              │
│  Room Manager │ JWT Auth │ Event Relay │ ICE Relay    │
├──────────────────────────────────────────────────────┤
│                 Backend (Express.js)                  │
│  InterviewController │ TokenService │ RecordingSvc   │
│       ↕ Sequelize ORM                                │
├──────────────────────────────────────────────────────┤
│                    MySQL Database                     │
│  interviews │ sessions │ devices │ recordings │ logs  │
│  alerts │ feedback │ results                          │
└──────────────────────────────────────────────────────┘
```

## Features

- **Interview Scheduling**: Create, schedule, reschedule, cancel interviews
- **WebRTC Video/Audio**: Peer-to-peer video with STUN (TURN recommended for production)
- **Mobile Pairing**: QR code-based dual camera setup (laptop + phone)
- **Screen Sharing**: Native `getDisplayMedia` API
- **Shared Code Editor**: Monaco Editor with real-time sync via Socket.IO
- **In-Interview Chat**: Text messaging with timestamps
- **AI Monitoring**: Tab switch, copy/paste, camera disable detection (ML placeholders ready)
- **Recording**: Client-side MediaRecorder with chunked upload
- **Evaluation**: Rating (1-10), notes, final decision (Selected/Rejected/On Hold)
- **Role-Based Access**: Admin, Trainer (Interviewer), Participant (Candidate)

## Database Tables (9 tables)

| Table | Purpose |
|-------|---------|
| `interviews` | Core scheduling record |
| `interview_sessions` | One row per live session attempt |
| `interview_devices` | Device pairing state and tokens |
| `interview_recordings` | Recording segment metadata |
| `interview_logs` | Generic activity/audit log |
| `interview_alerts` | AI monitoring alerts |
| `interview_feedback` | Interviewer ratings (supports panel) |
| `interview_results` | Final decision |

## Setup

### Prerequisites

- Node.js >= 18
- MySQL >= 8.0
- npm or yarn

### 1. Install Dependencies

```bash
# Backend (already installed in existing LMS)
cd backend && npm install

# Frontend (already installed in existing LMS)
cd frontend && npm install
```

### 2. Environment Variables

Add to your `.env` file:

```env
# Database (existing)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=training_db
DB_USER=root
DB_PASS=your_password

# JWT (existing)
JWT_SECRET=your_jwt_secret

# Socket.IO
SOCKET_URL=http://localhost:3001

# Recording
RECORDING_SIGNING_SECRET=your_random_secret_here

# WebRTC STUN servers (default: Google public STUN)
# For production, deploy coturn and set TURN credentials:
# STUN_URL=stun:stun.l.google.com:19302
# TURN_URL=turn:your-turn-server.com:3478
# TURN_USERNAME=your_username
# TURN_CREDENTIAL=your_password
```

### 3. Run Database Migration

```bash
node backend/scripts/migrate_interview_tables.js
```

Or tables auto-sync on server start (development mode).

### 4. Start the Application

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### 5. Access Routes

| Route | Description | Role |
|-------|-------------|------|
| `/interviews` | Interview dashboard | All |
| `/interview/schedule` | Schedule new interview | Admin, Trainer |
| `/interview/:id/room` | Interview room (WebRTC) | All (authorized) |
| `/interview/:id` | Post-interview evaluation | All |
| `/mobile-join/:token` | Mobile pairing page | Candidate |

## REST API

```
POST   /api/interviews/create          — Create interview
GET    /api/interviews                  — List interviews
GET    /api/interviews/:id              — Get interview details
POST   /api/interviews/:id/join         — Join interview room
POST   /api/interviews/:id/pair-mobile  — Pair mobile device
POST   /api/interviews/:id/refresh-qr   — Refresh QR code
POST   /api/interviews/:id/start        — Start interview (interviewer)
POST   /api/interviews/:id/end          — End interview (interviewer)
POST   /api/interviews/:id/feedback     — Submit rating/notes
GET    /api/interviews/:id/feedback     — Get all feedback
POST   /api/interviews/:id/result       — Submit final decision
GET    /api/interviews/:id/status       — Get live status
GET    /api/interviews/:id/recordings   — Get recording list
POST   /api/interviews/:id/alerts       — Log AI alert
```

## Socket.IO Events

### Client → Server
- `join-room` — Join interview room
- `leave-room` — Leave room
- `offer` — WebRTC SDP offer
- `answer` — WebRTC SDP answer
- `ice-candidate` — ICE candidate exchange
- `screen-share` — Screen share start/stop
- `chat-message` — Send chat message
- `device-status` — Device connection status
- `interview-alert` — AI monitoring alert
- `code-sync` — Shared editor content
- `recording-status` — Recording state change

### Server → Client
- `peer-joined` — New peer in room
- `peer-left` — Peer left room
- `offer`, `answer`, `ice-candidate` — WebRTC signalling relay
- `screen-share`, `chat-message`, `device-status`, `interview-alert`, `code-sync`, `recording-status`

## WebRTC Architecture

- **Topology**: Mesh (up to 4 peers per room)
- **STUN**: Google public STUN (`stun:stun.l.google.com:19302`)
- **TURN**: Recommended for production — deploy [coturn](https://github.com/coturn/coturn)
- **Reconnection**: Exponential backoff + ICE restart on disconnect
- **Scaling**: Beyond 4 participants, switch to SFU (e.g., mediasoup)

### TURN Server Setup (Production)

```bash
# Install coturn
sudo apt install coturn

# Configure /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=interview TURN_PASSWORD
realm=interview.yourdomain.com
cert=/etc/letsencrypt/live/interview.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/interview.yourdomain.com/privkey.pem

# Start
sudo systemctl start coturn
```

## Mobile Pairing Flow

1. Candidate clicks "Join Interview" on laptop
2. QR code generated with one-time pairing token (5-min expiry)
3. Candidate scans QR → opens `/mobile-join/:token`
4. Mobile enables camera → auto-pairs via token validation
5. Token consumed atomically (race-condition safe via DB row lock)
6. Laptop shows "Mobile Connected" status in real-time
7. Interviewer sees both camera feeds in the monitoring panel

## AI Monitoring

### Implemented (No ML Required)
- Tab switch detection (`visibilitychange`)
- Window blur detection
- Copy/paste detection
- Camera disabled mid-interview
- Screen share stopped

### Placeholder (ML Integration Ready)
```javascript
class AIMonitorProvider {
  async analyzeFrame(frameData) {
    // Plug in TensorFlow.js, MediaPipe, or backend inference
    return [] // AlertPayload[]
  }
}
```

## Recording

- Uses `MediaRecorder` API (WebM format)
- Chunked upload every 5 seconds to prevent memory bloat
- Metadata stored in `interview_recordings` table
- Signed, time-limited URLs for secure playback

## Security

- JWT auth on every REST call and Socket.IO handshake
- Role-based middleware enforcement server-side
- One-time pairing tokens with 5-min expiry
- Rate limiting on token regeneration (5 per session, 1-min cooldown)
- Recording consent notice required before capture
- Signed URLs for recording playback
- All socket payloads validated server-side

## Scaling Limits

- **Mesh WebRTC**: Max 4 peers per room (HR + candidate-laptop + candidate-mobile + 1 spare)
- **For >4 participants**: Switch to SFU architecture (mediasoup, Janus)
- **Concurrent interviews**: Each room is isolated; scale horizontally with Redis adapter
- **Recording storage**: Use S3-compatible storage for production (replace local file writes)

## Project Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── interviewController.js      # REST API handlers
│   ├── models/
│   │   ├── Interview.js                 # Core scheduling model
│   │   ├── InterviewSession.js          # Live session tracking
│   │   ├── InterviewDevice.js           # Device pairing state
│   │   ├── InterviewRecording.js        # Recording metadata
│   │   ├── InterviewLog.js              # Activity/audit log
│   │   ├── InterviewAlert.js            # AI monitoring alerts
│   │   ├── InterviewFeedback.js         # Ratings & notes
│   │   └── InterviewResult.js           # Final decision
│   ├── routes/
│   │   └── interviewRoutes.js           # API routes
│   ├── services/
│   │   ├── interviewTokenService.js     # Pairing token management
│   │   ├── interviewRecordingService.js # Recording & upload
│   │   ├── interviewNotificationService.js # Notifications
│   │   └── interviewAiMonitorService.js # Alert processing
│   ├── socket/
│   │   └── interviewEvents.js           # WebRTC signalling + room mgmt
│   └── utils/
│       └── interviewQrGenerator.js      # QR payload generation
├── scripts/
│   └── migrate_interview_tables.js      # SQL migration

frontend/
├── src/
│   ├── components/interview/
│   │   ├── VideoTile.jsx                # Video stream tile
│   │   ├── QRPairing.jsx                # QR code for mobile pairing
│   │   ├── InterviewToolbar.jsx         # Bottom toolbar
│   │   ├── ChatPanel.jsx                # In-interview chat
│   │   ├── StatusStrip.jsx              # Device status indicators
│   │   └── SharedCodeEditor.jsx         # Monaco collaborative editor
│   ├── pages/interview/
│   │   ├── InterviewDashboard.jsx       # Interview list & management
│   │   ├── ScheduleInterview.jsx        # Schedule form
│   │   ├── InterviewRoom.jsx            # Main WebRTC room
│   │   ├── MobileJoin.jsx               # Mobile pairing page
│   │   └── InterviewEvaluation.jsx      # Post-interview eval
│   ├── hooks/
│   │   ├── useWebRTC.js                 # RTCPeerConnection management
│   │   ├── useInterviewRecorder.js      # MediaRecorder + chunked upload
│   │   └── useInterviewDetectors.js     # AI monitoring detectors
│   ├── contexts/
│   │   └── InterviewSessionContext.jsx   # Session state provider
│   └── services/
│       └── interviewService.js           # API client wrapper
```
