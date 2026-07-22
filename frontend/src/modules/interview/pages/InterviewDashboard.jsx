import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Video, CalendarClock, ChevronRight } from 'lucide-react';
import { useInterviewDashboard, useInterviewList } from '../hooks/useInterview';
import InterviewCard from '../components/InterviewCard';
import InterviewTable from '../components/InterviewTable';
import InterviewStats from '../components/InterviewStats';

export default function InterviewDashboard({ user, onTabChange }) {
  const { stats, loading: statsLoading } = useInterviewDashboard();
  const [activeFilter, setActiveFilter] = useState('all');

  const canCreate = user?.role === 'ADMIN' || user?.role === 'TRAINER';

  const { interviews: scheduledInterviews, loading: scheduledLoading } = useInterviewList({ status: 'SCHEDULED' });
  const { interviews: liveInterviews, loading: liveLoading } = useInterviewList({ status: 'LIVE' });
  const { interviews: completedInterviews, loading: completedLoading } = useInterviewList({ status: 'COMPLETED' });

  const liveAndUpcoming = useMemo(() => {
    return [...liveInterviews, ...scheduledInterviews].sort(
      (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
    );
  }, [liveInterviews, scheduledInterviews]);

  const recentCompleted = completedInterviews.slice(0, 10);

  const handleJoin = (interview) => {
    onTabChange?.('interview-room', { interviewId: interview.id });
  };

  const handleView = (interview) => {
    onTabChange?.('interview-room', { interviewId: interview.id });
  };

  const loading = statsLoading || scheduledLoading || liveLoading || completedLoading;

  if (loading && liveAndUpcoming.length === 0 && recentCompleted.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-lg font-bold text-slate-900">Interview Management</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage and track all interviews</p>
          </div>
          {canCreate && (
            <button
              onClick={() => onTabChange?.('interview-create')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <Plus size={14} />
              Create Interview
            </button>
          )}
        </motion.div>

        <InterviewStats stats={stats} />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">Live & Upcoming</h2>
            </div>
            {liveAndUpcoming.length > 0 && (
              <button
                onClick={() => onTabChange?.('interview-upcoming')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                View all <ChevronRight size={12} />
              </button>
            )}
          </div>

          {liveAndUpcoming.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
              <CalendarClock size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">No live or upcoming interviews</p>
              <p className="text-xs text-slate-400 mt-1">Schedule an interview to get started</p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {liveAndUpcoming.map((interview, idx) => (
                <motion.div
                  key={interview.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex-shrink-0 w-72"
                >
                  <InterviewCard
                    interview={interview}
                    onJoin={handleJoin}
                    onView={handleView}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Video size={16} className="text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">Recent</h2>
            </div>
            {recentCompleted.length > 0 && (
              <button
                onClick={() => onTabChange?.('interview-completed')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                View all <ChevronRight size={12} />
              </button>
            )}
          </div>

          <InterviewTable
            interviews={recentCompleted}
            loading={completedLoading}
            onView={handleView}
            onJoin={handleJoin}
          />
        </motion.div>
      </div>
    </div>
  );
}
