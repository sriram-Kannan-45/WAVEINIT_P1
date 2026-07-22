import { Search, Filter } from 'lucide-react';
import { INTERVIEW_STATUS, INTERVIEW_TYPES } from '../constants';

export default function InterviewFilters({ filters, onChange, searchPlaceholder = 'Search interviews...' }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>
      <select
        value={filters.status || ''}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        <option value="">All Status</option>
        {Object.entries(INTERVIEW_STATUS).map(([key, val]) => (
          <option key={key} value={key}>{val.label}</option>
        ))}
      </select>
      <select
        value={filters.interviewType || ''}
        onChange={(e) => onChange({ ...filters, interviewType: e.target.value })}
        className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        <option value="">All Types</option>
        {INTERVIEW_TYPES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
