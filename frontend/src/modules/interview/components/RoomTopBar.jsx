import { motion } from 'framer-motion';
import { ArrowLeft, Users, LogOut, Maximize2, Minimize2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import Timer from './Timer';
import RecordingIndicator from './RecordingIndicator';
import { INTERVIEW_TYPES } from '../constants';

export default function RoomTopBar({ interview, isRecording, participantCount, elapsedTime, onBack, isTrainer }) {
  const type = INTERVIEW_TYPES.find(t => t.value === interview?.interviewType);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/60 backdrop-blur-xl border-b border-white/10"
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} className="text-white/70" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">
              {interview?.title || 'Interview'}
            </h1>
            {type && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5"
                style={{
                  background: type.color === 'blue' ? 'rgba(37, 99, 235, 0.2)' : type.color === 'purple' ? 'rgba(124, 58, 237, 0.2)' : type.color === 'emerald' ? 'rgba(5, 150, 105, 0.2)' : type.color === 'amber' ? 'rgba(217, 119, 6, 0.2)' : 'rgba(220, 38, 38, 0.2)',
                  color: type.color === 'blue' ? '#93C5FD' : type.color === 'purple' ? '#C4B5FD' : type.color === 'emerald' ? '#6EE7B7' : type.color === 'amber' ? '#FCD34D' : '#FCA5A5',
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-lg">
            <Users size={14} className="text-white/70" />
            <span className="text-xs font-medium text-white">{participantCount || 0}</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 size={16} className="text-white/70" />
            ) : (
              <Maximize2 size={16} className="text-white/70" />
            )}
          </button>
          {!isTrainer && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 rounded-xl transition-colors"
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
