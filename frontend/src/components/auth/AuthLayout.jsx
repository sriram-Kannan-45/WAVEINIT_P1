import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import classroomImg from '../../assets/lms-classroom-empower.png';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] },
});

export default function AuthLayout() {
  return (
    <div className="auth-layout--left">
      {/* Background gradients and subtle decorative curves */}
      <div className="auth-bg-gradient" />
      
      {/* Decorative Dot Grid (Top-Right of Left Section) */}
      <div className="auth-dot-grid auth-dot-grid--left" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="auth-dot" />
        ))}
      </div>

      {/* Sweeping Contour Wave Lines */}
      <svg className="auth-contour-curves" viewBox="0 0 800 800" fill="none" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-100,240 C200,120 400,500 900,320" stroke="rgba(18, 124, 52, 0.08)" strokeWidth="1.5" />
        <path d="M-80,280 C220,160 420,540 920,360" stroke="rgba(18, 124, 52, 0.07)" strokeWidth="1.5" />
        <path d="M-60,320 C240,200 440,580 940,400" stroke="rgba(18, 124, 52, 0.06)" strokeWidth="1.5" />
        <path d="M-40,360 C260,240 460,620 960,440" stroke="rgba(18, 124, 52, 0.05)" strokeWidth="1.5" />
      </svg>

      {/* Top Header Bar with Logo */}
      <div className="auth-top-header">
        <div className="auth-logo-bar">
          <div className="auth-logo-icon">
            <BookOpen size={24} color="#127c34" strokeWidth={2.4} />
          </div>
          <span className="auth-logo-text">
            <span className="auth-logo-text-dark">WAVE INIT </span>
            <span className="auth-logo-text-green">LMS</span>
          </span>
        </div>
      </div>

      {/* Hero Content */}
      <div className="auth-hero-content">
        <motion.h1 className="auth-hero-title" {...fadeUp(0)}>
          Empower Learning.<br />
          Enable Growth.<br />
          <span className="auth-hero-highlight">Welcome to Wave Init LMS</span>
        </motion.h1>

        <motion.p className="auth-hero-subtitle" {...fadeUp(0.08)}>
          A smart learning platform to create, deliver, assess
          and track learning outcomes in one place.
        </motion.p>

        {/* Classroom Interactive Hero Visual */}
        <motion.div
          className="auth-classroom-empower-wrap"
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        >
          <img
            src={classroomImg}
            alt="Wave Init LMS Interactive Classroom"
            className="auth-classroom-empower-img"
          />
        </motion.div>
      </div>
    </div>
  );
}
