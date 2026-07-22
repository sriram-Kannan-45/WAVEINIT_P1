import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, FileText, AlertCircle } from 'lucide-react';

const inputCls = "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200";
const labelCls = "block text-sm font-medium text-slate-700 mb-2";

export default function BasicInformationSection({ name, headline, about, onNameChange, onHeadlineChange, onAboutChange }) {
  const [aboutFocused, setAboutFocused] = useState(false);
  const charCount = about?.length || 0;
  const maxChars = 1000;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' }}
        >
          <User size={16} className="text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Basic Information
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelCls}>Full Name</label>
          <input
            type="text"
            className={inputCls}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter your full name"
          />
        </div>

        <div>
          <label className={labelCls}>Professional Headline</label>
          <input
            type="text"
            className={inputCls}
            value={headline}
            onChange={(e) => onHeadlineChange(e.target.value)}
            placeholder="Senior Software Engineer | React & Node.js Expert"
          />
        </div>

        <div>
          <label className={labelCls}>About</label>
          <div className="relative">
            <textarea
              className={`${inputCls} resize-none ${aboutFocused ? 'ring-2 ring-emerald-500 border-emerald-500' : ''}`}
              rows={5}
              value={about}
              onChange={(e) => onAboutChange(e.target.value.slice(0, maxChars))}
              onFocus={() => setAboutFocused(true)}
              onBlur={() => setAboutFocused(false)}
              placeholder="Tell us about yourself, your expertise, and what you're passionate about..."
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {charCount > maxChars * 0.9 && (
                <span className={`text-xs ${charCount >= maxChars ? 'text-red-500' : 'text-amber-500'}`}>
                  {charCount}/{maxChars}
                </span>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <FileText size={12} />
            Supports basic markdown formatting
          </p>
        </div>
      </div>
    </div>
  );
}
