import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Moon, HelpCircle } from 'lucide-react';
import loginIMG from '../../assets/loginIMG.png';

const features = [
  'Smart Learning',
  'Secure & Reliable',
  'Real-time Analytics',
  'Scalable',
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] },
});

export default function AuthLayout() {
  return (
    <div className="auth-layout--left">
      <div className="auth-bg-gradient" />

      <svg className="auth-bg-wave" viewBox="0 0 900 500" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M-60 380 C80 300, 240 460, 400 360 C560 260, 700 440, 960 340" stroke="#16a34a" strokeWidth="2.5" fill="none" opacity="0.08" />
        <path d="M-60 420 C60 350, 260 490, 440 400 C620 310, 740 470, 980 380" stroke="#22c55e" strokeWidth="1.8" fill="none" opacity="0.06" />
      </svg>

      <div className="auth-topbar">
        <button type="button" className="auth-topbar-btn" aria-label="Toggle dark mode">
          <Moon size={14} />
          Dark Mode
        </button>
        <button type="button" className="auth-topbar-btn" aria-label="Need help">
          <HelpCircle size={14} />
          Need Help
        </button>
      </div>

      <div className="auth-hero-content">
        <motion.div className="auth-hero-top" {...fadeUp(0)}>
          <div className="auth-logo-bar">
            <div className="auth-logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <span className="auth-logo-text">WAVE INIT LMS</span>
          </div>
          <span className="auth-badge auth-badge--enterprise">
            <span className="auth-badge--dot" />
            Enterprise SaaS
          </span>
        </motion.div>

        <motion.h1 className="auth-hero-title" {...fadeUp(0.1)}>
          Learn. Assess. Grow with<br />
          <span className="auth-hero-highlight">Wave Init</span> LMS
        </motion.h1>

        <motion.p className="auth-hero-subtitle" {...fadeUp(0.18)}>
          A unified platform to manage learning, assessments, certifications
          and analytics with one modern enterprise solution.
        </motion.p>

        <motion.div
          className="auth-illustration"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <img
            src={loginIMG}
            alt="Wave Init LMS Dashboard"
            className="auth-illustration-img"
          />
        </motion.div>

        <motion.div className="auth-features" {...fadeUp(0.34)}>
          {features.map((f) => (
            <span className="auth-feature-badge" key={f}>
              <span className="auth-feature-icon">
                <CheckCircle2 size={14} />
              </span>
              {f}
            </span>
          ))}
        </motion.div>
      </div>

      <div className="auth-footer">
        <span className="auth-footer-copy">&copy; 2026 Wave Init LMS</span>
        <div className="auth-footer-links">
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
          </a>
          <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
          </a>
        </div>
      </div>
    </div>
  );
}
