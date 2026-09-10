# Third-Party Data Processing Inventory & Data Flow Architecture

**Application:** WaveInit LMS  
**Document Purpose:** Technical Inventory of External Subprocessors & Data Transfers (GDPR Article 28 / Article 30 Readiness)  
**Last Updated:** September 2026  
**Status:** Requires Organizational & Legal / DPO Confirmation on Contractual Terms  

---

## 1. Executive Summary

This document catalogues all external third-party services and APIs that receive, store, or process user data within the WaveInit LMS ecosystem. For each provider, we document the technical data payload, operational justification, data sensitivity classification, retention controls, and data protection contractual requirements (Data Processing Agreements and Standard Contractual Clauses).

> [!IMPORTANT]
> **Legal Notice:** Antigravity and the engineering team have verified the technical payload and data transmission paths in the codebase. Contractual status (e.g. executed DPAs, EU-US Data Privacy Framework certifications, or signed SCCs) cannot be fabricated and must be formally verified by the organization's legal counsel or Data Protection Officer (DPO).

---

## 2. Comprehensive Subprocessor Inventory

### 2.1 Google Workspace / Gmail SMTP
* **Service Type:** Transactional Email Delivery Provider
* **Provider:** Google LLC (USA / Global infrastructure)
* **What Data is Sent:**
  * Recipient email address
  * Recipient full name
  * System generated credentials (temporary password, participant ID)
  * One-Time Passwords (OTP) for password resets
  * Training program titles
* **Why it is Sent (Purpose):** To deliver essential account authentication tokens, initial login credentials upon registration approval, and self-service password reset codes.
* **Personal Data Included:** Yes (Direct PII: Name, Email, Temporary Passwords).
* **Configuration & Retention Controls:** Controlled via `backend/.env` (`GMAIL_USER`, `GMAIL_APP_PASS`). Google Workspace log retention applies to message transit logs (typically 30–60 days in Google Admin audit logs). Plaintext recipient emails in server logs are masked (`s***@domain.com`).
* **International Data Transfers:** Data may be routed through Google's global mail servers (including USA).
* **Contractual Status:**
  * *DPA Required:* Yes.
  * *SCCs / Transfer Mechanism Required:* Yes.
  * *Status:* **[Requires Legal / DPO Confirmation of executed Google Workspace Data Processing Amendment]**
* **Privacy Policy Disclosure:** Yes (Disclosed in Section 09 of Privacy Policy).

---

### 2.2 Google Gemini API
* **Service Type:** Generative Artificial Intelligence (LLM)
* **Provider:** Google LLC / Google Cloud Platform
* **What Data is Sent:**
  * Course titles, lesson topics, and syllabus material summaries
  * Participant code snippets for coding hint generation (`codingAiHelpController.js`)
  * Assessment problem descriptions
* **Why it is Sent (Purpose):**
  * Automated generation of multiple-choice and coding assessment questions from training curricula.
  * Real-time coding assistance and syntax explanation for enrolled learners.
* **Personal Data Included:** Pseudonymous/Incidental (Learner code submissions and question context; user identifiers are stripped before calling the API).
* **Configuration & Retention Controls:** Configured via `GEMINI_API_KEY`. Under Google Cloud Enterprise API terms, data submitted via API is not used to train base foundation models.
* **International Data Transfers:** Global / USA data centers.
* **Contractual Status:**
  * *DPA Required:* Yes (Google Cloud Platform DPA).
  * *Status:* **[Requires Confirmation of Google Cloud Enterprise DPA and model training opt-out settings]**
* **Privacy Policy Disclosure:** Yes (Disclosed in Section 08 & 09).

---

### 2.3 Groq API (Alternative / Fast LLM Inference)
* **Service Type:** High-Performance LLM Cloud Inference
* **Provider:** Groq, Inc. (USA)
* **What Data is Sent:**
  * Lesson content and documentation for quiz generation
  * Coding problem inputs and participant queries
* **Why it is Sent (Purpose):** Low-latency question generation and real-time coding tutoring.
* **Personal Data Included:** Minimal / Technical code text.
* **Configuration & Retention Controls:** Configured via `GROQ_API_KEY`. Ephemeral inference; inputs are not persisted beyond request processing window according to standard Groq API privacy terms.
* **Contractual Status:**
  * *DPA Required:* Yes.
  * *Status:* **[Requires Legal / DPO Confirmation of Groq Enterprise DPA]**
* **Privacy Policy Disclosure:** Yes.

---

