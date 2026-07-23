import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, UserPlus, Check, Users } from 'lucide-react';
import { useTrainers } from '../hooks/useTrainers';
import { useToast } from '../../../components/Toast';
import interviewApi from '../api';
import Spinner from '../../../components/ui/Spinner';

export default function AssignHRModal({ isOpen, onClose, interview, onAssigned }) {
  const { trainers, loading: trainersLoading } = useTrainers();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const currentTrainerIds = useMemo(() => {
    if (!interview?.trainers) return [];
    return interview.trainers.map(t => t.trainerId || t.trainer?.id).filter(Boolean);
  }, [interview]);

  const filteredTrainers = useMemo(() => {
    return trainers.filter(t =>
      !currentTrainerIds.includes(t.id) && (
        t.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [trainers, search, currentTrainerIds]);

  const currentTrainers = useMemo(() => {
    return trainers.filter(t => currentTrainerIds.includes(t.id));
  }, [trainers, currentTrainerIds]);

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleAssign = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      await interviewApi.assignTrainers(interview.id, selectedIds);
      toast.success(`${selectedIds.length} trainer(s) assigned successfully`);
      setSelectedIds([]);
      setSearch('');
      onAssigned?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to assign trainers');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedIds([]);
    setSearch('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1400] flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <UserPlus size={16} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Assign HR / Trainer</h2>
                  <p className="text-[11px] text-slate-500">{interview?.title}</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {currentTrainers.length > 0 && (
              <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50">
                <p className="text-[11px] font-medium text-slate-500 mb-2">Currently Assigned</p>
                <div className="flex flex-wrap gap-1.5">
                  {currentTrainers.map(t => (
                    <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-medium">
                      <Check size={10} />
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 pt-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search trainers by name or email..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {trainersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size={20} />
                </div>
              ) : filteredTrainers.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">
                    {search ? 'No trainers match your search' : 'All trainers are already assigned'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredTrainers.map(t => {
                    const isSelected = selectedIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleSelect(t.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                          isSelected
                            ? 'bg-emerald-50 border border-emerald-200'
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isSelected ? <Check size={12} /> : t.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{t.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{t.email}</p>
                        </div>
                        {t.phone && (
                          <span className="text-[10px] text-slate-400">{t.phone}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] text-slate-400">
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select trainers to assign'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={selectedIds.length === 0 || submitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Spinner size={12} className="text-white" />
                  ) : (
                    <UserPlus size={12} />
                  )}
                  {submitting ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
