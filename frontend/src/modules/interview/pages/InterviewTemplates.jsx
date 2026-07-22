import { motion } from 'framer-motion';
import { Layout, Plus, Clock, Circle, Monitor, PenTool, MessageSquare, FileText, StickyNote, Smartphone, QrCode, Brain } from 'lucide-react';
import { INTERVIEW_TYPES } from '../constants';

const TEMPLATES = [
  { id: 1, name: 'Technical Screening', type: 'TECHNICAL', duration: 45, description: 'Standard technical interview with coding assessment', features: { recordingEnabled: true, screenShareEnabled: true, chatEnabled: true } },
  { id: 2, name: 'HR Round', type: 'HR', duration: 30, description: 'Initial HR screening interview', features: { recordingEnabled: true, chatEnabled: true, resumeViewerEnabled: true } },
  { id: 3, name: 'Behavioral Assessment', type: 'BEHAVIORAL', duration: 40, description: 'Behavioral competency-based interview', features: { recordingEnabled: true, notesEnabled: true, chatEnabled: true } },
  { id: 4, name: 'Live Coding', type: 'CODING', duration: 60, description: 'Live coding session with screen share', features: { screenShareEnabled: true, recordingEnabled: true, whiteboardEnabled: true, chatEnabled: true } },
  { id: 5, name: 'System Design', type: 'SYSTEM_DESIGN', duration: 60, description: 'Architecture and system design discussion', features: { whiteboardEnabled: true, screenShareEnabled: true, recordingEnabled: true, notesEnabled: true } },
  { id: 6, name: 'Full-Stack Evaluation', type: 'TECHNICAL', duration: 90, description: 'Comprehensive full-stack developer assessment', features: { recordingEnabled: true, screenShareEnabled: true, whiteboardEnabled: true, chatEnabled: true, mobileCameraEnabled: true, qrVerificationEnabled: true } },
];

const FEATURE_ICONS = {
  recordingEnabled: Circle,
  screenShareEnabled: Monitor,
  whiteboardEnabled: PenTool,
  chatEnabled: MessageSquare,
  resumeViewerEnabled: FileText,
  notesEnabled: StickyNote,
  mobileCameraEnabled: Smartphone,
  qrVerificationEnabled: QrCode,
  aiSummaryEnabled: Brain,
};

const FEATURE_LABELS = {
  recordingEnabled: 'Recording',
  screenShareEnabled: 'Screen Share',
  whiteboardEnabled: 'Whiteboard',
  chatEnabled: 'Chat',
  resumeViewerEnabled: 'Resume Viewer',
  notesEnabled: 'Notes',
  mobileCameraEnabled: 'Mobile Camera',
  qrVerificationEnabled: 'QR Verification',
  aiSummaryEnabled: 'AI Summary',
};

export default function InterviewTemplates({ user, onTabChange }) {
  const handleUseTemplate = (template) => {
    onTabChange?.('interview-create', { template });
  };

  const handleCreateTemplate = () => {
    alert('Template creation coming soon');
  };

  const getTypeColor = (type) => {
    const t = INTERVIEW_TYPES.find(t => t.value === type);
    return t?.color || 'slate';
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
            <h1 className="text-lg font-bold text-slate-900">Interview Templates</h1>
            <p className="text-xs text-slate-500 mt-0.5">Pre-configured interview setups</p>
          </div>
          <button
            onClick={handleCreateTemplate}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            <Plus size={14} />
            Create Template
          </button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((template, idx) => {
            const typeColor = getTypeColor(template.type);
            const featureEntries = Object.entries(template.features).filter(([, v]) => v);

            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{template.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: typeColor === 'blue' ? '#EFF6FF' : typeColor === 'purple' ? '#F5F3FF' : typeColor === 'emerald' ? '#F0FDF4' : typeColor === 'amber' ? '#FFFBEB' : '#FEF2F2',
                      color: typeColor === 'blue' ? '#2563EB' : typeColor === 'purple' ? '#7C3AED' : typeColor === 'emerald' ? '#059669' : typeColor === 'amber' ? '#D97706' : '#DC2626',
                    }}
                  >
                    {INTERVIEW_TYPES.find(t => t.value === template.type)?.label || template.type}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock size={10} />
                    {template.duration}m
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4 flex-1">
                  {featureEntries.map(([key]) => {
                    const Icon = FEATURE_ICONS[key] || Circle;
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 rounded-lg text-[10px] text-slate-600"
                      >
                        <Icon size={10} />
                        {FEATURE_LABELS[key] || key}
                      </span>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleUseTemplate(template)}
                  className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Use Template
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
