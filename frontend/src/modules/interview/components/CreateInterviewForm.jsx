import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, Users, Settings,
  CheckCircle, Link2, Search, Eye
} from 'lucide-react';
import { INTERVIEW_TYPES, FEATURES } from '../constants';
import Spinner from '../../../components/ui/Spinner';

const STEPS = [
  { key: 'details', label: 'Details', icon: Settings },
  { key: 'scheduling', label: 'Scheduling', icon: Calendar },
  { key: 'participants', label: 'Participants', icon: Users },
  { key: 'features', label: 'Features', icon: Link2 },
  { key: 'review', label: 'Review', icon: Eye },
];

function Toggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-slate-200'}`}
    >
      <motion.div
        animate={{ x: enabled ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm"
      />
    </button>
  );
}

export default function CreateInterviewForm({ onSubmit, onCancel, loading, trainers = [], participants = [], loadingUsers = false }) {
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    interviewType: 'TECHNICAL',
    durationMinutes: 60,
    password: '',
    maxParticipants: 10,
    scheduledDate: '',
    scheduledTime: '',
    timezone: 'Asia/Kolkata',
    trainerIds: [],
    participantIds: [],
    recordingEnabled: true,
    screenShareEnabled: true,
    whiteboardEnabled: false,
    chatEnabled: true,
    resumeViewerEnabled: true,
    notesEnabled: true,
    mobileCameraEnabled: false,
    qrVerificationEnabled: false,
    aiSummaryEnabled: false,
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleTrainer = (id) => {
    setForm(prev => ({
      ...prev,
      trainerIds: prev.trainerIds.includes(id)
        ? prev.trainerIds.filter(t => t !== id)
        : [...prev.trainerIds, id],
    }));
  };

  const toggleParticipant = (id) => {
    setForm(prev => ({
      ...prev,
      participantIds: prev.participantIds.includes(id)
        ? prev.participantIds.filter(p => p !== id)
        : [...prev.participantIds, id],
    }));
  };

  const filteredParticipants = participants.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const canNext = () => {
    if (step === 0) return form.title.trim() && form.interviewType && form.durationMinutes > 0;
    if (step === 1) return form.scheduledDate && form.scheduledTime;
    if (step === 2) return form.trainerIds.length > 0 || form.participantIds.length > 0;
    return true;
  };

  const handleSubmit = () => {
    onSubmit({
      ...form,
      scheduledAt: new Date(`${form.scheduledDate}T${form.scheduledTime}`).toISOString(),
    });
  };

  const selectedType = INTERVIEW_TYPES.find(t => t.value === form.interviewType);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-semibold text-slate-900">Create New Interview</h2>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                i < step ? 'bg-emerald-600 text-white' :
                i === step ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' :
                'bg-slate-100 text-slate-400'
              }`}>
                {i < step ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-slate-900' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 rounded-full ${i < step ? 'bg-emerald-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="min-h-[320px]">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="e.g. Frontend Developer Interview"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Brief description of the interview..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Interview Type *</label>
                  <select
                    value={form.interviewType}
                    onChange={(e) => update('interviewType', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {INTERVIEW_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Duration (minutes) *</label>
                  <input
                    type="number"
                    value={form.durationMinutes}
                    onChange={(e) => update('durationMinutes', parseInt(e.target.value) || 0)}
                    min={15}
                    max={480}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Room Password (optional)</label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                    placeholder="Leave empty for no password"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Max Participants</label>
                  <input
                    type="number"
                    value={form.maxParticipants}
                    onChange={(e) => update('maxParticipants', parseInt(e.target.value) || 1)}
                    min={2}
                    max={50}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="scheduling"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Date *</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => update('scheduledDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Time *</label>
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={(e) => update('scheduledTime', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Timezone</label>
                <div className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                  {form.timezone}
                </div>
              </div>
              {form.scheduledDate && form.scheduledTime && (
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-emerald-700">Scheduled for</p>
                  <p className="text-sm font-semibold text-emerald-900">
                    {new Date(`${form.scheduledDate}T${form.scheduledTime}`).toLocaleString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                    })}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="participants"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-medium text-slate-700 mb-2 block">Trainers</label>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-slate-200 rounded-xl p-2">
                  {loadingUsers ? (
                    <div className="flex items-center gap-2 px-2 py-3">
                      <Spinner size={14} />
                      <span className="text-xs text-slate-400">Loading trainers...</span>
                    </div>
                  ) : trainers.length === 0 ? (
                    <p className="text-xs text-slate-400 px-2">No approved trainers found in the system</p>
                  ) : (
                    trainers.map(t => (
                      <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.trainerIds.includes(t.id)}
                          onChange={() => toggleTrainer(t.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-slate-700 block truncate">{t.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{t.email}{t.phone ? ` · ${t.phone}` : ''}</span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-2 block">Participants</label>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search participants..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2">
                  {loadingUsers ? (
                    <div className="flex items-center gap-2 px-2 py-3">
                      <Spinner size={14} />
                      <span className="text-xs text-slate-400">Loading participants...</span>
                    </div>
                  ) : filteredParticipants.length === 0 ? (
                    <p className="text-xs text-slate-400 px-2">{search ? 'No participants match your search' : 'No approved participants found in the system'}</p>
                  ) : (
                    filteredParticipants.map(p => (
                      <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.participantIds.includes(p.id)}
                          onChange={() => toggleParticipant(p.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="text-xs font-medium text-slate-700 block">{p.name}</span>
                          <span className="text-[10px] text-slate-400">{p.email}{p.phone ? ` · ${p.phone}` : ''}</span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{form.participantIds.length} selected</p>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="features"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {FEATURES.map(f => (
                <div key={f.key} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50">
                  <div>
                    <p className="text-xs font-medium text-slate-900">{f.label}</p>
                  </div>
                  <Toggle
                    enabled={form[f.key]}
                    onChange={(val) => update(f.key, val)}
                  />
                </div>
              ))}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{form.title}</p>
                    <p className="text-xs text-slate-500">{form.description || 'No description'}</p>
                  </div>
                  <button onClick={() => setStep(0)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Edit</button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-700">{selectedType?.label}</span></div>
                  <div><span className="text-slate-500">Duration:</span> <span className="font-medium text-slate-700">{form.durationMinutes} min</span></div>
                  <div><span className="text-slate-500">Date:</span> <span className="font-medium text-slate-700">{form.scheduledDate || '-'}</span></div>
                  <div><span className="text-slate-500">Time:</span> <span className="font-medium text-slate-700">{form.scheduledTime || '-'}</span></div>
                  <button onClick={() => setStep(1)} className="text-emerald-600 hover:text-emerald-700 font-medium">Edit Schedule</button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-900">Participants</p>
                  <button onClick={() => setStep(2)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Edit</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.trainerIds.map(id => {
                    const t = trainers.find(tr => tr.id === id);
                    return t ? (
                      <span key={id} className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">
                        {t.name} (Trainer)
                      </span>
                    ) : null;
                  })}
                  {form.participantIds.map(id => {
                    const p = participants.find(pp => pp.id === id);
                    return p ? (
                      <span key={id} className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium">
                        {p.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-900">Features</p>
                  <button onClick={() => setStep(3)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Edit</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FEATURES.filter(f => form[f.key]).map(f => (
                    <span key={f.key} className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium">
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>

              {form.password && (
                <div className="bg-amber-50 rounded-xl p-3 flex items-center gap-2">
                  <Link2 size={14} className="text-amber-600" />
                  <p className="text-xs text-amber-700">Room is password protected</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : onCancel()}
          className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
        >
          <ChevronLeft size={14} />
          {step === 0 ? 'Cancel' : 'Previous'}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Interview'}
            <CheckCircle size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
