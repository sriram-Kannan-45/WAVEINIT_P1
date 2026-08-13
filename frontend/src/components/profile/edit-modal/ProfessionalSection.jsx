import { motion } from 'framer-motion';
import { Briefcase, MapPin, Clock } from 'lucide-react';

const inputCls = "w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200";
const labelCls = "block text-xs font-semibold text-slate-700 mb-1.5";

export default function ProfessionalSection({
  company, department, designation, employeeId, experience, location, timezone,
  onCompanyChange, onDepartmentChange, onDesignationChange, onEmployeeIdChange,
  onExperienceChange, onLocationChange, onTimezoneChange,
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' }}
        >
          <Briefcase size={15} className="text-emerald-600" />
        </div>
        <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Professional Details
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div>
          <label className={labelCls}>Company</label>
          <input
            type="text"
            className={inputCls}
            value={company || ''}
            onChange={(e) => onCompanyChange(e.target.value)}
            placeholder="Wave Init Solutions"
          />
        </div>

        <div>
          <label className={labelCls}>Department</label>
          <input
            type="text"
            className={inputCls}
            value={department || ''}
            onChange={(e) => onDepartmentChange(e.target.value)}
            placeholder="Engineering"
          />
        </div>

        <div>
          <label className={labelCls}>Designation</label>
          <input
            type="text"
            className={inputCls}
            value={designation || ''}
            onChange={(e) => onDesignationChange(e.target.value)}
            placeholder="Senior Software Engineer"
          />
        </div>

        <div>
          <label className={labelCls}>Employee ID</label>
          <input
            type="text"
            className={inputCls}
            value={employeeId || ''}
            onChange={(e) => onEmployeeIdChange && onEmployeeIdChange(e.target.value)}
            placeholder="EMP-1024"
          />
        </div>

        <div>
          <label className={labelCls}>Experience</label>
          <input
            type="text"
            className={inputCls}
            value={experience || ''}
            onChange={(e) => onExperienceChange(e.target.value)}
            placeholder="5 Years"
          />
        </div>

        <div>
          <label className={labelCls}>Location</label>
          <div className="relative">
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="pl-9 w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              value={location || ''}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder="Chennai, India"
            />
          </div>
        </div>

        <div className="md:col-span-3">
          <label className={labelCls}>Time Zone</label>
          <div className="relative">
            <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="pl-9 w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              value={timezone || ''}
              onChange={(e) => onTimezoneChange(e.target.value)}
              placeholder="Asia/Kolkata (IST)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
