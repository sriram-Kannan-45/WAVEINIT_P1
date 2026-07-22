import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, StickyNote, FileText, ClipboardCheck } from 'lucide-react';
import ChatPanel from './ChatPanel';
import NotesPanel from './NotesPanel';
import ResumePanel from './ResumePanel';
import EvaluationForm from './EvaluationForm';

const TABS = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'resume', label: 'Resume', icon: FileText },
  { key: 'evaluation', label: 'Eval', icon: ClipboardCheck },
];

export default function RoomSidePanel({
  isOpen, activeTab, onClose, interviewId, userId,
  messages, onSendMessage, selectedParticipant,
  evaluatingParticipant, onSubmitEvaluation
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="h-full bg-white border-l border-slate-100 flex flex-col overflow-hidden flex-shrink-0"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <tab.icon size={13} />
                  <span className="hidden lg:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={14} className="text-slate-400" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' && (
              <ChatPanel
                messages={messages}
                onSend={onSendMessage}
                currentUserId={userId}
              />
            )}
            {activeTab === 'notes' && (
              <NotesPanel
                interviewId={interviewId}
                userId={userId}
              />
            )}
            {activeTab === 'resume' && (
              <ResumePanel
                participant={selectedParticipant}
              />
            )}
            {activeTab === 'evaluation' && evaluatingParticipant && (
              <div className="p-3">
                <EvaluationForm
                  interviewId={interviewId}
                  participantId={evaluatingParticipant.id}
                  participantName={evaluatingParticipant.name}
                  onSubmit={onSubmitEvaluation}
                />
              </div>
            )}
            {activeTab === 'evaluation' && !evaluatingParticipant && (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <ClipboardCheck size={32} className="text-slate-300 mb-2" />
                <p className="text-xs text-slate-500">Select a participant to evaluate</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
