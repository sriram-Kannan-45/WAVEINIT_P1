import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Video, Search } from 'lucide-react';
import { useInterviewList } from '../hooks/useInterview';
import InterviewCard from '../components/InterviewCard';
import InterviewFilters from '../components/InterviewFilters';

export default function UpcomingInterviews({ user, onTabChange }) {
  const [filters, setFilters] = useState({ search: '', status: 'SCHEDULED', interviewType: '' });
  const { interviews, loading } = useInterviewList({ status: 'SCHEDULED', ...filters });

  const filteredInterviews = useMemo(() => {
    let result = interviews;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(i => i.title?.toLowerCase().includes(q));
    }
    if (filters.interviewType) {
      result = result.filter(i => i.interviewType === filters.interviewType);
    }
    return result;
  }, [interviews, filters]);

  const handleJoin = (interview) => {
    onTabChange?.('interview-room', { interviewId: interview.id });
  };

  const handleView = (interview) => {
    onTabChange?.('interview-room', { interviewId: interview.id });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-lg font-bold text-slate-900">Upcoming Interviews</h1>
          <p className="text-xs text-slate-500 mt-0.5">View and join scheduled interviews</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <InterviewFilters
            filters={filters}
            onChange={setFilters}
            searchPlaceholder="Search upcoming interviews..."
          />
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-slate-100 p-5"
              >
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="flex gap-2">
                    <div className="h-5 bg-slate-100 rounded-full w-16" />
                    <div className="h-5 bg-slate-100 rounded-full w-20" />
                  </div>
                  <div className="flex gap-4">
                    <div className="h-3 bg-slate-100 rounded w-16" />
                    <div className="h-3 bg-slate-100 rounded w-12" />
                    <div className="h-3 bg-slate-100 rounded w-8" />
                  </div>
                  <div className="h-9 bg-slate-100 rounded-xl w-full" />
                </div>
              </motion.div>
            ))}
          </div>
        ) : filteredInterviews.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-slate-100 p-12 text-center"
          >
            <CalendarClock size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">No upcoming interviews</p>
            <p className="text-xs text-slate-400 mt-1">
              {filters.search ? 'Try a different search term' : 'Schedule an interview to get started'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInterviews.map((interview, idx) => (
              <motion.div
                key={interview.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
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
      </div>
    </div>
  );
}
