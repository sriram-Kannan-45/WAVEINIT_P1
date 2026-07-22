import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Download, ChevronDown, ChevronUp, Calendar, Clock, Users, Star, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { useInterviewList } from '../hooks/useInterview';
import { INTERVIEW_TYPES, RECOMMENDATIONS } from '../constants';
import InterviewFilters from '../components/InterviewFilters';
import interviewApi from '../api';

export default function InterviewReports({ user }) {
  const [filters, setFilters] = useState({ search: '', interviewType: '', status: 'COMPLETED' });
  const [expandedRow, setExpandedRow] = useState(null);
  const [rowEvaluations, setRowEvaluations] = useState({});
  const [loadingRow, setLoadingRow] = useState(null);

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

  const handleExport = () => {
    alert('Export feature coming soon');
  };

  const toggleRow = async (interview) => {
    if (expandedRow === interview.id) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(interview.id);
    if (!rowEvaluations[interview.id]) {
      setLoadingRow(interview.id);
      try {
        const data = await interviewApi.getEvaluations(interview.id);
        setRowEvaluations(prev => ({ ...prev, [interview.id]: data.evaluations || data || [] }));
      } catch {
        setRowEvaluations(prev => ({ ...prev, [interview.id]: [] }));
      } finally {
        setLoadingRow(null);
      }
    }
  };

  const getAverageScore = (evals) => {
    if (!evals || evals.length === 0) return '—';
    const scores = evals.map(e => {
      const ratings = [e.communicationRating, e.technicalRating, e.codingRating, e.problemSolvingRating, e.confidenceRating, e.behaviorRating].filter(r => r > 0);
      return ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    }).filter(s => s > 0);
    if (scores.length === 0) return '—';
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  };

  const getRecommendationBreakdown = (evals) => {
    if (!evals || evals.length === 0) return null;
    const hire = evals.filter(e => e.recommendation === 'HIKE').length;
    const maybe = evals.filter(e => e.recommendation === 'MAYBE').length;
    const reject = evals.filter(e => e.recommendation === 'REJECT').length;
    return { hire, maybe, reject };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-lg font-bold text-slate-900">Interview Reports</h1>
            <p className="text-xs text-slate-500 mt-0.5">Analytics and evaluation reports</p>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            <Download size={14} />
            Export
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <InterviewFilters
            filters={filters}
            onChange={setFilters}
            searchPlaceholder="Search reports..."
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Interview</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Candidates</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Score</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recommendation</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
                    </td>
                  </tr>
                ) : filteredInterviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <BarChart3 size={40} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-600">No reports found</p>
                      <p className="text-xs text-slate-400 mt-1">Complete interviews to generate reports</p>
                    </td>
                  </tr>
                ) : (
                  filteredInterviews.map((interview, idx) => {
                    const date = new Date(interview.scheduledAt);
                    const evals = rowEvaluations[interview.id] || [];
                    const avgScore = getAverageScore(evals);
                    const breakdown = getRecommendationBreakdown(evals);
                    const isExpanded = expandedRow === interview.id;

                    return (
                      <motion.tbody
                        key={interview.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.03 }}
                      >
                        <tr
                          className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                          onClick={() => toggleRow(interview)}
                        >
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-slate-900">{interview.title}</p>
                            <p className="text-xs text-slate-500">
                              {INTERVIEW_TYPES.find(t => t.value === interview.interviewType)?.label}
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              <Calendar size={12} />
                              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              <Clock size={12} />
                              {interview.durationMinutes}m
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              <Users size={12} />
                              {interview.candidates?.length || 0}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-1 text-xs font-medium text-slate-700">
                              {avgScore !== '—' && <Star size={10} className="text-amber-400 fill-amber-400" />}
                              {avgScore}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {breakdown ? (
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-0.5 text-xs text-emerald-600">
                                  <ThumbsUp size={10} /> {breakdown.hire}
                                </span>
                                <span className="flex items-center gap-0.5 text-xs text-amber-600">
                                  <Minus size={10} /> {breakdown.maybe}
                                </span>
                                <span className="flex items-center gap-0.5 text-xs text-red-600">
                                  <ThumbsDown size={10} /> {breakdown.reject}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">No evals</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {isExpanded ? (
                              <ChevronUp size={14} className="text-slate-400" />
                            ) : (
                              <ChevronDown size={14} className="text-slate-400" />
                            )}
                          </td>
                        </tr>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              <td colSpan={7} className="px-5 py-4 bg-slate-50/50">
                                {loadingRow === interview.id ? (
                                  <div className="flex items-center justify-center py-4">
                                    <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                                  </div>
                                ) : evals.length > 0 ? (
                                  <div className="space-y-2">
                                    {evals.map((eval_, i) => (
                                      <div key={i} className="bg-white rounded-xl p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
                                            {eval_.participant?.name?.[0] || '?'}
                                          </div>
                                          <div>
                                            <p className="text-xs font-medium text-slate-700">
                                              {eval_.participant?.name || eval_.participantId}
                                            </p>
                                            {eval_.remarks && (
                                              <p className="text-[10px] text-slate-500 mt-0.5 max-w-md truncate">{eval_.remarks}</p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                                            <Star size={10} className="text-amber-400 fill-amber-400" />
                                            {getAverageScore([eval_])}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            {eval_.recommendation === 'HIKE' && <ThumbsUp size={12} className="text-emerald-500" />}
                                            {eval_.recommendation === 'MAYBE' && <Minus size={12} className="text-amber-500" />}
                                            {eval_.recommendation === 'REJECT' && <ThumbsDown size={12} className="text-red-500" />}
                                            <span className="text-xs text-slate-600">
                                              {RECOMMENDATIONS.find(r => r.value === eval_.recommendation)?.label || eval_.recommendation}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500 text-center py-4">No evaluations available</p>
                                )}
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </motion.tbody>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
