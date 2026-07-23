import { useState } from 'react';
import { StickyNote, Save } from 'lucide-react';

export default function NotesPanel({ interviewId, userId }) {
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const key = `interview_notes_${interviewId}_${userId}`;
    localStorage.setItem(key, notes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Take notes during the interview..."
          className="w-full h-full min-h-[200px] p-3 text-sm text-white bg-white/10 border border-white/10 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-white/40"
        />
      </div>
      <div className="p-3 border-t border-white/10 flex items-center justify-between">
        <span className="text-xs text-white/40">
          {saved ? 'Saved!' : 'Notes are saved locally'}
        </span>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg transition-colors"
        >
          <Save size={12} /> Save
        </button>
      </div>
    </div>
  );
}
