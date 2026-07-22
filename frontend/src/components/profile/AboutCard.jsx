import { useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Save, X, FileText, Plus } from 'lucide-react';

export default function AboutCard({ about, isOwn, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(about || '');

  const handleSave = async () => {
    await onSave({ about: text });
    setEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={16} style={{ color: '#16A34A' }} />
          </div>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#111827',
            fontFamily: "'Poppins', sans-serif", margin: 0,
          }}>
            About
          </h3>
        </div>
        {isOwn && !editing && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setText(about || ''); setEditing(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#F8FAFC', border: '1px solid #E5E7EB', color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <Pencil size={12} /> Edit
          </motion.button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={1000}
            rows={5}
            style={{
              width: '100%', padding: 14, borderRadius: 12,
              border: '1px solid #E5E7EB', fontSize: 14, color: '#334155',
              resize: 'vertical', fontFamily: "'Poppins', sans-serif",
              lineHeight: 1.7, outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#22C55E'}
            onBlur={e => e.target.style.borderColor = '#E5E7EB'}
            placeholder="Tell others about yourself..."
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{text.length}/1000</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setEditing(false)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: '#F8FAFC', border: '1px solid #E5E7EB', color: '#64748B',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <X size={12} /> Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                  border: 'none', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                }}
              >
                <Save size={12} /> Save
              </motion.button>
            </div>
          </div>
        </div>
      ) : (
        about ? (
          <p style={{
            fontSize: 14, color: '#475569', lineHeight: 1.7, margin: 0,
            whiteSpace: 'pre-wrap',
          }}>
            {about}
          </p>
        ) : (
          <div style={{
            textAlign: 'center', padding: '32px 20px',
            background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
            borderRadius: 12, border: '1px dashed #E5E7EB',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <FileText size={22} style={{ color: '#16A34A' }} />
            </div>
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 4px', fontWeight: 500 }}>
              No bio added yet.
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
              Tell others about your expertise and experience.
            </p>
            {isOwn && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setText(''); setEditing(true); }}
                style={{
                  marginTop: 12, padding: '8px 18px', borderRadius: 10,
                  fontSize: 12, fontWeight: 600,
                  background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                  border: 'none', color: '#fff', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                }}
              >
                <Plus size={14} /> Add Bio
              </motion.button>
            )}
          </div>
        )
      )}
    </motion.div>
  );
}
