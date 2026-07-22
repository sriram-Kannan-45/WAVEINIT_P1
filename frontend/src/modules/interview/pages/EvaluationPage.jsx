import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Users, FileText } from 'lucide-react';
import interviewApi from '../api';
import { useInterview } from '../hooks/useInterview';
import EvaluationForm from '../components/EvaluationForm';

export default function EvaluationPage({ user }) {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const { interview, loading: interviewLoading } = useInterview(interviewId);

  const [evaluations, setEvaluations] = useState([]);
  const [loadingEvals, setLoadingEvals] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  useEffect(() => {
    const fetchEvaluations = async () => {
      if (!interviewId) return;
      setLoadingEvals(true);
      try {
        const data = await interviewApi.getEvaluations(interviewId);
        setEvaluations(data.evaluations || data || []);
      } catch {
        setEvaluations([]);
      } finally {
        setLoadingEvals(false);
      }
    };
    fetchEvaluations();
  }, [interviewId]);

  useEffect(() => {
    if (interview?.candidates?.length > 0 && !selectedCandidate) {
      setSelectedCandidate(interview.candidates[0]);
    }
  }, [interview, selectedCandidate]);

  const handleSubmitEvaluation = async (data) => {
    await interviewApi.submitEvaluation(interviewId, data);
    const updated = await interviewApi.getEvaluations(interviewId);
    setEvaluations(updated.evaluations || updated || []);
  };

  const getExistingEvaluation = (participantId) => {
    return evaluations.find(e => e.participantId === participantId);
  };

  const getCandidateScore = (eval_) => {
    const ratings = [
      eval_.communicationRating,
      eval_.technicalRating,
      eval_.codingRating,
      eval_.problemSolvingRating,
      eval_.confidenceRating,
      eval_.behaviorRating,
    ].filter(r => r > 0);
    if (ratings.length === 0) return 0;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  };

  const loading = interviewLoading || loadingEvals;

  if (loading) {
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
          className="flex items-center gap-3"
        >
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={16} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Interview Evaluation</h1>
            <p className="text-xs text-slate-500 mt-0.5">{interview?.title || 'Evaluate candidates'}</p>
          </div>
        </motion.div>

        {evaluations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl border border-slate-100 p-5"
          >
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Evaluation Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-emerald-600">{evaluations.length}</p>
                <p className="text-xs text-slate-500">Evaluated</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-600">
                  {evaluations.filter(e => e.recommendation === 'HIKE').length}
                </p>
                <p className="text-xs text-slate-500">Hire</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-amber-600">
                  {evaluations.filter(e => e.recommendation === 'MAYBE').length}
                </p>
                <p className="text-xs text-slate-500">Maybe</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-red-600">
                  {evaluations.filter(e => e.recommendation === 'REJECT').length}
                </p>
                <p className="text-xs text-slate-500">Reject</p>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1"
          >
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={14} className="text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-900">Candidates</h3>
              </div>
              <div className="space-y-2">
                {(interview?.candidates || []).map((c) => {
                  const existing = getExistingEvaluation(c.participant?.id || c.participantId);
                  const score = existing ? getCandidateScore(existing) : null;
                  const isSelected = selectedCandidate?.participant?.id === (c.participant?.id || c.participantId);

                  return (
                    <button
                      key={c.participant?.id || c.participantId}
                      onClick={() => setSelectedCandidate(c)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'bg-emerald-50 border border-emerald-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                          isSelected ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {c.participant?.name?.[0] || '?'}
                        </div>
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {c.participant?.name || 'Unknown'}
                        </span>
                      </div>
                      {existing ? (
                        <div className="flex items-center gap-1">
                          <Star size={10} className="text-amber-400 fill-amber-400" />
                          <span className="text-xs font-medium text-slate-600">{score}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">Pending</span>
                      )}
                    </button>
                  );
                })}
                {(!interview?.candidates || interview.candidates.length === 0) && (
                  <div className="text-center py-6">
                    <Users size={24} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No candidates assigned</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-3"
          >
            {selectedCandidate ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                {getExistingEvaluation(selectedCandidate.participant?.id || selectedCandidate.participantId) ? (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <FileText size={14} className="text-slate-600" />
                      <h3 className="text-sm font-semibold text-slate-900">Existing Evaluation</h3>
                    </div>
                    {(() => {
                      const eval_ = getExistingEvaluation(selectedCandidate.participant?.id || selectedCandidate.participantId);
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {eval_.communicationRating > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs text-slate-500">Communication</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} size={12} className={s <= eval_.communicationRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {eval_.technicalRating > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs text-slate-500">Technical</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} size={12} className={s <= eval_.technicalRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {eval_.codingRating > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs text-slate-500">Coding</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} size={12} className={s <= eval_.codingRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {eval_.problemSolvingRating > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs text-slate-500">Problem Solving</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} size={12} className={s <= eval_.problemSolvingRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {eval_.confidenceRating > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs text-slate-500">Confidence</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} size={12} className={s <= eval_.confidenceRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {eval_.behaviorRating > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs text-slate-500">Behavior</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} size={12} className={s <= eval_.behaviorRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {eval_.remarks && (
                            <div className="bg-slate-50 rounded-xl p-3">
                              <p className="text-xs text-slate-500 mb-1">Remarks</p>
                              <p className="text-xs text-slate-700">{eval_.remarks}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">
                      Evaluate {selectedCandidate.participant?.name || 'Candidate'}
                    </h3>
                    <EvaluationForm
                      interviewId={interviewId}
                      participantId={selectedCandidate.participant?.id || selectedCandidate.participantId}
                      participantName={selectedCandidate.participant?.name || 'Candidate'}
                      onSubmit={handleSubmitEvaluation}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                <Star size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">Select a candidate to evaluate</p>
                <p className="text-xs text-slate-400 mt-1">Choose from the candidates list on the left</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
