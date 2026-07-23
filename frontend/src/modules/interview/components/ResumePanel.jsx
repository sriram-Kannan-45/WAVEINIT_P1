import { FileText } from 'lucide-react';

export default function ResumePanel({ participant }) {
  if (!participant) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8">
        <FileText size={32} className="text-white/20 mb-2" />
        <p className="text-xs text-white/40">No participant selected</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div className="bg-white/5 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-white mb-1">Candidate</h4>
        <p className="text-sm text-white/90">{participant.name}</p>
        <p className="text-xs text-white/50">{participant.email}</p>
      </div>
      <div className="bg-white/5 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-white mb-1">Resume</h4>
        <p className="text-xs text-white/50">Resume will be available here once uploaded to the profile.</p>
      </div>
    </div>
  );
}
