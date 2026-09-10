import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, Eye, FileText, Server, AlertTriangle, CheckCircle2, ChevronRight, Cookie } from 'lucide-react';

export default function PrivacyPolicy() {
  const handleOpenCookieSettings = () => {
    window.dispatchEvent(new CustomEvent('open_cookie_preferences'));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-teal-500 selection:text-slate-950">
      {/* Header / Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">WaveInit LMS</span>
              <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-slate-800 text-teal-400 border border-slate-700 font-mono">
                Privacy Architecture
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={handleOpenCookieSettings}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 text-xs font-medium"
            >
              <Cookie className="w-3.5 h-3.5 text-teal-400" /> Cookie Preferences
            </button>
            <Link to="/login" className="text-slate-400 hover:text-white transition">
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-3.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition"
            >
              Apply / Register
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80 py-12 px-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-mono">
            <Lock className="w-3.5 h-3.5" /> Technical Transparency & Data Protection Notice
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy & Data Processing Disclosure
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-3xl">
            This document outlines the technical architecture, personal data collection, processing purposes,
            and user rights across WaveInit LMS, covering LMS training, coding evaluations, and AI-assisted proctoring.
          </p>
          <div className="text-xs text-slate-500 pt-2 flex flex-wrap gap-4">
            <span>Version: 2.0 (Privacy-Readiness Remediation)</span>
            <span>Effective Date: September 2026</span>
            <span className="text-amber-400/90 font-medium">Notice: Legal bases & DPO appointments subject to organizational confirmation</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        {/* Important Disclaimer Notice */}
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            Organizational & Legal Notice
          </div>
          <p className="text-xs leading-relaxed text-amber-200/90">
            This privacy policy accurately reflects the technical data flows of the WaveInit LMS codebase.
            It does not constitute formal legal counsel. Items tagged with <span className="font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">[Requires Organizational/DPO Input]</span> indicate business-specific determinations that must be finalized by your organization's legal counsel or Data Protection Officer.
          </p>
        </div>

        {/* Section 1: Who operates/controls the service */}
        <section id="section-1" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">01.</span> Data Controller & Operator Identity
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            WaveInit LMS is operated by <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-amber-300">[Organization Name — Requires Legal/DPO Input]</span> ("we", "us", or "our"), functioning as the Data Controller under applicable data protection laws. For institutional deployments where training is provided on behalf of an employer or educational institution, WaveInit LMS may operate as a Data Processor under a Data Processing Agreement (DPA).
          </p>
        </section>

        {/* Section 2 & 3: What personal data is collected & why */}
        <section id="section-2" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">02.</span> Categories of Personal Data Collected
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            We collect and process only the personal data necessary to authenticate users, facilitate interactive learning, conduct assessments, and preserve assessment integrity.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h3 className="text-sm font-semibold text-teal-400">Account & Identity</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Full name, email address, username, hashed passwords (bcrypt 12 rounds), user role (Learner, Trainer, Admin), and optional profile avatar.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h3 className="text-sm font-semibold text-teal-400">Academic & Progress</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Course enrollments, lesson completions, quiz scores, coding submissions, code execution outputs, attendance timestamps, and earned certificates.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h3 className="text-sm font-semibold text-teal-400">Proctoring Telemetry</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Webcam snapshots (during proctored assessments), face presence events, dual-camera video streams (where enabled), screen focus loss events, and tab switches.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h3 className="text-sm font-semibold text-teal-400">Device & Network</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                IP address, user agent, browser type, screen resolution, and session security cookies.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Authentication Data */}
        <section id="section-4" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">03.</span> Authentication & Token Security
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Authentication is managed via JSON Web Tokens (JWT). Access tokens are short-lived and delivered to the client for in-memory session use. Refresh tokens are stored exclusively in secure, <code className="text-teal-400">HttpOnly</code>, <code className="text-teal-400">SameSite=Strict</code> cookies to prevent client-side script access and Cross-Site Scripting (XSS) exfiltration. Refresh tokens are single-use and rotated on every renewal; token reuse immediately revokes the token family.
          </p>
        </section>

        {/* Section 5: Student & Profile Data */}
        <section id="section-5" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">04.</span> Student Profiles & Privacy Controls
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Student profiles are private by default. Other students cannot access personal profile details (phone numbers, date of birth, residential addresses, resumes, or activity logs). Public-facing endpoints project only explicit allowlisted attributes (e.g. display name, professional headline, skills). Access to private profiles is strictly enforced via object-level authorization (IDOR protection), permitting only the profile owner and authorized administrators.
          </p>
        </section>

        {/* Section 6 & 7: Assessment & Interview Data */}
        <section id="section-6" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">05.</span> Academic Assessments & Interview Recordings
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Coding assessment code submissions, test case execution metrics, and interview feedback are preserved to fulfill educational evaluation and accreditation requirements. Interview recordings are private assets stored outside the public document root and accessible only by assigned interviewers, course trainers, and platform administrators.
          </p>
        </section>

        {/* Section 8, 9, 10: Webcam, Proctoring, Facial Landmark Processing */}
        <section id="section-8" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">06.</span> Webcam, Screen Recording & Facial Landmark Analysis
          </h2>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>
              When a proctored quiz or interview is initiated, the application may request access to your webcam, microphone, and secondary mobile camera (for dual-angle monitoring).
            </p>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
              <h4 className="font-semibold text-teal-400">Technical Details of Biometric & Inference Processing:</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li>
                  <strong className="text-slate-200">Local In-Memory Inference:</strong> Facial landmark tracking (MediaPipe Face Mesh / YOLO) processes individual video frames in-memory to detect face presence, multiple occupants, or gaze direction. Raw biometric template vectors are not permanently stored into biometric databases.
                </li>
                <li>
                  <strong className="text-slate-200">Periodic Screenshots:</strong> For audit purposes, periodic screenshots are captured during proctored exams and stored securely with encrypted access tokens.
                </li>
                <li>
                  <strong className="text-slate-200">Video Storage:</strong> Full webcam recordings are stored only when administrative recording is explicitly enabled. Otherwise, inference runs ephemeral in-memory frames.
                </li>
              </ul>
            </div>
            <p className="text-xs text-amber-300/90 font-mono">
              [Legal Basis: Explicit user consent or legitimate interest/contractual requirement for exam integrity — Requires Legal/DPO Input]
            </p>
          </div>
        </section>

        {/* Section 11 & 12: Cookies and Browser Storage */}
        <section id="section-11" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">07.</span> Cookies & Browser Storage
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            We categorize browser storage into strictly necessary and optional functional/telemetry storage:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300 border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-900 text-teal-400 border-b border-slate-800 font-mono">
                <tr>
                  <th className="p-3">Storage Key</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3">Purpose</th>
                  <th className="p-3">Consent Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="p-3 font-mono text-slate-200">refreshToken</td>
                  <td className="p-3 text-emerald-400">Strictly Necessary</td>
                  <td className="p-3">Secure HttpOnly session cookie for authentication renewal.</td>
                  <td className="p-3 text-slate-500">Exempt</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-slate-200">cookie_consent_preferences</td>
                  <td className="p-3 text-emerald-400">Strictly Necessary</td>
                  <td className="p-3">Persists user privacy and tracking consent decisions.</td>
                  <td className="p-3 text-slate-500">Exempt</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-slate-200">rememberMe / rememberedEmail</td>
                  <td className="p-3 text-amber-400">Functional / Preference</td>
                  <td className="p-3">Remembers user login email across browser sessions.</td>
                  <td className="p-3 text-teal-400 font-semibold">Yes</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono text-slate-200">deviceFingerprint</td>
                  <td className="p-3 text-amber-400">Telemetry & Integrity</td>
                  <td className="p-3">Assessment security to detect unauthorized device switching.</td>
                  <td className="p-3 text-teal-400 font-semibold">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            onClick={handleOpenCookieSettings}
            className="mt-3 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-400 text-xs font-semibold transition inline-flex items-center gap-2"
          >
            <Cookie className="w-4 h-4" /> Change Your Cookie Preferences
          </button>
        </section>

        {/* Section 13: AI Processing */}
        <section id="section-13" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">08.</span> Artificial Intelligence & Automated Processing
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            WaveInit LMS integrates artificial intelligence capabilities for:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1.5">
            <li>Generating dynamic quizzes and assessment questions from course documentation.</li>
            <li>Analyzing coding submissions for logic hints and syntactic explanations (Coding AI Help).</li>
            <li>Detecting proctoring anomaly events during online assessments (MediaPipe & Computer Vision).</li>
          </ul>
          <p className="text-xs text-slate-400">
            No automated decisions with legal or similarly significant effects are made solely on AI outputs without human review by course instructors or designated reviewers.
          </p>
        </section>

        {/* Section 14: Third-Party Processors */}
        <section id="section-14" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">09.</span> Third-Party Service Providers & Subprocessors
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            The following external services may receive data to fulfill platform operations:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="font-bold text-teal-400">Google Workspace (SMTP)</span>
              <p className="text-slate-400">Sends transactional account credentials and password reset OTPs.</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="font-bold text-teal-400">Google Gemini / Groq API</span>
              <p className="text-slate-400">Processes question generation and AI coding hints.</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="font-bold text-teal-400">Judge0 API</span>
              <p className="text-slate-400">Sandboxed compilation and execution of participant code.</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="font-bold text-teal-400">Cloudinary (Optional)</span>
              <p className="text-slate-400">Optional media CDN for public avatars and course assets.</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-mono">
            [Data Processing Agreements (DPAs) and Standard Contractual Clauses (SCCs) — Requires Legal/DPO Confirmation]
          </p>
        </section>

        {/* Section 15 & 16: Data Retention & Deletion */}
        <section id="section-15" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">10.</span> Data Retention & Centralized Purging
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Personal data is retained only for as long as necessary to satisfy educational, assessment, and legal retention mandates. Automated scheduled purging jobs safely delete expired physical files and sanitize database records:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Exam Screenshots:</span>
              <div className="text-teal-400 font-bold mt-1">14 Days</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Video Recordings:</span>
              <div className="text-teal-400 font-bold mt-1">30 Days</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Interview Videos:</span>
              <div className="text-teal-400 font-bold mt-1">90 Days</div>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Retention periods are configurable through system environment settings (<code className="text-teal-400">SCREENSHOT_RETENTION_DAYS</code>, <code className="text-teal-400">PROCTORING_RETENTION_DAYS</code>) to comply with local organizational policies.
          </p>
        </section>

        {/* Section 17 & 18: Security Measures & Data Subject Rights */}
        <section id="section-17" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">11.</span> Technical Security Measures & User Rights
          </h2>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>
              We implement comprehensive technical safeguards, including TLS in transit, database TLS encryption, authenticated media downloads with directory traversal defenses, anti-caching headers on personal endpoints, and brute-force lockout controls.
            </p>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
              <h4 className="font-semibold text-teal-400">Your Data Subject Rights Under GDPR:</h4>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <span><strong>Right of Access & Data Portability:</strong> You can export all your personal learning data in structured JSON format via <code className="text-teal-400">GET /api/user/me/export-data</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <span><strong>Right to Erasure (Deletion):</strong> You can request complete account deletion and file sanitization via <code className="text-teal-400">POST /api/user/me/request-erasure</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <span><strong>Right to Withdraw Consent:</strong> You may withdraw consent for optional proctoring and tracking at any time via <code className="text-teal-400">POST /api/user/me/revoke-consent</code> or via the Cookie Preferences dialog.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 19 & 20: Contact & Transfers */}
        <section id="section-19" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <span className="text-teal-400 font-mono text-sm">12.</span> Contact Information & Inquiries
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            To exercise your privacy rights, submit a data protection question, or contact our Data Protection Officer:
          </p>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1 font-mono text-slate-400">
            <p><strong className="text-slate-200">Email:</strong> privacy@waveinit.internal [Requires Legal/DPO Input]</p>
            <p><strong className="text-slate-200">DPO Contact:</strong> dpo@waveinit.internal [Requires Legal/DPO Input]</p>
            <p><strong className="text-slate-200">Postal Address:</strong> [Registered Corporate Address — Requires Legal/DPO Input]</p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-8 px-6 text-center text-xs text-slate-500 space-y-2">
        <p>&copy; {new Date().getFullYear()} WaveInit LMS. Technical Privacy Architecture Documentation.</p>
        <p>This technical disclosure does not constitute formal legal certification.</p>
      </footer>
    </div>
  );
}
