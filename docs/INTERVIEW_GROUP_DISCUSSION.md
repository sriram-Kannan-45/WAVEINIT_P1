# Interview and Group Discussion extension

## Inspection and design (before implementation)

Interview already has scheduling, role-aware invitation/device/consent/waiting/live screens, InterviewSession, per-user InterviewDevice QR credentials, multi-peer Socket.IO/WebRTC, chat, screen sharing, recording chunks, InterviewAlert/Log, feedback, and a published InterviewResult. It uses React/Vite, Express, Sequelize, Socket.IO and Python inference. No replacement framework is needed.

Quiz and Coding bind an owned attempt to a canonical MonitoringSession, admit once, preserve the session/timer on reconnect, finalize submission before reporting, and use monitoringService for event scoring and reports. The new camera flow separates real video transport from detector evidence and offers QR reconnection only for lost video.

Interview gaps: singular candidate_id and result; global mobilePaired flags; mobile participant ID defaulting to 1; numeric InterviewSession ID passed to MonitoringEngineClient instead of a MonitoringSession ID; token validation expires consumed credentials; non-atomic session creation; mobile and signaling authorization insufficiently bound to the room; detection records lack reliable participant separation; room UI selects only the first candidate stream.

Design: extend Interview with mode and configurable evaluation criteria. Add InterviewParticipant rows for membership, canonical monitoring linkage, presence and individual GD evaluation. Preserve normal InterviewFeedback/InterviewResult compatibility instead of replacing their one-candidate schema. Reuse InterviewSession, device/token service, existing room/media/WebRTC hooks, camera-status policy, MonitoringSession/event/report services, and existing UI components. Each candidate has an independent monitoring session in the same interview room. Candidate leave never ends the discussion; the assigned interviewer/admin owns start/end/evaluation. Scores and publication are candidate-specific. Server session timestamps remain authoritative through refresh, late join and reconnect.

Affected areas: Interview models and additive migration, shared Interview lifecycle/access service, existing controller/routes/socket handlers, token service, InterviewRoom/ActiveRoom, scheduling/dashboard/evaluation screens, mobile camera page and detector hook. Quiz/Coding admission, scoring and submission contracts remain unchanged. Small-group mesh WebRTC will be reused with a configurable participant list capped at six candidates, avoiding an untested media-server replacement.

## Delivered workflow

1. A trainer or admin schedules a normal interview or selects **Group Discussion** and chooses two to six candidates. The server persists membership and the selected weighted evaluation criteria.
2. Each candidate completes consent, joins from their own laptop, and pairs their own mobile camera. The readiness gate requires a live camera transport, not merely a successful QR scan.
3. The interviewer starts the shared session. The server owns its timing and creates or resumes each candidate's separate monitoring context. A late candidate can join without changing the other candidates' timing or evidence.
4. During the session, missing person or laptop detection produces a repositioning message while the live mobile transport remains connected. A lost transport keeps the assessment open and permits an authenticated scan of the same QR code to reconnect the phone.
5. An interviewer or admin ends the session. Each participant's monitoring context is finalized once, participation time is retained, and group evaluations can be saved and published independently. Candidates can see only their own published result.

## Access and media boundaries

Candidates can view their own mobile feed and their own monitoring status. Staff can view all candidate laptop and mobile feeds. Socket events, reporting routes, and monitoring events verify participant ownership or interviewer/admin access; a candidate cannot subscribe to another candidate's mobile stream or submit monitoring telemetry for them.

## Validation performed

The additive schema migration was applied to PostgreSQL. The backend lifecycle suite covers normal and group start/end/reconnect, concurrent session creation, per-candidate authorization, individual evaluation and report export. Frontend render tests cover staff and candidate group-room visibility and live-camera recovery states. Production frontend build and the AI mobile-composition detector tests pass.
