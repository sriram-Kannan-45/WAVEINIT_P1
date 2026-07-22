import { motion } from 'framer-motion';
import { Briefcase, Building2, MapPin, Clock, Globe } from 'lucide-react';

const inputCls = "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200";
const labelCls = "block text-sm font-medium text-slate-700 mb-2";

export default function ProfessionalSection({
  company, department, designation, experience, location, timezone, language,
  onCompanyChange, onDepartmentChange, onDesignationChange, onExperienceChange,
  onLocationChange, onTimezoneChange, onLanguageChange,
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' }}
        >
          <Briefcase size={16} className="text-emerald-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Professional Details
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Company</label>
          <input
            type="text"
            className={inputCls}
            value={company}
            onChange={(e) => onCompanyChange(e.target.value)}
            placeholder="Company name"
          />
        </div>

        <div>
          <label className={labelCls}>Department</label>
          <input
            type="text"
            className={inputCls}
            value={department}
            onChange={(e) => onDepartmentChange(e.target.value)}
            placeholder="Engineering, Marketing..."
          />
        </div>

        <div>
          <label className={labelCls}>Designation</label>
          <input
            type="text"
            className={inputCls}
            value={designation}
            onChange={(e) => onDesignationChange(e.target.value)}
            placeholder="Software Engineer, Manager..."
          />
        </div>

        <div>
          <label className={labelCls}>Experience</label>
          <input
            type="text"
            className={inputCls}
            value={experience}
            onChange={(e) => onExperienceChange(e.target.value)}
            placeholder="5 years"
          />
        </div>

        <div>
          <label className={labelCls}>Location</label>
          <div className="relative">
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="pl-10 w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder="City, Country"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Timezone</label>
          <div className="relative">
            <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="pl-10 w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              value={timezone}
              onChange={(e) => onTimezoneChange(e.target.value)}
              placeholder="IST, PST, UTC..."
            />
          </div>
        </div>

        <div className="col-span-2">
          <label className={labelCls}>Language</label>
          <div className="relative">
            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="pl-10 w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              placeholder="English, Hindi..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
