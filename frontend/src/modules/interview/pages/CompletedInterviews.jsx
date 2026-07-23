import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, X, Star, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { useInterviewList } from '../hooks/useInterview';
import { INTERVIEW_TYPES, RECOMMENDATIONS } from '../constants';
import InterviewTable from '../components/InterviewTable';
import InterviewFilters from '../components/InterviewFilters';
import interviewApi from '../api';
import Spinner from '../../../components/ui/Spinner';

export default function CompletedInterviews({ user, onTabChange }) {
  const [filters, setFilters] = useState({ search: '', interviewType: '' });
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [evaluations, setEvaluations] = useState(null);
  const [loadingEvals, setLoadingEvals] = useState(false);

  const { interviews, loading } = useInterviewList({ status: 'COMPLETED', ...filters });

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

  const handleView = async (interview) => {
    setSelectedInterview(interview);
    setLoadingEvals(true);
    try {
      const data = await interviewApi.getEvaluations(interview.id);
      setEvaluations(data.evaluations || data || []);
    } catch {
      setEvaluations([]);
    } finally {
      setLoadingEvals(false);
    }
  };

  const handleJoin = (interview) => {
    onTabChange?.('interview-room', { interviewId: interview.id });
  };

  const getRecommendationIcon = (rec) => {
    switch (rec) {
      case 'HIKE': return <ThumbsUp size={12} className="text-emerald-500" />;
      case 'REJECT': return <ThumbsDown size={12} className="text-red-500" />;
      default: return <Minus size={12} className="text-amber-500" />;
    }
  };

  const getRecommendationLabel = (rec) => {
    const r = RECOMMENDATIONS.find(r => r.value === rec);
    return r?.label || rec;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-lg font-bold text-slate-900">Completed Interviews</h1>
          <p className="text-xs text-slate-500 mt-0.5">Review completed interview sessions</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <InterviewFilters
            filters={filters}
            onChange={setFilters}
            searchPlaceholder="Search completed interviews..."
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <InterviewTable
            interviews={filteredInterviews}
            loading={loading}
            onView={handleView}
            onJoin={handleJoin}
          />
        </motion.div>

        <AnimatePresence>
          {selectedInterview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => { setSelectedInterview(null); setEvaluations(null); }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{selectedInterview.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {INTERVIEW_TYPES.find(t => t.value === selectedInterview.interviewType)?.label}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSelectedInterview(null); setEvaluations(null); }}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <X size={16} className="text-slate-500" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto max-h-[60vh]">
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-1">Scheduled</p>
                    <p className="text-sm text-slate-900">
                      {new Date(selectedInterview.scheduledAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-1">Duration</p>
                    <p className="text-sm text-slate-900">{selectedInterview.durationMinutes} minutes</p>
                  </div>

                  {selectedInterview.candidates?.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-slate-500 mb-2">Candidates ({selectedInterview.candidates.length})</p>
                      <div className="space-y-2">
                        {selectedInterview.candidates.map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
                                {c.participant?.name?.[0] || '?'}
                              </div>
                              <span className="text-xs font-medium text-slate-700">{c.participant?.name || 'Unknown'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {loadingEvals ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner size={24} />
                    </div>
                  ) : evaluations && evaluations.length > 0 ? (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Evaluations</p>
                      <div className="space-y-2">
                        {evaluations.map((eval_, i) => (
                          <div key={i} className="p-3 bg-slate-50 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-slate-700">
                                {eval_.participant?.name || eval_.participantId}
                              </span>
                              <div className="flex items-center gap-1">
                                {getRecommendationIcon(eval_.recommendation)}
                                <span className="text-xs text-slate-600">{getRecommendationLabel(eval_.recommendation)}</span>
                              </div>
                            </div>
                            <div className="flex gap-3 mb-2">
                              {eval_.communicationRating > 0 && (
                                <span className="text-[10px] text-slate-500">Comm: {eval_.communicationRating}/5</span>
                              )}
                              {eval_.technicalRating > 0 && (
                                <span className="text-[10px] text-slate-500">Tech: {eval_.technicalRating}/5</span>
                              )}
                              {eval_.codingRating > 0 && (
                                <span className="text-[10px] text-slate-500">Code: {eval_.codingRating}/5</span>
                              )}
                            </div>
                            {eval_.remarks && (
                              <p className="text-xs text-slate-500 italic">{eval_.remarks}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Star size={24} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">No evaluations yet</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
