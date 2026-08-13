import { useState } from 'react';
import { User, FileText, Lock } from 'lucide-react';

const inputCls = "w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200";
const labelCls = "block text-xs font-semibold text-slate-700 mb-1.5";

export default function BasicInformationSection({ name, headline, about, email, phone, onNameChange, onHeadlineChange, onAboutChange, onPhoneChange }) {
  const [aboutFocused, setAboutFocused] = useState(false);
  const charCount = about?.length || 0;
  const maxChars = 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' }}
        >
          <User size={15} className="text-emerald-600" />
        </div>
        <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Basic Information
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div>
          <label className={labelCls}>Full Name *</label>
          <input
            type="text"
            className={inputCls}
            value={name || ''}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Sriram Kannan"
          />
        </div>

        <div>
          <label className={labelCls}>Email Address *</label>
          <div className="relative">
            <input
              type="email"
              disabled
              className={`${inputCls} bg-slate-100 text-slate-500 cursor-not-allowed pr-8`}
              value={email || ''}
              placeholder="email@example.com"
            />
            <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Email cannot be changed</p>
        </div>

        <div>
          <label className={labelCls}>Phone Number *</label>
          <input
            type="text"
            className={inputCls}
            value={phone || ''}
            onChange={(e) => onPhoneChange && onPhoneChange(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div>
          <label className={labelCls}>Professional Headline *</label>
          <input
            type="text"
            className={inputCls}
            value={headline || ''}
            onChange={(e) => onHeadlineChange(e.target.value)}
            placeholder="Senior Software Engineer | React & Node.js Expert"
          />
        </div>

        <div>
          <label className={labelCls}>About / Bio</label>
          <div className="relative">
            <textarea
              className={`${inputCls} resize-none ${aboutFocused ? 'ring-2 ring-emerald-500 border-emerald-500' : ''}`}
              rows={3}
              value={about || ''}
              onChange={(e) => onAboutChange(e.target.value.slice(0, maxChars))}
              onFocus={() => setAboutFocused(true)}
              onBlur={() => setAboutFocused(false)}
              placeholder="Tell us about yourself, your expertise, and what you're passionate about..."
            />
            <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
              {charCount > maxChars * 0.9 && (
                <span className={`text-xs ${charCount >= maxChars ? 'text-red-500' : 'text-amber-500'}`}>
                  {charCount}/{maxChars}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
