import { motion } from 'framer-motion';
import { Link2, Code2, MessageCircle, Globe } from 'lucide-react';

const labelCls = "block text-sm font-medium text-slate-700 mb-2";

const socialFields = [
  { key: 'linkedin', label: 'LinkedIn', icon: Link2, placeholder: 'https://linkedin.com/in/username' },
  { key: 'github', label: 'GitHub', icon: Code2, placeholder: 'https://github.com/username' },
  { key: 'twitter', label: 'Twitter / X', icon: MessageCircle, placeholder: 'https://twitter.com/username' },
  { key: 'instagram', label: 'Instagram', icon: Globe, placeholder: 'https://instagram.com/username' },
  { key: 'portfolio', label: 'Portfolio', icon: Globe, placeholder: 'https://yourportfolio.com' },
  { key: 'website', label: 'Website', icon: Link2, placeholder: 'https://yoursite.com' },
];

export default function SocialLinksSection({ contactLinks, onChange }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F3E8FF, #E9D5FF)' }}
        >
          <Link2 size={16} className="text-purple-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Social Links
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {socialFields.map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <div className="relative">
              <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                className="pl-10 w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                value={contactLinks[key] || ''}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
