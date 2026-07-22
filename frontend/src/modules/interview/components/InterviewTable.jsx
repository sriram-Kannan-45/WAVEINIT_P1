import { motion } from 'framer-motion';
import { Calendar, Clock, Users, MoreVertical, Video, Eye, XCircle } from 'lucide-react';
import { INTERVIEW_STATUS, INTERVIEW_TYPES } from '../constants';
import { useState } from 'react';

export default function InterviewTable({ interviews = [], onView, onJoin, onCancel, loading }) {
  const [openMenu, setOpenMenu] = useState(null);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-slate-500 mt-3">Loading interviews...</p>
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
        <Video size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">No interviews found</p>
        <p className="text-xs text-slate-400 mt-1">Create your first interview to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Interview</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date & Time</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Candidates</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {interviews.map((interview, idx) => {
              const status = INTERVIEW_STATUS[interview.status] || INTERVIEW_STATUS.SCHEDULED;
              const type = INTERVIEW_TYPES.find(t => t.value === interview.interviewType);
              const date = new Date(interview.scheduledAt);
              return (
                <motion.tr
                  key={interview.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900">{interview.title}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-medium text-slate-600">{type?.label}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-sm text-slate-600">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400"><Clock size={10} /> {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-sm text-slate-600">{interview.durationMinutes} min</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1 text-sm text-slate-600">
                      <Users size={12} /> {interview.candidates?.length || 0}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: status.bg, color: status.text }}
                    >
                      {interview.status === 'LIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === interview.id ? null : interview.id)}
                        className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <MoreVertical size={14} className="text-slate-400" />
                      </button>
                      {openMenu === interview.id && (
                        <div className="absolute right-0 top-8 z-10 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[140px]">
                          <button
                            onClick={() => { onView(interview); setOpenMenu(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <Eye size={12} /> View Details
                          </button>
                          {interview.status === 'LIVE' && (
                            <button
                              onClick={() => { onJoin(interview); setOpenMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50"
                            >
                              <Video size={12} /> Join
                            </button>
                          )}
                          {interview.status === 'SCHEDULED' && onCancel && (
                            <button
                              onClick={() => { onCancel(interview); setOpenMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                            >
                              <XCircle size={12} /> Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
