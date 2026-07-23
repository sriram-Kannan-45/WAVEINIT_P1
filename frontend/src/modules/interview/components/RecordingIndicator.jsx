import { Circle } from 'lucide-react';

export default function RecordingIndicator({ isRecording, className = '' }) {
  if (!isRecording) return null;
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 bg-red-500/20 rounded-lg ${className}`}>
      <Circle size={8} className="text-red-400 fill-red-400 animate-pulse" />
      <span className="text-xs font-semibold text-red-400">REC</span>
    </div>
  );
}
