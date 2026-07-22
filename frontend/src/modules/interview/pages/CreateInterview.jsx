import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import interviewApi from '../api';
import CreateInterviewForm from '../components/CreateInterviewForm';

export default function CreateInterview({ user, onTabChange }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (data) => {
    setSubmitting(true);
    setError(null);
    try {
      await interviewApi.create(data);
      setSuccess(true);
      setTimeout(() => {
        onTabChange?.('interview-dashboard');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to create interview');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <button
            onClick={() => onTabChange?.('interview-dashboard')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={16} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Create Interview</h1>
            <p className="text-xs text-slate-500">Set up a new interview session</p>
          </div>
        </motion.div>

        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3"
          >
            <CheckCircle size={20} className="text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Interview created successfully</p>
              <p className="text-xs text-emerald-600">Redirecting to dashboard...</p>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3"
          >
            <AlertCircle size={20} className="text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">Failed to create interview</p>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-100 p-5"
        >
          <CreateInterviewForm onSubmit={handleSubmit} submitting={submitting} />
        </motion.div>
      </div>
    </div>
  );
}
