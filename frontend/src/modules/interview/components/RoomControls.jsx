import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff,
  Circle, MessageSquare, StickyNote, FileText, PenTool,
  PhoneOff, Hand, MoreHorizontal, X
} from 'lucide-react';
import { useState } from 'react';

const controlVariants = {
  tap: { scale: 0.92 },
  hover: { scale: 1.05 },
};

function ControlButton({ icon: Icon, label, active, danger, onClick, badge, className = '' }) {
  return (
    <motion.button
      variants={controlVariants}
      whileTap="tap"
      whileHover="hover"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 group ${className}`}
    >
      <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center transition-all ${
        danger ? 'bg-red-500 hover:bg-red-600 text-white' :
        active ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
        'bg-slate-100 hover:bg-slate-200 text-slate-600'
      }`}>
        <Icon size={18} />
        {badge && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[9px] font-bold text-white">{badge}</span>
          </div>
        )}
      </div>
      <span className="text-[10px] text-slate-500 hidden lg:block">{label}</span>
    </motion.button>
  );
}

export default function RoomControls({
  isMuted, isCameraOff, isScreenSharing, isRecording, isChatOpen,
  isSidePanelOpen, activeSideTab, onToggleMic, onToggleCamera,
  onToggleScreenShare, onToggleRecording, onToggleChat,
  onOpenSidePanel, onRaiseHand, onEndCall, isTrainer, handRaised, features = {}
}) {
  const [showMore, setShowMore] = useState(false);

  const secondaryControls = [
    features.chatEnabled && { icon: MessageSquare, label: 'Chat', active: activeSideTab === 'chat', onClick: () => onOpenSidePanel('chat') },
    features.notesEnabled && { icon: StickyNote, label: 'Notes', active: activeSideTab === 'notes', onClick: () => onOpenSidePanel('notes') },
    features.resumeViewerEnabled && { icon: FileText, label: 'Resume', active: activeSideTab === 'resume', onClick: () => onOpenSidePanel('resume') },
    features.whiteboardEnabled && { icon: PenTool, label: 'Whiteboard', active: false, onClick: () => {} },
  ].filter(Boolean);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="bg-white/80 backdrop-blur-xl border-t border-slate-100 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            <ControlButton
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? 'Unmute' : 'Mute'}
              active={!isMuted}
              onClick={onToggleMic}
            />
            <ControlButton
              icon={isCameraOff ? CameraOff : Camera}
              label={isCameraOff ? 'Start Video' : 'Stop Video'}
              active={!isCameraOff}
              onClick={onToggleCamera}
            />
            <ControlButton
              icon={isScreenSharing ? MonitorOff : Monitor}
              label={isScreenSharing ? 'Stop Share' : 'Share Screen'}
              active={isScreenSharing}
              onClick={onToggleScreenShare}
            />
          </div>

          <div className="hidden md:flex items-center gap-2 lg:gap-3">
            {features.recordingEnabled && (
              <ControlButton
                icon={Circle}
                label={isRecording ? 'Stop Rec' : 'Record'}
                active={isRecording}
                onClick={onToggleRecording}
              />
            )}
            {secondaryControls.slice(0, 3).map((ctrl, i) => (
              <ControlButton
                key={i}
                icon={ctrl.icon}
                label={ctrl.label}
                active={ctrl.active}
                onClick={ctrl.onClick}
              />
            ))}
            {secondaryControls.length > 3 && (
              <div className="relative">
                <ControlButton
                  icon={MoreHorizontal}
                  label="More"
                  active={showMore}
                  onClick={() => setShowMore(!showMore)}
                />
                <AnimatePresence>
                  {showMore && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-slate-100 py-2 min-w-[140px]"
                    >
                      {secondaryControls.slice(3).map((ctrl, i) => (
                        <button
                          key={i}
                          onClick={() => { ctrl.onClick(); setShowMore(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <ctrl.icon size={14} /> {ctrl.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex md:hidden items-center gap-2">
            {features.recordingEnabled && (
              <ControlButton icon={Circle} label="" active={isRecording} onClick={onToggleRecording} />
            )}
            <div className="relative">
              <ControlButton icon={MoreHorizontal} label="" active={showMore} onClick={() => setShowMore(!showMore)} />
              <AnimatePresence>
                {showMore && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full mb-2 right-0 bg-white rounded-xl shadow-lg border border-slate-100 py-2 min-w-[140px]"
                  >
                    {secondaryControls.map((ctrl, i) => (
                      <button
                        key={i}
                        onClick={() => { ctrl.onClick(); setShowMore(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <ctrl.icon size={14} /> {ctrl.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={onRaiseHand}
              className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center transition-all ${
                handRaised ? 'bg-amber-400 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <motion.div
                animate={handRaised ? { rotate: [0, -15, 15, -15, 0] } : {}}
                transition={{ duration: 0.5, repeat: handRaised ? Infinity : 0, repeatDelay: 2 }}
              >
                <Hand size={18} />
              </motion.div>
            </motion.button>

            {isTrainer && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.05 }}
                onClick={onEndCall}
                className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all"
              >
                <PhoneOff size={18} />
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
