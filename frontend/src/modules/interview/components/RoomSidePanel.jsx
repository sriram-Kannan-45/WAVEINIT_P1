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
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="h-full w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => {}}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-white/50 hover:bg-white/10 hover:text-white/70'
                  }`}
                >
                  <tab.icon size={13} />
                  <span className="hidden lg:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={14} className="text-white/50" />
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
                <ClipboardCheck size={32} className="text-white/20 mb-2" />
                <p className="text-xs text-white/40">Select a participant to evaluate</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