### 2.4 Judge0 API
* **Service Type:** Remote Sandboxed Code Execution Engine
* **Provider:** Self-hosted instance OR Judge0 Cloud (Herman Zvonimir Došilović / Global)
* **What Data is Sent:**
  * Participant-submitted source code in supported languages (Python, JavaScript, Java, C++, Go, etc.)
  * Standard input (`stdin`) test cases
  * Expected outputs
* **Why it is Sent (Purpose):** Sandboxed compilation, execution, unit testing, and benchmarking of student code without executing untrusted code directly on the core application server.
* **Personal Data Included:** None directly (Only user-written code; user identity, email, or IDs are not transmitted to Judge0).
* **Configuration & Retention Controls:** Configured via `JUDGE0_API_URL` and `judge0.conf`. Submissions in Judge0 are transient and purged after status poll completion.
* **Contractual Status:**
  * *Status:* If self-hosted via `docker-compose.yml`, no third-party transfer occurs (internal processing). If using external Judge0 cloud API, a vendor DPA is **[Required — Confirm with DPO]**.
* **Privacy Policy Disclosure:** Yes (Disclosed in Section 09).

---

### 2.5 Cloudinary (Optional Media CDN)
* **Service Type:** Cloud Media Management & CDN
* **Provider:** Cloudinary Ltd. (USA / Israel / Global CDN via Fastly/AWS)
* **What Data is Sent:**
  * Public user avatar images
  * Course promotional banner images
* **Why it is Sent (Purpose):** Image resizing, optimization, and content delivery caching.
* **Personal Data Included:** Yes (User photographs / avatars where uploaded). Sensitive files (resumes, certificates, proctoring screenshots, video recordings) are **never** uploaded to Cloudinary; they are strictly routed to the private authenticated backend storage.
* **Configuration & Retention Controls:** Controlled via `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
* **Contractual Status:**
  * *DPA Required:* Yes (Standard Cloudinary Data Processing Addendum available).
  * *Status:* **[Requires Legal / DPO Confirmation if Cloudinary is active in production]**
* **Privacy Policy Disclosure:** Yes (Disclosed in Section 09).

---

### 2.6 Cloud Infrastructure & Hosting Providers
* **Service Type:** Application Hosting, Database & Redis
* **Providers:**
  * Azure App Service / Virtual Machines (Microsoft Corporation)
  * Aiven / Neon / Supabase (Managed PostgreSQL / MySQL)
  * Upstash / Redis Labs (Multi-instance caching & rate limiting)
* **What Data is Sent:** Complete application database, persistent uploads, and session caches.
* **Security Requirements:**
  * Strict database TLS with certificate chain validation (`rejectUnauthorized: true`, `DB_CA_CERT`).
  * Redis TLS and in-transit encryption.
  * Encrypted disks at rest (AES-256).
* **Contractual Status:**
  * *Status:* **[Requires Confirmation of Enterprise Hosting Agreements and Cloud DPAs]**

---

## 3. Data Transfer Decision Matrix

| Vendor / Service | Personal Data Transferred | Processing Location | Transfer Mechanism | Legal / DPO Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **Google Gmail (SMTP)** | Name, Email, Credentials, OTPs | Global / USA | EU-US DPF / SCCs | Confirm Workspace DPA |
| **Google Gemini API** | Code snippets, Course materials | USA / Global | SCCs / Cloud DPA | Verify Enterprise API terms |
| **Groq API** | Technical code, Prompt text | USA | SCCs | Execute Vendor DPA |
| **Judge0 API** | Source code only | Self-hosted or Cloud | N/A if self-hosted | Confirm self-hosted deployment |
| **Cloudinary** | Avatars, Course banners | Global CDN | SCCs / DPA | Verify if enabled in production |
| **Database (Aiven/Azure)**| Full LMS database | Selected Region | Enterprise Cloud DPA | Confirm designated EU/local region |

---

## 4. Operational Checklist for DPO / Legal Counsel

1. [ ] Confirm corporate Data Controller entity name and formal registered address in `frontend/src/pages/PrivacyPolicy.jsx`.
2. [ ] Appoint and publish official Data Protection Officer (DPO) contact email (`dpo@waveinit.internal`).
3. [ ] Verify that Google Workspace Data Processing Amendment has been electronically countersigned.
4. [ ] Ensure Cloudinary media storage is restricted to non-sensitive assets and confirm whether self-hosted or cloud Judge0 is active.
5. [ ] Review retention defaults (`retentionConfig.js`) against local academic or statutory accreditation recordkeeping obligations.
