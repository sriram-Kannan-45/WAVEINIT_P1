import { motion } from 'framer-motion';
import { ArrowLeft, Users, LogOut } from 'lucide-react';
import Timer from './Timer';
import RecordingIndicator from './RecordingIndicator';
import { INTERVIEW_TYPES } from '../constants';

export default function RoomTopBar({ interview, isRecording, participantCount, elapsedTime, onBack, isTrainer }) {
  const type = INTERVIEW_TYPES.find(t => t.value === interview?.interviewType);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-100"
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} className="text-slate-600" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-900 truncate">
              {interview?.title || 'Interview'}
            </h1>
            {type && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5"
                style={{
                  background: type.color === 'blue' ? '#EFF6FF' : type.color === 'purple' ? '#F5F3FF' : type.color === 'emerald' ? '#F0FDF4' : type.color === 'amber' ? '#FFFBEB' : '#FEF2F2',
                  color: type.color === 'blue' ? '#2563EB' : type.color === 'purple' ? '#7C3AED' : type.color === 'emerald' ? '#059669' : type.color === 'amber' ? '#D97706' : '#DC2626',
                }}
              >
                {type.label}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Timer startTime={interview?.startedAt || interview?.scheduledAt} />
          <RecordingIndicator isRecording={isRecording} />
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg">
            <Users size={14} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-700">{participantCount || 0}</span>
          </div>
          {!isTrainer && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
            >
              <LogOut size={14} />
              Leave
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
