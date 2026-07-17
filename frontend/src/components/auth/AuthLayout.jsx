import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1];

export default function AuthLayout({ heading, subtitle, description, children, features }) {
  return (
    <div className="login-visual-panel">
      <motion.div className="login-visual-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease }}>
        <div className="visual-header">
          <div className="visual-logo">
            <div className="visual-logo-mark">
              <BookOpen size={20} color="#fff" />
            </div>
            <span className="visual-logo-text">Wave Init</span>
          </div>
          <span className="visual-badge">Enterprise Learning Platform</span>
        </div>

        <div className="visual-heading-wrap">
          {heading}
          {subtitle}
        </div>

        {description && (
          <p className="visual-description">
            {description}
          </p>
        )}

        {features && (
          <div className="visual-feature-chips">
            {features.map((f, i) => {
              const Icon = f.icon;
              return <span key={i} className="visual-chip"><Icon size={16} />{f.label}</span>;
            })}
          </div>
        )}

        {children}
      </motion.div>
    </div>
  );
}
