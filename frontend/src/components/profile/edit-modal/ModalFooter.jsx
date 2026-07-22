import { motion } from 'framer-motion';
import { X, Save, Loader2 } from 'lucide-react';

export default function ModalFooter({ onCancel, onSave, saving }) {
  return (
    <div
      className="flex items-center justify-end gap-3 px-8 py-5 border-t border-slate-100"
      style={{ borderTopWidth: '1px', borderTopColor: '#E5E7EB' }}
    >
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onCancel}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
      >
        <X size={16} />
        Cancel
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white rounded-xl transition-all duration-200"
        style={{
          background: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)',
        }}
      >
        {saving ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save size={16} />
            Save Changes
          </>
        )}
      </motion.button>
    </div>
  );
}
