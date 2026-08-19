# WAVEINIT Enterprise LMS Platform

A comprehensive enterprise Learning Management System featuring real-time AI proctoring, AI quiz generation, coding assessments, interactive one-on-one technical interviews with WebRTC and dual-camera QR companion support.

---

## Repository Structure

```text
feedWeb/
├── frontend/             # React + Vite + TailwindCSS single page application
│   ├── src/
│   │   ├── api/          # Centralized REST API client
│   │   ├── components/   # Reusable UI components (Modals, Tables, Cards, Inputs)
│   │   ├── contexts/     # Global React contexts (Theme, Interview Sessions)
│   │   ├── hooks/        # Shared custom React hooks
│   │   ├── layouts/      # Dashboard, Auth, Exam, and Toolbar layouts
│   │   ├── pages/        # Route entry-point pages
│   │   ├── proctoring/   # Unified proctoring module (YOLO, MediaPipe, WebRTC)
│   │   ├── services/     # Frontend client services (Auth, YOLO, Profile)
│   │   ├── styles/       # Design system and module CSS stylesheets
│   │   └── utils/        # Helper utilities and data formatters
│   └── package.json
│
├── backend/              # Node.js + Express + Socket.IO + MySQL backend
│   ├── database/         # Database migrations
│   ├── scripts/          # Database and migration utilities
│   ├── src/
│   │   ├── config/       # Database, Cloudinary, Mailer, and Socket configs
│   │   ├── controllers/  # API route handlers
│   │   ├── jobs/         # Background cron jobs and session expirations
│   │   ├── judge/        # Code execution engine & Docker sandbox judge
│   │   ├── middleware/   # JWT auth, role validation, rate limiters, uploads
│   │   ├── models/       # Sequelize ORM database models
│   │   ├── queues/       # Asynchronous task queues
│   │   ├── routes/       # Express route definitions
│   │   ├── security/     # Session tokens, CSRF, audit loggers, validators
│   │   ├── services/     # Core business logic & proctoring coordinator
│   │   ├── socket/       # Socket.IO event handlers (Proctor, Interview, Live)
│   │   ├── utils/        # Formatting, crypto, and QR code generators
│   │   └── workers/      # Submission worker processes
│   └── package.json
│
├── ai-service/           # FastAPI Python microservice (YOLOv8, MediaPipe, RAG)
│   ├── inference/        # YOLOv8 & MediaPipe real-time inference engines
│   ├── models/           # Authoritative model weights (yolov8n.pt, MediaPipe tasks)
│   ├── prompts/          # AI prompt templates
│   ├── rag/              # FAISS vector store, embeddings, extraction, chunking
│   ├── services/         # Gemini client, AI quiz generator, validators
│   ├── main.py           # FastAPI application entry point
│   └── requirements.txt
│
├── database/             # Schema definitions and seed data
│   ├── schema/           # SQL schema definitions
│   └── seeds/            # Initial development seed data
│
├── docs/                 # System architecture and workflow specifications
├── scripts/              # Automated testing and auxiliary scripts
├── docker-compose.yml    # Container orchestration
├── start-all.bat         # Unified startup script
└── start-ai-service.bat  # AI microservice startup script
```

---

## Quick Start

### 1. Start AI Microservice
```powershell
.\start-ai-service.bat
```
*(Runs FastAPI on http://127.0.0.1:8000)*

### 2. Start Backend & Frontend
```powershell
.\start-all.bat
```
*(Backend on http://localhost:3001, Frontend on https://localhost:5174)*
