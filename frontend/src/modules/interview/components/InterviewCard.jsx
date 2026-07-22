import { motion } from 'framer-motion';
import { Calendar, Clock, Users, Video, ChevronRight } from 'lucide-react';
import { INTERVIEW_STATUS, INTERVIEW_TYPES } from '../constants';

export default function InterviewCard({ interview, onJoin, onView, showCandidate = false, showTrainer = false }) {
  const status = INTERVIEW_STATUS[interview.status] || INTERVIEW_STATUS.SCHEDULED;
  const type = INTERVIEW_TYPES.find(t => t.value === interview.interviewType);
  const scheduledDate = new Date(interview.scheduledAt);
  const isLive = interview.status === 'LIVE';
  const isUpcoming = interview.status === 'SCHEDULED';

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
      className="bg-white rounded-2xl border border-slate-100 p-5 cursor-pointer transition-all"
      onClick={() => onView?.(interview)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{interview.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: type?.color === 'blue' ? '#EFF6FF' : type?.color === 'purple' ? '#F5F3FF' : type?.color === 'emerald' ? '#F0FDF4' : type?.color === 'amber' ? '#FFFBEB' : '#FEF2F2', color: type?.color === 'blue' ? '#2563EB' : type?.color === 'purple' ? '#7C3AED' : type?.color === 'emerald' ? '#059669' : type?.color === 'amber' ? '#D97706' : '#DC2626' }}
            >
              {type?.label}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: status.bg, color: status.text }}
            >
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />}
              {status.label}
            </span>
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-400 mt-1" />
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 mt-3">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="flex items-center gap-1">
          {interview.durationMinutes}m
        </span>
        {interview.candidates && (
          <span className="flex items-center gap-1">
            <Users size={12} />
            {interview.candidates.length}
          </span>
        )}
      </div>

      {showCandidate && interview.candidates?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-50">
          <div className="flex -space-x-2">
            {interview.candidates.slice(0, 3).map((c, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700 border-2 border-white">
                {c.participant?.name?.[0] || '?'}
              </div>
            ))}
            {interview.candidates.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-500 border-2 border-white">
                +{interview.candidates.length - 3}
              </div>
            )}
          </div>
        </div>
      )}

      {(isLive || isUpcoming) && (
        <div className="mt-3 flex gap-2">
          {isLive && (
            <button
              onClick={(e) => { e.stopPropagation(); onJoin?.(interview); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Video size={14} /> Join Now
            </button>
          )}
          {isUpcoming && (
            <button
              onClick={(e) => { e.stopPropagation(); onView?.(interview); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              View Details
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
