import { motion } from 'framer-motion';
import { Mail, Phone, Lock } from 'lucide-react';

const inputCls = "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200";
const labelCls = "block text-sm font-medium text-slate-700 mb-2";

export default function ContactSection({ phone, email, onPhoneChange }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}
        >
          <Phone size={16} className="text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Contact Information
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email Address</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              className="pl-10 w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed"
              value={email}
              disabled
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Lock size={12} className="text-slate-400" />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">Email cannot be changed here</p>
        </div>

        <div>
          <label className={labelCls}>Phone Number</label>
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              className="pl-10 w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
