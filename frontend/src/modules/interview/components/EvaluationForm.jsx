import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, ThumbsUp, Minus, ThumbsDown, Send } from 'lucide-react';

const CATEGORIES = [
  { key: 'communicationRating', label: 'Communication' },
  { key: 'technicalRating', label: 'Technical Knowledge' },
  { key: 'codingRating', label: 'Coding' },
  { key: 'problemSolvingRating', label: 'Problem Solving' },
  { key: 'confidenceRating', label: 'Confidence' },
  { key: 'behaviorRating', label: 'Behaviour' },
];

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} type="button" onClick={() => onChange(star)} className="focus:outline-none">
          <Star size={18} className={`transition-colors ${star <= value ? 'text-amber-400 fill-amber-400' : 'text-white/20'}`} />
        </button>
      ))}
    </div>
  );
}

export default function EvaluationForm({ interviewId, participantId, participantName, onSubmit }) {
  const [form, setForm] = useState({
    communicationRating: 0, technicalRating: 0, codingRating: 0,
    problemSolvingRating: 0, confidenceRating: 0, behaviorRating: 0,
    recommendation: 'MAYBE', remarks: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const updateRating = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ ...form, participantId });
    } finally {
      setSubmitting(false);
    }
  };

  const avg = Object.values(form).filter(v => typeof v === 'number' && v > 0);
  const overall = avg.length > 0 ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : '0.0';

  return (
    <div className="space-y-4">
      <div className="bg-emerald-500/10 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-emerald-400 font-medium">Evaluating</p>
          <p className="text-sm font-semibold text-white">{participantName}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-emerald-400">{overall}</p>
          <p className="text-[10px] text-white/50">Overall</p>
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map(cat => (
          <div key={cat.key} className="flex items-center justify-between">
            <span className="text-xs text-white/70">{cat.label}</span>
            <StarRating value={form[cat.key]} onChange={(v) => updateRating(cat.key, v)} />
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-white/70 mb-1 block">Recommendation</label>
        <div className="flex gap-2">
          {[
            { value: 'HIKE', label: 'Hire', icon: ThumbsUp, color: 'emerald' },
            { value: 'MAYBE', label: 'Maybe', icon: Minus, color: 'amber' },
            { value: 'REJECT', label: 'Reject', icon: ThumbsDown, color: 'red' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(prev => ({ ...prev, recommendation: opt.value }))}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-all ${
                form.recommendation === opt.value
                  ? opt.color === 'emerald' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : opt.color === 'amber' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
            >
              <opt.icon size={14} /> {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-white/70 mb-1 block">Remarks</label>
        <textarea
          value={form.remarks}
          onChange={(e) => setForm(prev => ({ ...prev, remarks: e.target.value }))}
          placeholder="Add remarks about the candidate..."
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || avg.length < 3}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <Send size={14} /> {submitting ? 'Submitting...' : 'Submit Evaluation'}
      </button>
    </div>
  );
}
