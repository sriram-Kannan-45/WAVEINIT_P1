# WAVEINIT Enterprise LMS Platform

> **Next-Generation Learning, AI Assessment, Multi-Language Code Execution & Dual-Camera Proctoring Platform**

[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%2022%20%7C%20Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/AI%20Microservice-FastAPI%20%7C%20Python%203.11-3776AB?logo=python&logoColor=white)](https://fastapi.tiangolo.com/)
[![Computer Vision](https://img.shields.io/badge/Vision-YOLO11s%20%7C%20MediaPipe-FF6F00?logo=opencv&logoColor=white)](https://ultralytics.com/)
[![WebRTC](https://img.shields.io/badge/Realtime-WebRTC%20%7C%20Socket.IO-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Database](https://img.shields.io/badge/Database-MySQL%20%7C%20PostgreSQL-4479A1?logo=mysql&logoColor=white)](https://sequelize.org/)
[![Cloud](https://img.shields.io/badge/Deployment-Azure%20App%20Service%20%7C%20Docker-0078D4?logo=microsoft-azure&logoColor=white)](https://azure.microsoft.com/)

---

## Table of Contents

1. [Executive Overview & Platform Capabilities](#1-executive-overview--platform-capabilities)
2. [High-Level System Architecture](#2-high-level-system-architecture)
3. [End-to-End Core Working Flows](#3-end-to-end-core-working-flows)
   - [Flow 1: Authentication, RBAC & Device Security](#flow-1-authentication-rbac--device-security)
   - [Flow 2: Course Curriculum & Learning Lifecycle](#flow-2-course-curriculum--learning-lifecycle)
   - [Flow 3: AI Quiz Generation & Assessment Pipeline](#flow-3-ai-quiz-generation--assessment-pipeline)
   - [Flow 4: Prompt-First Coding Assessment & Judge0 Sandbox](#flow-4-prompt-first-coding-assessment--judge0-sandbox)
   - [Flow 5: 1-on-1 Real-Time Technical Video Interview](#flow-5-1-on-1-real-time-technical-video-interview)
   - [Flow 6: Dual-Camera AI Proctoring & Anti-Cheat System](#flow-6-dual-camera-ai-proctoring--anti-cheat-system)
   - [Flow 7: Post-Assessment Analytics, Forensic Audits & Verification](#flow-7-post-assessment-analytics-forensic-audits--verification)
4. [Comprehensive Directory & File Structure](#4-comprehensive-directory--file-structure)
   - [Root Directory](#root-directory-overview)
   - [Frontend Architecture (`/frontend`)](#frontend-architecture-frontend)
   - [Backend Architecture (`/backend`)](#backend-architecture-backend)
   - [AI Service Architecture (`/ai-service`)](#ai-service-architecture-ai-service)
   - [Database, Nginx & DevOps Modules](#database-nginx--devops-modules)
5. [Technology Stack Matrix](#5-technology-stack-matrix)
6. [Environment Variables & Configuration](#6-environment-variables--configuration)
7. [Installation & Local Development Guide](#7-installation--local-development-guide)
8. [Production Deployment & Cloud Architecture](#8-production-deployment--cloud-architecture)
9. [Core API & WebSocket Channel Catalog](#9-core-api--websocket-channel-catalog)
10. [Troubleshooting & Operational FAQ](#10-troubleshooting--operational-faq)
11. [Testing & Health Checks](#11-testing--health-checks)
12. [Security Guidance](#12-security-guidance)
13. [Additional Documentation](#13-additional-documentation)

---

## 1. Executive Overview & Platform Capabilities

**WAVEINIT LMS** is an enterprise-grade platform engineered to unify the modern corporate and academic training lifecycle into a cohesive, high-performance ecosystem. It bridges the critical gaps between pedagogical delivery, automated content generation, sandbox execution, and uncompromised evaluation integrity.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 WAVEINIT LMS ECOSYSTEM                                 │
│                                                                                        │
│   TRAIN                     ASSESS                   MONITOR                  ANALYZE  │
│  ┌────────────────┐        ┌────────────────┐       ┌────────────────┐       ┌────────┐│
│  │ Modular Course │ ─────▶ │ AI Quiz Engine │ ────▶ │ Dual-Camera AI │ ────▶ │ Radar  ││
│  │ Studio, RAG &  │        │ Coding Sandbox │       │ Proctoring &   │       │ Audits ││
│  │ Video Lessons  │        │ 1:1 Interviews │       │ Anti-Cheat     │       │ Badges ││
│  └────────────────┘        └────────────────┘       └────────────────┘       └────────┘│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Architectural Innovations

- **Dual-Camera 360° AI Proctoring**: Combines primary laptop front-camera telemetry (MediaPipe 468-point face mesh, gaze vectors, iris tracking, head pose) with zero-install QR-paired secondary smartphone camera surveillance (YOLO11s inference for smartphones, secondary screens, books, and unauthorized personnel).
- **Prompt-First Coding Assessment Engine**: Driven by a 9-node LangGraph orchestration workflow in Python, translating natural language requirements directly into self-validated code challenges with multi-language starter templates, hidden test cases, and Docker sandbox execution.
- **RAG-Powered AI Quiz Synthesizer**: Ingests PDF, DOCX, PPTX, and course documents into FAISS vector spaces, generating taxonomically calibrated MCQs, code-output, and scenario-based assessments with zero question duplication.
- **Built-In WebRTC Technical Interview Studio**: Zero external dependencies (no Zoom/Google Meet). Features synchronized Monaco code collaboration, peer-to-peer audio/video mesh, live interview rubrics, in-session chat, and candidate recording.
- **Zero-Leak Hardware Security**: Strictly enforces hardware stream auto-shutdown at the operating system and browser level the millisecond an assessment ends or is submitted.
- **Scale-Out Ready Cloud Topology**: Stateless API instances with Redis Socket.IO adapter, distributed locking, and Azure App Service CI/CD deployment pipelines.

---

## 2. High-Level System Architecture

The WAVEINIT system is architected as a distributed microservice topology decoupled into three primary execution tiers:

```text
                                  CLIENT BROWSERS & MOBILE DEVICES
                       [ Candidate Laptop ]             [ Mobile QR Camera ]
                                │                                │
                        HTTPS / WSS                     HTTPS / WebRTC
                                │                                │
                                ▼                                ▼
                 ┌─────────────────────────────────────────────────────────────┐
                 │          NGINX LOAD BALANCER & REVERSE PROXY                │
                 │         (SSL Termination, Rate Limiting, Static)            │
                 └──────────────┬───────────────────────────────┬──────────────┘
                                │                               │
                    API & Socket Requests               Static Assets
                                │                               │
                                ▼                               ▼
                 ┌─────────────────────────────┐  ┌────────────────────────────┐
                 │   NODE.JS APP INSTANCES     │  │   VITE + REACT FRONTEND    │
                 │   (Express, Socket.IO)      │  │   (Tailwind, Monaco,       │
                 │   - Auth, RBAC & API Router │  │    MediaPipe Client Edge)  │
                 │   - Proctoring Coordinator  │  └────────────────────────────┘
                 │   - WebRTC Signalling Mesh  │
                 └──────────────┬──────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  PYTHON FASTAPI  │  │   SHARED REDIS   │  │   RELATIONAL DB  │
│   AI SERVICE     │  │   (7-Alpine)     │  │ (MySQL / Postgre)│
│ ──────────────── │  │ ──────────────── │  │ ──────────────── │
│ • YOLO11s Engine │  │ • Socket Adapter │  │ • Users & RBAC   │
│ • LangGraph Flow │  │ • Distributed    │  │ • Courses & Labs │
│ • FAISS RAG Store│  │   Locks          │  │ • Events & Logs  │
│ • Gemini & Groq  │  │ • BullMQ Worker  │  │ • Forensic Score │
│   LLM Gateway    │  │   Task Queues    │  │ • Submissions    │
└─────────┬────────┘  └──────────────────┘  └──────────────────┘
          │
          ▼
┌──────────────────┐
│ JUDGE0 SANDBOX   │
│  (Docker / PIDs) │
│ ──────────────── │
│ • Multi-Language │
│ • CPU/RAM Caging │
│ • stdio Matcher  │
└──────────────────┘
```

---

## 3. End-to-End Core Working Flows

---

### Flow 1: Authentication, RBAC & Device Security

```text
[Candidate / Trainer / Admin]
       │  1. POST /api/auth/login (email, password, fingerprint)
       ▼
[Backend Auth Engine]
       │  2. Password Verification (Bcrypt salt rounds = 10)
       │  3. Role Verification (ADMIN | TRAINER | PARTICIPANT)
       │  4. Session Lock & Device Fingerprinting (Browser, OS, Screen, IP)
       │  5. Issue Dual JWTs:
       │     - Access Token (Short-lived: 15 mins)
       │     - Refresh Token (7 days, stored in DB/Cookie)
       ▼
[Frontend Auth Interceptor]
       │  6. Store tokens in secure context
       │  7. Route Guard gates access via Role Hierarchy:
       │     - /admin/*        ──▶ Admin Dashboard & System Audit
       │     - /trainer/*      ──▶ Course Studio, Proctoring & Quizzes
       │     - /participant/*  ──▶ Learning Center, Exams & Code Lab
```

1. **Identity & Device Fingerprint Binding**: During authentication, the candidate's browser hardware characteristics (GPU renderer, canvas hash, screen geometry, user-agent) are computed and persisted in `device_fingerprints`.
2. **Session Concurrency Protection**: The platform checks `user_sessions` and invalidates concurrent rogue logins if single-session enforcement is active.
3. **Role Gating & Policy Middleware**: Every protected API route passes through `authenticateToken` and `authorizeRoles(['ADMIN', 'TRAINER'])`.

---

### Flow 2: Course Curriculum & Learning Lifecycle

```text
[Trainer / Admin] ──▶ Create Course ──▶ Add Modules ──▶ Upload Materials (PDF/Video)
                                                                 │
                                                    Vector Extraction (AI Service)
                                                                 ▼
[Learner] ──▶ Enroll in Course ──▶ Stream Lessons ──▶ Mark Complete ──▶ Progress Bar Sync
```

1. **Course Creation**: Trainers author courses with structured modules, lessons, downloadable resources, and attached quizzes/coding labs.
2. **Automated Material Ingestion**: Uploaded lecture materials (PDF, DOCX, PPTX) are forwarded to the Python AI service to be indexed for RAG-based quiz synthesis.
3. **Granular Progress Tracking**: Every lesson completion updates `lesson_progress`, calculating course completion percentages and dynamically qualifying participants for final certifications.

---

### Flow 3: AI Quiz Generation & Assessment Pipeline

```text
[Trainer UI]
    │ 1. Define Topic / Upload Document + Select Difficulty (Bloom's Level 1-6)
    ▼
[Node.js Backend] (/api/ai-quiz/generate)
    │ 2. Forward Payload + Document to Python AI Service
    ▼
[Python AI Microservice]
    │ 3. Document Extraction (PyMuPDF, python-docx, python-pptx)
    │ 4. FAISS Semantic Chunking (650 tokens, 100 overlap)
    │ 5. LLM Prompt Construction (Bloom's Taxonomy, Strict JSON Schema)
    │ 6. Inference via Gemini 2.5 Flash (Fallback: Groq / OpenAI)
    │ 7. Verification Loop:
    │    - JSON Structure & Type Validation
    │    - Duplicate Removal (Cosine Similarity < 0.85)
    │    - Option Randomization & Deterministic Answer Keying
    ▼
[Trainer Review Cockpit]
    │ 8. Trainer edits questions, modifies point weights, and clicks "Publish"
    ▼
[Learner Exam Portal]
    │ 9. Synced Countdown Timer (Server-authoritative expiry)
    │ 10. Instant Auto-Grading on submit; detailed performance breakdown
```

1. **Bloom's Cognitive Taxonomy**: Quizzes can be synthesized across 6 difficulty tiers: Remember, Understand, Apply, Analyze, Evaluate, and Create.
2. **Strict JSON Schema Enforcement**: Raw LLM output is parsed through `json-repair` and validated against Pydantic models before persistence.
3. **Anti-Leak Shuffling**: Option sequences and question presentations are randomized per candidate attempt to eliminate side-by-side answer sharing.

---

### Flow 4: Prompt-First Coding Assessment & Judge0 Sandbox

```text
                    TRAINER PROMPT
       "Create 3 medium dynamic programming challenges"
                           │
                           ▼
  ┌──────────────────────────────────────────────────┐
  │         LANGGRAPH 9-NODE PYTHON PIPELINE         │
  │                                                  │
  │  [1. validatePrompt] ──▶ [2. analyzeIntent]      │
  │           │                                      │
  │           ▼                                      │
  │  [3. generateQuestion] ──▶ [4. generateReqs]     │
  │           │                                      │
  │           ▼                                      │
  │  [5. generateTestCases] ──▶ [6. validateQuestion]│
  │           │                                      │
  │           ▼                                      │
  │  [7. validateTestCases] (Executes in Sandbox)    │
  │           │                                      │
  │           ▼                                      │
  │  [8. promptAlignmentCheck] ──▶ [9. OutputJSON]   │
  └────────────────────────┬─────────────────────────┘
                           │
             Self-Validated Problem Set
                           ▼
  ┌──────────────────────────────────────────────────┐
  │         PARTICIPANT IN-BROWSER CODING IDE        │
  │  - Monaco Editor (Syntax Highlighting, Intelli)  │
  │  - Multi-Language: Python, JS, C++, Java, Go     │
  │  - "Run Code" against Public Test Cases          │
  │  - "Submit Code" triggers Full Evaluation        │
  └────────────────────────┬─────────────────────────┘
                           │
                           ▼
  ┌──────────────────────────────────────────────────┐
  │            JUDGE0 / DOCKER SANDBOX               │
  │  - Isolated CPU, Memory & Network Restrictions   │
  │  - Stdio I/O Streaming & Execution Timing        │
  │  - Verdicts: AC, WA, TLE, MLE, CE, RE            │
  └──────────────────────────────────────────────────┘
```

1. **Prompt-First LangGraph Pipeline (`coding_workflow.py`)**:
   - Replaces all legacy static question banks with a 9-step reactive graph.
   - **Self-Healing Verification**: Reference solutions are executed against generated test cases inside a sandbox runner before saving. If solutions fail, the graph automatically loops back and regenerates.
2. **In-Browser Monaco IDE**: Participants solve problems in an interface equipped with customizable themes, standard input/output terminal simulation, and test case runners.
3. **Multi-Language Sandbox Execution**:
   - Sandboxed via Docker/Judge0 with strict cgroup limits (1-2s CPU time limit, 256MB RAM cap).
   - Evaluates hidden edge-case tests (null inputs, performance limits, negative values).
   - Generates precise execution verdicts: **Accepted (AC)**, **Wrong Answer (WA)**, **Time Limit Exceeded (TLE)**, **Memory Limit Exceeded (MLE)**, or **Runtime Error (RE)**.

---

### Flow 5: 1-on-1 Real-Time Technical Video Interview

```text
[Interviewer / Trainer]                          [Candidate]
        │                                             │
        │ 1. Join Room (/interview/room/:id)          │ 1. Join Room
        ├──────────────────────┬──────────────────────┤
        │                      │                      │
        ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 SOCKET.IO SIGNALLING SERVER                 │
│  - JWT Room Authentication & Peer Discovery                 │
│  - WebRTC SDP Offer / Answer Exchange                       │
│  - ICE Candidate Relay                                      │
│  - Operational Code Sync (Monaco Editor)                    │
│  - In-Room Chat Stream                                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
               Direct Peer-to-Peer Media Mesh
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   INTERVIEW COLLABORATION                   │
│  • Ultra-Low Latency Video/Audio (WebRTC + STUN/TURN)       │
│  • Collaborative Live Coding (Real-Time Document Delta Sync)│
│  • Secondary Mobile Camera View (Desk / Candidate Side)     │
│  • Real-Time Rating Rubrics & Structured Interview Notes    │
│  • In-Browser Chunked WebM Video Recording                  │
└─────────────────────────────────────────────────────────────┘
```

1. **Zero External Dependency**: Native WebRTC implementation eliminates the requirement for external meeting licenses (Zoom, Teams, Meet).
2. **Collaborative Code Editor**: Shared Monaco editor keeps candidate and interviewer code changes in real-time synchronization with atomic diff broadcasts.
3. **Structured Evaluation & Scorecard**: Interviewers rate candidates across technical competence, system design, and communication with instant submission to the candidate profile.

---

### Flow 6: Dual-Camera AI Proctoring & Anti-Cheat System

```text
                      ASSESSMENT INTEGRITY PIPELINE
                      
      PRIMARY CAMERA (Webcam)                  SECONDARY CAMERA (Mobile Phone)
   ┌───────────────────────────┐            ┌────────────────────────────────┐
   │ MediaPipe Face Landmarker │            │ Mobile QR Join (Zero Install)  │
   │ (468 3D Facial Mesh)      │            │ Rear Camera Streaming          │
   └─────────────┬─────────────┘            └───────────────┬────────────────┘
                 │                                          │
                 ▼                                          ▼
     • Gaze / Iris Vector Tracking              • YOLO11s Object Detection:
     • Head Pose (Pitch, Yaw, Roll)               - Mobile Phones / Devices
     • Face Absence Detection                     - Secondary Screens / Monitors
     • Multiple Faces in View                     - Books & Printed Notes
     • Upper-Body Framing                         - Additional Persons in Room
                 │                                          │
                 └──────────────────┬───────────────────────┘
                                    │
                                    ▼
                ┌───────────────────────────────────────┐
                │     CLIENT-SIDE HEURISTICS &          │
                │     BROWSER HARDWARE LOCKDOWN         │
                │ ───────────────────────────────────── │
                │ • Fullscreen Enforcement              │
                │ • Tab Visibility Tracking             │
                │ • Copy / Paste / Context Menu Block   │
                │ • Multi-Display Screen Detection      │
                │ • Temporal Debouncing (2.0s - 3.5s)   │
                └───────────────────┬───────────────────┘
                                    │
                                    ▼
                ┌───────────────────────────────────────┐
                │   BACKEND VERIFICATION & PERSISTENCE  │
                │ ───────────────────────────────────── │
                │ • Dual-Key Indexing:                  │
                │   (attemptId + monitoringSessionId)   │
                │ • Severity Weighing (-2 to -15 pts)   │
                │ • Heartbeat Watchdog (2s/3s pings)    │
                │ • Dynamic Health & Coverage Metric    │
                └───────────────────┬───────────────────┘
                                    │
                                    ▼
                ┌───────────────────────────────────────┐
                │       TEST SUBMISSION / FINISH        │
                │ ───────────────────────────────────── │
                │ • ZERO-LEAK HARDWARE AUTO-SHUTDOWN:   │
                │   - MediaStreamTrack.stop()           │
                │   - WebRTC session close              │
                │   - Camera hardware lights turn OFF   │
                │ • Deterministic Integrity Score (0-100│
                └───────────────────────────────────────┘
```

#### Step-by-Step Proctoring Workflow

1. **Phase 1: Pre-Exam Readiness Gate**:
   - Hardware check confirms working webcam, microphone, and speakers.
   - Candidate gives explicit proctoring consent.
   - Device fingerprint and baseline facial bounding box are registered.
2. **Phase 2: QR Mobile Pairing**:
   - Desktop displays a single-use signed QR code pointing to `/assessment-mobile-join?token=...&session=...`.
   - Candidate scans with their smartphone; mobile establishes a WebRTC video uplink and Socket.IO channel.
   - Status indicators confirm dual-stream synchronization.
3. **Phase 3: Active Monitoring**:
   - **Laptop Front View**: MediaPipe tracks iris positions, head yaw/pitch, and alerts if candidate turns away from screen for >3 seconds.
   - **Mobile Side/Desk View**: YOLO inference identifies cell phones, textbooks, secondary monitors, or bystanders entering the frame.
   - **Anti-Flood & Temporal Debounce**: Anomalies must persist for $\ge 2.5\text{s}$ before triggering an event; identical violations enter a 15s cooldown.
4. **Phase 4: Zero-Leak Hardware Auto-Shutdown**:
   - The moment the candidate clicks **Submit Exam** or the countdown timer expires, the backend fires `assessment_verif:session_ended` and `monitoring:session_ended`.
   - Frontend and mobile clients call `.stop()` on every active `MediaStreamTrack`, immediately turning off physical camera indicator LEDs.

---

### Flow 7: Post-Assessment Analytics, Forensic Audits & Verification

```text
                      POST-ASSESSMENT AUDIT
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
[Scorecard Synthesis]   [Forensic Timeline]     [Certificate Generation]
- Knowledge Score       - Chronological Log     - Cryptographic Hash
- Coding Test Ratio     - Incident Thumbnails   - Public Verification QR
- Execution Efficiency  - Integrity Score %     - Verifiable at /verify/:code
```

1. **Integrity Score Calculation**: Every verified malpractice violation applies a deterministic deduction:
   $$\text{Integrity Score} = \max\left(0, 100 - \sum \text{Violation Penalties}\right)$$
2. **Dynamic Coverage Ratio**: Measures continuous camera uptime against active exam duration to ensure zero unmonitored blind spots.
3. **Cryptographic Certificate Verification**: Generated certificates embed a unique SHA-256 validation code verifiable without authentication via `/api/certificates/verify/:code`.

---

## 4. Comprehensive Directory & File Structure

### Root Directory Overview

```text
WAVEINIT_P1/
├── .github/                      # GitHub Actions CI/CD automation pipelines
│   └── workflows/
│       ├── main_waveinint.yml    # Node.js backend build & Azure App Service deploy
│       └── main_waveinit-init.yml# Python AI service build, verify & Azure deploy
├── ai-service/                   # FastAPI Python microservice (YOLO, MediaPipe, RAG, LangGraph)
├── backend/                      # Node.js + Express + Socket.IO + Sequelize REST & WebSocket API
├── database/                     # SQL database schema definitions and seed data
│   ├── schema/
│   │   └── dbscript.sql          # Core table creation definitions & constraints
│   └── seeds/                    # Development seed records
├── docs/                         # Architecture specifications, presentations & audit reports
├── frontend/                     # React 18 + Vite + TailwindCSS SPA client application
├── nginx/                        # Nginx reverse proxy and multi-server load balancer configurations
│   ├── conf.d/                   # Site virtual host configs
│   └── nginx.conf                # Main Nginx proxy, upstream & compression config
├── scripts/                      # Scale-out test harnesses, backend/frontend audit scripts
├── docker-compose.yml            # Local development orchestration (Judge0, Postgres, Redis)
├── docker-compose.production.yml # Enterprise multi-instance production stack (Nginx, 2x Nodes, AI, Redis)
├── judge0.conf                   # Execution parameters for the Judge0 sandbox
├── start-all.bat                 # 1-Click Windows development launcher (Starts AI, Backend, Frontend)
├── start-ai-service.bat          # 1-Click Python AI service launcher
├── start-clean.bat               # Clean restart script (kills stale Node processes & Vite cache)
└── README.md                     # Authoritative end-to-end platform documentation
```

---

### Frontend Architecture (`/frontend`)

The frontend is built using **React 18**, **Vite**, and **TailwindCSS**, structured around modular domains:

```text
frontend/
├── public/                       # Static public assets (Favicon, logos, sound cues)
├── src/
│   ├── api/                      # Centralized Axios HTTP client & API service endpoints
│   │   └── axiosClient.js        # Global interceptors for JWT injection & 401 refresh loops
│   │
│   ├── assets/                   # Vector graphics, brand illustrations, icons
│   │
│   ├── components/               # Atomic & composite reusable UI components
│   │   ├── common/               # Modals, buttons, spinners, alert toasts, badge pills
│   │   ├── course/               # Course catalog cards, syllabus tree, media player
│   │   ├── interview/            # Video viewports, Monaco code split pane, evaluation rubric
│   │   ├── monitoring/           # UnifiedMonitoringWidget, status badges, calibration gates
│   │   └── quiz/                 # MCQ cards, timer widget, progress bar, submission modal
│   │
│   ├── config/                   # Global frontend configuration, LAN IP helpers & constants
│   │
│   ├── contexts/                 # React Context providers for application-wide state
│   │   ├── AuthContext.jsx       # User identity, roles, active token state & session lifecycle
│   │   ├── InterviewContext.jsx  # WebRTC peer connections, room state, chat & code sync
│   │   └── ThemeContext.jsx      # Light / dark enterprise surface styling tokens
│   │
│   ├── hooks/                    # Custom lifecycle React hooks
│   │   ├── useAntiCheat.js       # Window blur, fullscreen exit, context menu & keystroke interceptors
│   │   ├── useDeviceFingerprint.js# Client hardware & canvas fingerprinting
│   │   ├── useExamTimer.js       # Server-synchronized countdown clock
│   │   └── useWebRTC.js          # Peer connection state, ICE candidate exchange & media renegotiation
│   │
│   ├── layouts/                  # Scaffold wrappers for viewports
│   │   ├── AdminLayout.jsx       # Navigation sidebar & metrics topbar for administrators
│   │   ├── DashboardLayout.jsx   # Shared layout for trainer and learner cockpits
│   │   └── ExamLayout.jsx        # Distraction-free, fullscreen lockdown exam shell
│   │
│   ├── pages/                    # Route entry points
│   │   ├── AdminDashboard.jsx    # User administration, role changes, audit log drilldown
│   │   ├── Login.jsx             # Dual-factor authentication & password recovery
│   │   ├── ParticipantCodingAttemptPage.jsx # Candidate live code assessment interface
│   │   ├── ParticipantCourses.jsx# Enrolled course library & lesson player
│   │   ├── ParticipantDashboard.jsx# Learner summary, enrolled courses & upcoming tests
│   │   ├── ParticipantQuizAttemptPage.jsx # AI quiz taking engine
│   │   ├── PreExamReadiness.jsx  # 4-Step hardware, face framing & permission gate
│   │   ├── TrainerCodingAssessmentDetails.jsx # Trainer code challenge creator & test case manager
│   │   ├── TrainerCourses.jsx    # Curriculum builder & module authoring
│   │   ├── TrainerDashboard.jsx  # Trainer metrics, cohort progress & recent submissions
│   │   ├── TrainerMonitoringDashboard.jsx # Real-time multi-candidate proctoring command center
│   │   ├── TrainerQuizDetails.jsx# AI quiz generator studio, Bloom calibration & question editor
│   │   │
│   │   ├── assessment/
│   │   │   └── AssessmentMobileJoin.jsx # QR companion mobile camera streaming page
│   │   └── interview/
│   │       ├── InterviewDashboard.jsx  # Interview scheduling, upcoming sessions & past records
│   │       ├── InterviewRoom.jsx       # Real-time WebRTC 1:1 technical interview workspace
│   │       └── MobileJoin.jsx          # Mobile camera join page for interview candidate
│   │
│   ├── proctoring/               # Core proctoring domain module
│   │   ├── ProctorContext.jsx    # Proctoring finite state machine
│   │   ├── engine/
│   │   │   └── MonitoringEngineClient.js # Client-side MediaPipe landmark inference runner
│   │   └── hooks/                # Specialized proctoring hooks
│   │
│   ├── services/                 # Business logic wrappers
│   ├── styles/                   # Design system tokens, typography & animations
│   ├── App.jsx                   # Central route declaration & role-based route guard tree
│   ├── main.jsx                  # Application bootstrap & DOM root render
│   └── vite.config.js            # Vite build configuration, HTTPS certificates & reverse proxy
├── package.json
└── tailwind.config.js
```

---

### Backend Architecture (`/backend`)

The backend is constructed with **Node.js**, **Express**, **Socket.IO**, and **Sequelize ORM**. The Azure workflow uses Node.js 22, while the backend container currently uses Node.js 20:

```text
backend/
├── src/
│   ├── app.js                    # Express application entry point, route mounting & socket init
│   │
│   ├── config/                   # System infrastructure connections
│   │   ├── db.js                 # Sequelize database instance & connection pool
│   │   ├── instance.js           # Multi-instance Azure scale-out identity manager
│   │   ├── paths.js              # Storage path resolvers (shared Azure storage support)
│   │   ├── redis.js              # Redis client, distributed locking & fallback in-memory provider
│   │   └── socket.js             # Socket.IO server initialization & Redis pub/sub adapter
│   │
│   ├── controllers/              # Request handlers & HTTP response formatting
│   │   ├── adminController.js    # System administration, user management & metrics
│   │   ├── aiQuizController.js   # AI quiz prompt dispatch, RAG document upload & question approval
│   │   ├── assessmentVerificationController.js # QR token generation & mobile pairing state
│   │   ├── authController.js     # User registration, login, token refresh & logout
│   │   ├── codingAssessmentController.js # Coding problem CRUD & test submission grading
│   │   ├── interviewController.js# Interview scheduling, WebRTC session tokens & evaluations
│   │   ├── monitoringController.js# Proctoring session start/end, heartbeat & live violation ingestion
│   │   └── proctoringController.js# Forensic audit reports, violation drilldown & risk scoring
│   │
│   ├── jobs/                     # Background cron tasks (Heartbeat reap, stale session cleanup)
│   │
│   ├── judge/                    # Isolated code execution sandbox engine
│   │   ├── dockerExecutor.js     # Containerized Docker execution sandbox
│   │   ├── engine.js             # Judge execution orchestrator & timeout watchdog
│   │   ├── languageConfig.js     # Compilers, runtimes & command definitions (Python, C++, Java, JS)
│   │   ├── outputComparator.js   # Stdio whitespace, newline & float tolerance matching
│   │   └── verdicts.js           # AC, WA, TLE, MLE, CE, RE verdict definitions
│   │
│   ├── middleware/               # Express request processing middleware
│   │   ├── auth.js               # JWT verification & claims population (`req.user`)
│   │   ├── rateLimiter.js        # Redis-backed sliding window rate limiters
│   │   ├── roleCheck.js          # Role-based access control assertions
│   │   └── upload.js             # Multer file upload handlers (Cloudinary / disk storage)
│   │
│   ├── models/                   # Sequelize ORM schema definitions (96+ relational models)
│   │   ├── index.js              # Model registry, foreign key associations & hooks
│   │   ├── User.js               # User accounts, hashed passwords, roles & avatar
│   │   ├── Course.js             # Courses, categories, thumbnails & trainer allocations
│   │   ├── Lesson.js             # Modular units, order indexes, video URLs & content
│   │   ├── AIQuiz.js             # Quiz definition, time limit, passing marks & anti-cheat flags
│   │   ├── AIQuestion.js         # Questions, Bloom's level, explanations, point weights
│   │   ├── CodingAssessment.js   # Coding test containers & scheduling rules
│   │   ├── CodingProblem.js      # Problem statements, input/output specs, memory/time limits
│   │   ├── CodingTestCase.js     # Public and hidden test cases (stdin, expected stdout)
│   │   ├── CodingSubmission.js   # Submitted candidate code, execution runtime & verdicts
│   │   ├── Interview.js          # Scheduled technical interviews
│   │   ├── InterviewSession.js   # Active WebRTC interview sessions & timings
│   │   ├── MonitoringSession.js  # Candidate proctoring sessions, device info & status
│   │   ├── MonitoringEvent.js    # Logged violations, event types, confidence & timestamps
│   │   └── ProctoringReport.js   # Aggregated integrity scores, coverage %, and trainer notes
│   │
│   ├── queues/                   # Asynchronous background job queues (BullMQ / Redis)
│   │
│   ├── routes/                   # RESTful API route definitions (32 route modules)
│   │   ├── adminRoutes.js        # /api/admin
│   │   ├── aiQuizRoutes.js       # /api/ai-quiz
│   │   ├── authRoutes.js         # /api/auth
│   │   ├── codingAssessmentRoutes.js # /api/coding
│   │   ├── interviewRoutes.js    # /api/interviews
│   │   ├── monitoringRoutes.js   # /api/monitoring
│   │   ├── participantCourseRoutes.js # /api/participant
│   │   ├── proctoringRoutes.js   # /api/proctoring & /api/proctor
│   │   └── trainerRoutes.js      # /api/trainer
│   │
│   ├── security/                 # Threat detection, input sanitization & AES-256 crypto
│   │   └── threatDetector.js     # SQLi, XSS, Path Traversal & prototype pollution detectors
│   │
│   ├── services/                 # Core business logic
│   │   ├── aiService.js          # Gateway client to the Python FastAPI microservice
│   │   ├── assessmentVerificationService.js # Mobile pairing state machine & auto-shutdown coordinator
│   │   ├── codingExecutionService.js # Problem execution dispatcher to Judge0/Docker
│   │   ├── monitoringService.js  # Unified violation scoring & temporal debouncer
│   │   └── proctoringReportService.js # Dynamic coverage calculation & report compilation
│   │
│   ├── socket/                   # Real-time WebSocket event handlers
│   │   ├── assessmentVerificationEvents.js # Mobile QR join & camera streaming events
│   │   ├── crossInstance.js      # Multi-instance Redis event broadcaster
│   │   ├── interviewEvents.js    # WebRTC SDP signaling, ICE relay, chat & code sync
│   │   └── events/
│   │       ├── monitoringEvents.js# Real-time violation broadcast to trainer dashboards
│   │       └── proctorEvents.js  # Session heartbeats & lockdown events
│   │
│   ├── utils/                    # Shared helpers (Loggers, IP normalization, crypto, QR)
│   └── workers/                  # Background worker processes (Code sandbox & AI ingestion)
├── package.json
└── Dockerfile
```

---

### AI Service Architecture (`/ai-service`)

The AI Microservice is built with **FastAPI**, **Python 3.11**, **PyTorch**, **YOLO11s/v8**, **MediaPipe**, and **LangGraph**:

```text
ai-service/
├── inference/                    # Computer vision & neural network inference engines
│   ├── mobile_composition.py     # Camera aspect ratio & framing verification
│   ├── proctoring_detector.py    # MediaPipe Face Landmarker & Upper-Body Pose engine
│   └── yolo_detector.py          # YOLO11s/v8 object detection engine (phones, notes, screens)
│
├── models/                       # Model weights & task bundles
│   ├── face_landmarker.task      # MediaPipe 468-point 3D landmark model
│   └── yolov8n.pt                # YOLO neural network weights
│
├── prompts/                      # Authoritative LLM prompt templates
│   └── prompt_templates.py       # Question generation, Bloom's categorization & rubric templates
│
├── rag/                          # Retrieval-Augmented Generation subsystem
│   ├── chunking.py               # Token-aware text chunker (sliding window overlap)
│   ├── extraction.py             # Document parsers for PDF, DOCX, PPTX, XLSX, TXT
│   ├── embeddings.py             # SentenceTransformer embeddings (`bge-large-en-v1.5`)
│   ├── orchestrator.py           # Vector retrieval, context assembly & limit bounding
│   └── vector_store.py           # FAISS index storage, similarity search & persistence
│
├── services/                     # Business logic and external LLM orchestration
│   ├── ai_provider.py            # Unified LLM client (Gemini 2.5 Flash, Groq, OpenAI fallback)
│   ├── course_structure.py       # AI curriculum & syllabus synthesizer
│   ├── duplicate_remover.py      # Embedding cosine similarity duplicate filter
│   └── json_validator.py         # Pydantic schema validation & json-repair sanitization
│
├── coding_workflow.py            # 9-Node LangGraph dynamic prompt-first coding generator
├── main.py                       # FastAPI application, route declarations, health & CORS
├── python_sandbox_runner.py      # Subprocess execution sandbox for reference solution validation
├── requirements.txt              # Python dependency definitions
├── Dockerfile                    # Containerization definition
└── startup.sh                    # Linux production startup script
```

---

### Database, Nginx & DevOps Modules

```text
WAVEINIT_P1/
├── database/
│   └── schema/dbscript.sql       # Relational SQL schema DDL (DDL for tables, indexes, constraints)
│
├── nginx/
│   ├── conf.d/default.conf       # Upstream pool load-balancing, rate-limiting zones, SSL config
│   └── nginx.conf                # Gzip compression, keepalive parameters, client body limits
│
└── scripts/
    ├── azure-scaleout-test.js    # Concurrency test suite simulating multi-instance scale-out
    ├── deep_backend_audit.js     # Route availability and database schema integrity verification
    └── scaleout-test.js          # Load-testing script for WebSocket room broadcasts
```

---

## 5. Technology Stack Matrix

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 (Vite 5) | Component architecture, responsive client-side SPA |
| **Styling & Design** | TailwindCSS v4, Framer Motion | Modern enterprise UI design system, fluid transitions |
| **Code Editor** | Monaco Editor (`@monaco-editor/react`) | In-browser IDE for coding tests & live technical interviews |
| **Rich Text Editor** | TipTap (`@tiptap/react`) | Rich-text course lesson authoring and documentation |
| **Realtime Client** | Socket.IO Client 4.7, native WebRTC | WebSocket telemetry, WebRTC peer-to-peer audio/video mesh |
| **Backend Runtime** | Node.js 20/22 | Node 20 container base and Node 22 Azure CI |
| **API Framework** | Express 4.18 | RESTful route orchestration, security & authentication middleware |
| **Realtime Server** | Socket.IO 4.7 (`@socket.io/redis-adapter`) | Multi-instance signaling, violation streams, live chat |
| **Database ORM** | Sequelize 6.35 | Relational mapping, migration management, model validation |
| **Primary Relational DB** | MySQL 8.0 / PostgreSQL 14+ | Relational schema storage for users, courses, submissions |
| **Cache & Pub/Sub** | Redis 7 (Alpine) | Distributed session locks, Socket.IO message fanout, queues |
| **Background Jobs** | BullMQ 5.79 | Asynchronous execution queues for long-running AI/code tasks |
| **AI Microservice** | Python 3.11, FastAPI 0.115, Uvicorn | High-performance asynchronous AI and vision microservice |
| **Object Detection** | Ultralytics YOLO11s / YOLOv8 | Real-time candidate environment object detection (phones, notes) |
| **Facial & Gaze Mesh** | Google MediaPipe 0.10.14 | 468-point 3D facial mesh, iris vectors, head pose telemetry |
| **LLM Orchestration** | LangGraph 0.2, LangChain | 9-Node state graph for prompt-first coding assessment generation |
| **Generative AI** | Google Gemini 2.5 Flash, Groq, OpenAI | AI quiz synthesis, coding challenge creation, review generation |
| **Vector Database / RAG**| FAISS (`faiss-cpu`), SentenceTransformers | Local semantic document chunk retrieval & context vector search |
| **Code Execution** | Judge0 API / Containerized Docker Sandbox | Multi-language isolated compilation and stdio test execution |
| **Reverse Proxy** | Nginx Alpine | Load balancer, SSL termination, static proxy, rate-limiting |
| **CI/CD Deployment** | GitHub Actions, Azure Web Apps | Automated build, test, and zero-downtime deployment pipelines |

---

## 6. Environment Variables & Configuration

### 1. Backend Configuration (`backend/.env`)

```ini
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5174
ALLOWED_ORIGINS=http://localhost:5174,http://localhost:5173,http://localhost:3000

# Database Credentials
DB_DIALECT=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=training_db
DB_USER=root
DB_PASSWORD=your_mysql_password
# Alternatively, use DATABASE_URL for Postgres / Cloud providers:
# DATABASE_URL=postgresql://user:password@host:5432/dbname

# Security & Authentication
JWT_SECRET=generate_with_node_-e_"console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_REFRESH_SECRET=generate_with_node_-e_"console.log(require('crypto').randomBytes(64).toString('hex'))"
PROCTOR_ENC_KEY=32_byte_hex_string_for_aes_256_gcm_session_encryption

# AI Service Microservice Link
AI_SERVICE_URL=http://localhost:8000
GEMINI_API_KEY=your_gemini_api_key
GEMINI_API_KEY2=your_fallback_gemini_api_key

# Redis Configuration (Optional for single-instance, required for scale-out)
# REDIS_URL=redis://localhost:6379
RUN_EMBEDDED_WORKERS=true
MONITORING_VIDEO_STORAGE=false

# Media Storage (Optional Cloudinary setup)
CLOUD_NAME=your_cloudinary_name
API_KEY=your_cloudinary_key
API_SECRET=your_cloudinary_secret

# SMTP Email Configuration (Password resets)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

### 2. Python AI Service Configuration (`ai-service/.env`)

```ini
# Core LLM Keys
GEMINI_API_KEY=your_gemini_api_key
GEMINI_API_KEY2=your_backup_gemini_api_key
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

# Service & Models
AI_SERVICE_PORT=8000
GEMINI_MODEL=gemini-3.5-flash-lite
YOLO_MODEL_PATH=models/yolov8n.pt

# RAG & Embeddings
EMBEDDING_MODEL=BAAI/bge-large-en-v1.5
AI_RETRIEVAL_TOP_K=5
AI_CHUNK_SIZE_TOKENS=650
AI_CHUNK_OVERLAP_TOKENS=100
FAISS_INDEX_DIR=vector_store

# Backend Link
BACKEND_URL=http://localhost:3001
PROCTORING_SESSION_MAX_IDLE_SECONDS=900
```

### 3. Frontend Configuration (`frontend/.env`)

```ini
# Base API URL (Leave empty for dynamic LAN IP resolution, or set explicitly)
VITE_API_URL=http://localhost:3001

# QR Code Mobile Pairing Resolution (Sets the address candidate phones connect to)
VITE_PUBLIC_HOST=192.168.1.100
VITE_PUBLIC_PORT=5174
VITE_PUBLIC_PROTOCOL=http

# Storage configuration
VITE_RECORD_MONITORING_VIDEO=false
```

---

## 7. Installation & Local Development Guide

### Prerequisites

- **Node.js**: `v18.0.0` or higher (`v22.x` recommended)
- **Python**: `v3.10` or `v3.11` (with `pip` and virtual environment support)
- **Database**: MySQL `8.0+` or PostgreSQL `14+`
- **Docker**: (Optional) For running Judge0 code execution sandboxes and Redis

---

### Option A: 1-Click Startup (Windows)

The repository provides automated batch scripts for Windows development:

```powershell
# 1. Open a terminal in the project root and launch all services:
.\start-all.bat
```

*`start-all.bat` installs missing dependencies and starts the FastAPI service, Node backend, and Vite frontend in separate consoles. The script still prints port 5173 in its status text, but the current Vite configuration listens on port 5174.*

To perform a clean restart that releases hanging ports and purges Vite cache:

```powershell
.\start-clean.bat
```

---

### Option B: Manual Multi-Terminal Setup (Cross-Platform)

#### Terminal 1: Python AI Microservice

```bash
cd ai-service

# Create and activate Python virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Run the FastAPI server
python main.py
# AI microservice starts on http://127.0.0.1:8000
```

#### Terminal 2: Node.js Backend

```bash
cd backend

# Install dependencies
npm install

# Run database schema migration (if first time)
npm run migrate:ai-mentor-audit # or import database/schema/dbscript.sql directly

# Start in development mode with nodemon
npm run dev
# Backend API & WebSocket server starts on http://localhost:3001
```

#### Terminal 3: React Frontend Client

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
# Client interface: http://localhost:5174 by default.
# It uses https://localhost:5174 when local certificate files are configured.
```

#### Terminal 4 (Optional): Judge0 Sandbox Engine

```bash
# Start Judge0 multi-language code execution engine
docker-compose up -d
# Judge0 API runs on port 2358
```

---

## 8. Production Deployment & Cloud Architecture

WAVEINIT LMS includes deployment paths for **Microsoft Azure App Service**, **Render**, **Vercel-compatible frontend hosting**, and container-based environments. The supplied Compose files define local and production topologies; Kubernetes or Docker Swarm manifests are not included.

```text
                           [ AZURE TRAFFIC MANAGER / FRONT DOOR ]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [ Azure App Service: Node ]                 [ Azure App Service: Python ]
             Name: `waveinint`                           Name: `waveinit-init`
CI: Node.js 22 / Container: Node.js 20       Runtime: Python 3.11
             Handles: REST APIs, WebSockets              Handles: YOLOv8, MediaPipe, RAG
                       │                                           │
                       └─────────────────────┬─────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [ Azure Database for MySQL ]                [ Azure Cache for Redis ]
             High-Availability Flexible Server           Distributed Socket.IO Mesh
```

### GitHub Actions CI/CD Automation

The repository includes automated deployment workflows in `.github/workflows/`:

1. **`.github/workflows/main_waveinint.yml`**:
   - Triggers on changes to `backend/**` or the backend workflow.
   - Runs linting and test suites (`npm run test --if-present`).
   - Packages Node artifact and deploys directly to the **Azure Web App (`waveinint`)** using OIDC authentication.
2. **`.github/workflows/main_waveinit-init.yml`**:
   - Triggers on changes to `ai-service/**` or the AI workflow.
   - Validates Python 3.11 requirements, verifies FastAPI import integrity.
   - Builds a source-only ZIP, enables the Azure Oryx remote build, deploys it with Azure CLI, configures Gunicorn/Uvicorn startup, and probes the live `/health` endpoint.

### Other deployment files

- `render.yaml` defines Render services for the backend and frontend.
- `frontend/vercel.json` provides the SPA fallback rewrite required by Vercel-compatible static hosting.
- `backend/Dockerfile` packages the Express API, and `ai-service/Dockerfile` packages the FastAPI service.
- `docker-compose.production.yml` runs Nginx, two backend instances, Redis, code and AI workers, and the AI service.

### Multi-Instance Scale-Out Considerations

When running on scaled-out clusters (e.g., Azure B2 tier with multiple instances):

- **Shared Storage**: Mounts an Azure Files SMB share at `SHARED_STORAGE_PATH` (`/app/storage` or `D:\home\data`) so all instances access identical uploaded course materials and avatars.
- **Distributed State**: Socket.IO connections synchronize events across instances using the `@socket.io/redis-adapter`.
- **Distributed Locking**: Concurrency bottlenecks (such as code evaluation queues) utilize Redis-backed mutexes (`DistributedLock.js`) with an automatic fallback to database locks.

---

## 9. Core API & WebSocket Channel Catalog

### REST API Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | User authentication; returns JWT access & refresh tokens |
| `POST` | `/api/auth/refresh` | Public | Obtains a new access token via valid refresh token |
| `GET` | `/api/admin/trainers` | Admin | Fetches the paginated trainer directory with filters |
| `POST` | `/api/trainer/courses` | Trainer/Admin | Creates a new curriculum container with metadata |
| `POST` | `/api/ai-quiz/generate-from-prompt` | Trainer/Admin | Generates a quiz from a topic or prompt |
| `POST` | `/api/coding/assessments` | Trainer/Admin | Creates a coding challenge assessment with test cases |
| `POST` | `/api/coding/participant/run` | Participant | Executes candidate code against public test cases |
| `POST` | `/api/coding/participant/submit/:attemptId` | Participant | Submits an assessment attempt for final grading |
| `GET` | `/api/interviews` | Authenticated | Lists user's scheduled technical interview sessions |
| `POST` | `/api/interviews/create`| Trainer/Admin | Schedules a new 1:1 technical interview with room tokens |
| `POST` | `/api/monitoring/sessions/start`| Participant | Initializes a secure monitoring session |
| `POST` | `/api/monitoring/sessions/:id/events` | Participant | Ingests client and AI monitoring events |
| `POST` | `/api/assessment-verification/initiate` | Participant | Creates the mobile-camera verification session and QR data |
| `GET` | `/api/proctoring/reports/:attemptId` | Trainer/Admin | Retrieves the attempt proctoring report |
| `GET` | `/api/certificates/verify/:code`| Public | Cryptographic verification of completion certificate |

---

### WebSocket Event Namespaces (`Socket.IO`)

| Channel / Event | Direction | Payload Description |
| :--- | :--- | :--- |
| `monitoring:join` | Client ➔ Server | Joins the laptop or mobile client to a monitoring room |
| `monitoring:event` | Client ➔ Server | Persists and broadcasts a monitoring event |
| `monitoring:end_session` | Client ➔ Server | Ends the monitoring session and notifies connected clients |
| `assessment_verif:frame` | Mobile ➔ Server | Relays a mobile verification camera frame |
| `offer`, `answer`, `ice-candidate` | Peer ⇄ Peer | Relays WebRTC negotiation for interview rooms |
| `code-sync` | Peer ⇄ Peer | Synchronizes Monaco editor content |
| `chat-message` | Peer ⇄ Peer | Exchanges interview-room chat messages |

---

## 10. Troubleshooting & Operational FAQ

### Common issues

#### Q1: Port 3001 or 5174 is already in use

- **Windows**: Run `.\start-clean.bat` or run:

  ```powershell
  npx kill-port 3001 5174 8000
  ```

- **Linux/macOS**:

  ```bash
  lsof -ti:3001,5174,8000 | xargs kill -9
  ```

#### Q2: Mobile phone cannot connect via the QR code

- Ensure the candidate's mobile device and desktop are on the **same local Wi-Fi / LAN network**.
- Verify that `VITE_PUBLIC_HOST` in `frontend/.env` contains your machine's actual LAN IP address (e.g. `192.168.1.X`, find via `ipconfig` or `ifconfig`), not `localhost`.

#### Q3: WebRTC video/audio fails to connect during 1:1 interviews

- In symmetric NAT or restrictive corporate firewall environments, direct STUN traversal may fail. Configure a TURN server (e.g., `coturn`) in `backend/.env` using `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL`.

#### Q4: Python AI service crashes on PyTorch / MediaPipe installation

- Ensure you are running a 64-bit Python version (`python --version` should be `3.10.x` or `3.11.x`).
- If you lack a dedicated GPU, install the CPU-only build of PyTorch:

  ```bash
  pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu
  ```

#### Q5: Camera lights stay on after submitting an assessment

- Verify that the browser is allowing WebSocket disconnect events. The platform's `MonitoringEngineClient.js` and `AssessmentMobileJoin.jsx` automatically execute `.stop()` on every active `MediaStreamTrack` upon receiving the `monitoring:session_ended` event or component unmount.

#### Q6: Azure reports `No module named 'uvicorn'`

- Confirm the deployment ZIP places `requirements.txt` and `main.py` at its root.
- Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and `ENABLE_ORYX_BUILD=true` so Azure installs the Python dependencies.
- Remove conflicting `WEBSITE_RUN_FROM_PACKAGE` and `WEBSITE_RUN_FROM_ZIP` settings before the source deployment.
- Confirm the Oryx deployment log shows a successful dependency installation and build manifest.
- Run the startup command from the directory containing `main.py`:

  ```bash
  python -m gunicorn -k uvicorn.workers.UvicornWorker \
    --bind=0.0.0.0:8000 main:app --timeout 120
  ```

---

## 11. Testing & Health Checks

### Repository checks

```bash
# Backend Jest suites
cd backend
npm test
npm run test:routes

# Frontend lint and production build
cd ../frontend
npm run lint
npm run build

# AI-service unittest suite
cd ../ai-service
python -m unittest discover -s tests -p "test_*.py"
```

Individual test modules can be run directly when iterating on a focused change.

### Local health endpoints

| Service | Endpoint | Purpose |
| :--- | :--- | :--- |
| Backend | `http://localhost:3001/health` | API process and database state |
| Backend | `http://localhost:3001/api/health` | API health alias |
| Backend | `http://localhost:3001/api/ai/health` | Backend-to-AI connectivity |
| AI service | `http://localhost:8000/health` | FastAPI process and provider state |
| AI service | `http://localhost:8000/ready` | AI provider and inference-engine readiness |
| AI service | `http://localhost:8000/docs` | Interactive OpenAPI documentation |

---

## 12. Security Guidance

- Never commit `.env` files, API keys, database passwords, JWT secrets, SMTP credentials, or Azure credentials.
- Use separate, high-entropy values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Restrict production CORS configuration to known frontend origins.
- Use HTTPS for authentication, camera access, QR pairing, WebRTC, assessments, and uploaded content.
- Keep the database, Redis, Judge0, and Docker daemon endpoints off the public internet.
- Mount the Docker socket only on trusted code-execution workers with additional sandbox controls.
- Store production secrets in Azure App Settings, GitHub Actions secrets, or the hosting provider's secret manager.
- Define retention and access policies for recordings, screenshots, proctoring reports, audit logs, and uploaded participant documents.

---

## 13. Additional Documentation

- [AI service recovery](docs/AI_SERVICE_RECOVERY.md)
- [Shared AI provider configuration](docs/shared-ai-configuration.md)
- [Interview module](docs/INTERVIEW_MODULE.md)
- [Mobile camera verification report](docs/MOBILE_CAMERA_VERIFICATION_REPORT.md)
- [AI generation and mentor audit](docs/AI_GENERATION_AND_MENTOR_AUDIT.md)
- [Assessment monitoring parity](docs/ASSESSMENT_MONITORING_PARITY.md)
- [Design tokens](docs/design-tokens.md)
- [Client presentation deck](docs/WAVE_INIT_LMS_Client_Presentation_Deck.md)

The source code and current environment templates remain authoritative when
runtime behavior, ports, variables, or deployment workflows change.

---

## License & Intellectual Property

Copyright © 2026 **WAVEINIT LMS Platform**. All rights reserved.  
*Confidential and Proprietary. Designed for Enterprise Learning Management, Algorithmic Evaluation, and Automated Assessment Integrity.*
