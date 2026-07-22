import { motion } from 'framer-motion';
import { Video, Calendar, Clock, CheckCircle, XCircle } from 'lucide-react';

const statConfig = [
  { key: 'total', label: 'Total Interviews', icon: Video, gradient: 'from-blue-500 to-blue-600' },
  { key: 'scheduled', label: 'Scheduled', icon: Calendar, gradient: 'from-emerald-500 to-emerald-600' },
  { key: 'live', label: 'Live Now', icon: Clock, gradient: 'from-amber-500 to-orange-500', pulse: true },
  { key: 'completed', label: 'Completed', icon: CheckCircle, gradient: 'from-slate-500 to-slate-600' },
  { key: 'cancelled', label: 'Cancelled', icon: XCircle, gradient: 'from-red-400 to-red-500' },
];

export default function InterviewStats({ stats = {} }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {statConfig.map((s, idx) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center`}>
              <s.icon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats[s.key] || 0}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
